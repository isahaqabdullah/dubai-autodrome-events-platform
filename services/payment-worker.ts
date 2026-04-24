import "server-only";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import {
  getNgeniusOrder,
  getNgeniusOrderAmount,
  getWebhookOrderReference,
  interpretNgeniusOrder
} from "@/services/ngenius";
import { fulfillPaidBookingFromWorker } from "@/services/checkout";

type Supabase = ReturnType<typeof createAdminSupabaseClient>;

interface ClaimedPaymentJob {
  id: string;
  kind: string;
  payment_event_id: string | null;
  payment_attempt_id: string | null;
  booking_intent_id: string | null;
  attempts: number;
  attempts_max: number;
}

type PaymentAttemptRow = {
  id: string;
  booking_intent_id: string;
  ni_order_reference: string | null;
  amount_minor: number;
  currency_code: string;
  status: string;
};

async function finalizeJob(supabase: Supabase, jobId: string) {
  await supabase
    .from("payment_jobs")
    .update({ status: "done", locked_at: null, last_error: null })
    .eq("id", jobId);
}

async function failJob(supabase: Supabase, job: ClaimedPaymentJob, error: unknown) {
  const message = error instanceof Error ? error.message : "Payment job failed.";
  const exhausted = job.attempts >= job.attempts_max;
  await supabase
    .from("payment_jobs")
    .update({
      status: exhausted ? "failed" : "queued",
      locked_at: null,
      last_error: message
    })
    .eq("id", job.id);
}

async function resolveAttemptForJob(supabase: Supabase, job: ClaimedPaymentJob): Promise<PaymentAttemptRow | null> {
  if (job.payment_attempt_id) {
    const { data, error } = await supabase
      .from("payment_attempts")
      .select("*")
      .eq("id", job.payment_attempt_id)
      .single();
    if (error) throw error;
    return data as PaymentAttemptRow;
  }

  if (!job.payment_event_id) {
    return null;
  }

  const { data: event, error: eventError } = await supabase
    .from("payment_events")
    .select("payload, ni_order_reference")
    .eq("id", job.payment_event_id)
    .single();

  if (eventError) {
    throw eventError;
  }

  const orderReference =
    (event?.ni_order_reference as string | null) ??
    getWebhookOrderReference((event?.payload ?? {}) as Record<string, unknown>);

  if (!orderReference) {
    return null;
  }

  const { data, error } = await supabase
    .from("payment_attempts")
    .select("*")
    .eq("ni_order_reference", orderReference)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as PaymentAttemptRow | null;
}

async function processAttempt(supabase: Supabase, attempt: PaymentAttemptRow) {
  if (!attempt.ni_order_reference) {
    return;
  }

  const order = await getNgeniusOrder(attempt.ni_order_reference);
  const state = interpretNgeniusOrder(order);
  const amount = getNgeniusOrderAmount(order);

  await supabase
    .from("payment_attempts")
    .update({ last_order_status: order })
    .eq("id", attempt.id);

  if (amount.value !== attempt.amount_minor || amount.currencyCode !== attempt.currency_code) {
    const reason = "N-Genius amount or currency did not match the local booking.";
    await supabase.from("payment_attempts").update({
      status: "manual_action_required",
      last_error: reason
    }).eq("id", attempt.id);
    await supabase.from("booking_intents").update({
      status: "manual_action_required",
      manual_action_reason: reason
    }).eq("id", attempt.booking_intent_id);
    return;
  }

  if (state.kind === "paid") {
    await supabase.from("payment_attempts").update({
      status: "paid",
      last_error: null
    }).eq("id", attempt.id);
    await supabase.from("booking_intents").update({
      status: "paid",
      manual_action_reason: null
    }).eq("id", attempt.booking_intent_id);
    await fulfillPaidBookingFromWorker({
      bookingIntentId: attempt.booking_intent_id,
      paymentAttemptId: attempt.id
    });
    return;
  }

  if (state.kind === "failed" || state.kind === "cancelled") {
    await supabase.from("payment_attempts").update({
      status: state.kind === "cancelled" ? "cancelled" : "failed",
      last_error: state.state ? `N-Genius state: ${state.state}` : null
    }).eq("id", attempt.id);
    await supabase.from("booking_intents").update({
      status: "payment_failed"
    }).eq("id", attempt.booking_intent_id);
    return;
  }

  if (state.kind === "manual_review") {
    const reason = state.state ? `N-Genius manual review state: ${state.state}` : "N-Genius state requires manual review.";
    await supabase.from("payment_attempts").update({
      status: "manual_action_required",
      last_error: reason
    }).eq("id", attempt.id);
    await supabase.from("booking_intents").update({
      status: "manual_action_required",
      manual_action_reason: reason
    }).eq("id", attempt.booking_intent_id);
  }
}

export async function runPaymentWorker(limit = 10) {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase.rpc("claim_payment_jobs", {
    p_limit: limit,
    p_lock_ttl_seconds: 120
  });

  if (error) {
    throw error;
  }

  const jobs = (data ?? []) as ClaimedPaymentJob[];
  let processed = 0;
  let failed = 0;

  for (const job of jobs) {
    try {
      const attempt = await resolveAttemptForJob(supabase, job);
      if (attempt) {
        await processAttempt(supabase, attempt);
      }
      if (job.payment_event_id) {
        await supabase
          .from("payment_events")
          .update({ processed_at: new Date().toISOString(), processing_error: null })
          .eq("id", job.payment_event_id);
      }
      await finalizeJob(supabase, job.id);
      processed += 1;
    } catch (error) {
      failed += 1;
      if (job.payment_event_id) {
        await supabase
          .from("payment_events")
          .update({ processing_error: error instanceof Error ? error.message : "Payment processing failed." })
          .eq("id", job.payment_event_id);
      }
      await failJob(supabase, job, error);
    }
  }

  return { claimed: jobs.length, processed, failed };
}

export async function runPaymentReconcile() {
  const supabase = createAdminSupabaseClient();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("payment_attempts")
    .select("*")
    .or(`created_at.gte.${since},status.eq.paid`)
    .in("status", ["order_create_pending", "payment_pending", "paid", "manual_action_required"])
    .limit(50);

  if (error) {
    throw error;
  }

  let checked = 0;
  for (const attempt of (data ?? []) as PaymentAttemptRow[]) {
    await processAttempt(supabase, attempt);
    checked += 1;
  }

  return { checked };
}

export async function runPaymentMaintenance() {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase.rpc("release_expired_booking_holds");
  if (error) {
    throw error;
  }

  const staleBefore = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data: expiredRows, error: updateError } = await supabase
    .from("booking_intents")
    .update({ status: "expired" })
    .in("status", ["otp_sent", "email_verified", "payment_failed"])
    .lt("created_at", staleBefore)
    .select("id");

  if (updateError) {
    throw updateError;
  }

  return { releasedHolds: data ?? 0, expiredBookings: expiredRows?.length ?? 0 };
}
