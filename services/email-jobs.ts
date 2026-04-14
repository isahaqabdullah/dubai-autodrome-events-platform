import "server-only";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { EmailJobKind } from "@/lib/types";

/**
 * Run an email send inline with queue-row lifecycle tracking.
 *
 * Used for time-sensitive sends the user is waiting on (OTP verification)
 * and admin-triggered resends. The handler receives the job id so it can
 * forward it to sendMail as an idempotency key — retries inside the mailer
 * will hit the same key and Resend will dedupe.
 *
 * For async work (confirmation emails) use enqueueEmailJob + the worker
 * route instead; that path survives function timeouts.
 */
export async function executeEmailJob<TPayload extends Record<string, unknown>>(
  kind: EmailJobKind,
  payload: TPayload,
  handler: (job: { id: string }) => Promise<void>
) {
  const supabase = createAdminSupabaseClient();

  const { data: job, error: insertError } = await supabase
    .from("email_jobs")
    .insert({
      kind,
      payload,
      status: "processing",
      attempts: 1,
      locked_at: new Date().toISOString()
    })
    .select("id")
    .single();

  if (insertError || !job) {
    throw insertError ?? new Error("Unable to create email job.");
  }

  try {
    await handler({ id: job.id });
    await supabase
      .from("email_jobs")
      .update({ status: "sent", last_error: null, locked_at: null })
      .eq("id", job.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown email failure";
    console.error("[email-job] failed", {
      jobId: job.id,
      kind,
      payload,
      error: message
    });
    await supabase
      .from("email_jobs")
      .update({
        status: "failed",
        last_error: message,
        locked_at: null
      })
      .eq("id", job.id);
  }
}

/**
 * Queue an email for async processing by the cron worker. Returns
 * immediately after the INSERT so the API route doesn't block on Resend.
 *
 * The payload must carry everything the worker needs to build and send the
 * email (the worker has no request context to fall back on).
 */
export async function enqueueEmailJob<TPayload extends Record<string, unknown>>(
  kind: EmailJobKind,
  payload: TPayload
) {
  const supabase = createAdminSupabaseClient();

  const { data, error } = await supabase
    .from("email_jobs")
    .insert({
      kind,
      payload,
      status: "queued",
      attempts: 0
    })
    .select("id")
    .single();

  if (error || !data) {
    throw error ?? new Error("Unable to queue email job.");
  }

  return { id: data.id as string };
}
