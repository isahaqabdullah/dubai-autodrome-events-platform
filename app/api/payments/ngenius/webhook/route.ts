import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { getNgeniusConfig } from "@/lib/env";
import { getClientIp } from "@/lib/request";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import {
  decryptNgeniusWebhookBody,
  getWebhookEventName,
  getWebhookOrderReference
} from "@/services/ngenius";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function isAllowedIp(sourceIp: string | null, allowedIps?: string) {
  if (!allowedIps?.trim()) {
    return true;
  }

  if (!sourceIp) {
    return false;
  }

  return allowedIps
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .includes(sourceIp);
}

const SENSITIVE_HEADER_NAMES = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "proxy-authorization",
  "x-api-key"
]);

function stableWebhookEventId(input: {
  payload: Record<string, unknown>;
  eventName: string | null;
  orderReference: string | null;
  rawBody: string;
}) {
  const explicitId =
    typeof input.payload.eventId === "string"
      ? input.payload.eventId
      : typeof input.payload.id === "string"
        ? input.payload.id
        : null;

  if (explicitId) {
    return explicitId;
  }

  const digest = createHash("sha256").update(input.rawBody).digest("hex").slice(0, 32);
  return [
    input.orderReference ?? "unknown-order",
    input.eventName ?? "unknown-event",
    digest
  ].join(":");
}

function headersToJson(headers: Headers, secretHeaderName?: string) {
  const output: Record<string, string> = {};
  const configuredSecretHeader = secretHeaderName?.toLowerCase();

  headers.forEach((value, key) => {
    const normalizedKey = key.toLowerCase();
    output[key] = SENSITIVE_HEADER_NAMES.has(normalizedKey) || normalizedKey === configuredSecretHeader
      ? "[redacted]"
      : value;
  });
  return output;
}

export async function POST(request: Request) {
  const config = getNgeniusConfig();
  const sourceIp = getClientIp(request.headers);

  if (!isAllowedIp(sourceIp, config.webhookAllowedIps)) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  if (config.webhookHeaderName || config.webhookHeaderValue) {
    const headerValue = config.webhookHeaderName ? request.headers.get(config.webhookHeaderName) : null;
    if (!config.webhookHeaderName || !config.webhookHeaderValue || headerValue !== config.webhookHeaderValue) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
  }

  const rawBody = await request.text();
  const decryptedBody = config.webhookEncryptionKey
    ? decryptNgeniusWebhookBody(rawBody, config.webhookEncryptionKey)
    : rawBody;
  const payload = JSON.parse(decryptedBody) as Record<string, unknown>;
  const eventName = getWebhookEventName(payload);
  const orderReference = getWebhookOrderReference(payload);
  const eventId = stableWebhookEventId({ payload, eventName, orderReference, rawBody });

  const supabase = createAdminSupabaseClient({ noStore: true });
  const { data: attempt } = orderReference
    ? await supabase
      .from("payment_attempts")
      .select("id, booking_intent_id")
      .eq("ni_order_reference", orderReference)
      .maybeSingle()
    : { data: null };

  const { data: paymentEvent, error } = await supabase
    .from("payment_events")
    .upsert({
      provider: "ngenius",
      event_id: eventId,
      event_name: eventName,
      ni_order_reference: orderReference,
      payment_attempt_id: attempt?.id ?? null,
      booking_intent_id: attempt?.booking_intent_id ?? null,
      headers: headersToJson(request.headers, config.webhookHeaderName),
      payload,
      raw_body: rawBody,
      encrypted: Boolean(config.webhookEncryptionKey),
      source_ip: sourceIp
    }, {
      onConflict: "provider,event_id",
      ignoreDuplicates: false
    })
    .select("id")
    .single();

  if (error || !paymentEvent) {
    throw error ?? new Error("Unable to persist payment event.");
  }

  const { data: existingJobs, error: jobLookupError } = await supabase
    .from("payment_jobs")
    .select("id")
    .eq("payment_event_id", paymentEvent.id)
    .neq("status", "failed")
    .limit(1);

  if (jobLookupError) {
    throw jobLookupError;
  }

  if (!existingJobs?.length) {
    const { error: jobInsertError } = await supabase.from("payment_jobs").insert({
      kind: "ngenius_webhook",
      payment_event_id: paymentEvent.id,
      payment_attempt_id: attempt?.id ?? null,
      booking_intent_id: attempt?.booking_intent_id ?? null
    });

    if (jobInsertError && jobInsertError.code !== "23505") {
      throw jobInsertError;
    }
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
