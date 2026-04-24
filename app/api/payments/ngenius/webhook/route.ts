import { NextResponse } from "next/server";
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

function headersToJson(headers: Headers) {
  const output: Record<string, string> = {};
  headers.forEach((value, key) => {
    output[key] = value;
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
  const eventId =
    typeof payload.eventId === "string"
      ? payload.eventId
      : typeof payload.id === "string"
        ? payload.id
        : null;

  const supabase = createAdminSupabaseClient();
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
      headers: headersToJson(request.headers),
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

  await supabase.from("payment_jobs").insert({
    kind: "ngenius_webhook",
    payment_event_id: paymentEvent.id,
    payment_attempt_id: attempt?.id ?? null,
    booking_intent_id: attempt?.booking_intent_id ?? null
  });

  return NextResponse.json({ ok: true }, { status: 201 });
}
