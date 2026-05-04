import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function isAuthorized(request: Request) {
  if (!env.RESEND_WEBHOOK_SECRET) {
    return false;
  }

  const authorization = request.headers.get("authorization");
  const sharedSecret = request.headers.get("x-webhook-secret");
  return authorization === `Bearer ${env.RESEND_WEBHOOK_SECRET}` || sharedSecret === env.RESEND_WEBHOOK_SECRET;
}

function extractProviderMessageId(payload: Record<string, unknown>) {
  const data = payload.data && typeof payload.data === "object" ? payload.data as Record<string, unknown> : {};
  return (
    (typeof data.email_id === "string" && data.email_id) ||
    (typeof data.emailId === "string" && data.emailId) ||
    (typeof data.id === "string" && data.id) ||
    (typeof payload.email_id === "string" && payload.email_id) ||
    null
  );
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const payload = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!payload) {
    return NextResponse.json({ message: "Invalid webhook payload." }, { status: 400 });
  }

  const eventType = typeof payload.type === "string" ? payload.type.toLowerCase() : "";
  const providerMessageId = extractProviderMessageId(payload);

  if (!providerMessageId) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const nextStatus = eventType.includes("complain")
    ? "complained"
    : eventType.includes("bounce")
      ? "bounced"
      : null;

  if (!nextStatus) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const timestampColumn = nextStatus === "complained" ? "complained_at" : "bounced_at";
  const { error } = await createAdminSupabaseClient()
    .from("ticket_delivery_jobs")
    .update({
      status: nextStatus,
      [timestampColumn]: new Date().toISOString(),
      last_error: `Provider reported ${nextStatus}.`
    })
    .eq("provider_message_id", providerMessageId);

  if (error) {
    throw error;
  }

  return NextResponse.json({ ok: true });
}
