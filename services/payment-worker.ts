import "server-only";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import {
  getNgeniusOrder,
  getNgeniusOrderAmount,
  getWebhookOrderReference,
  interpretNgeniusOrder,
  NgeniusApiError
} from "@/services/ngenius";
import { formatErrorMessage } from "@/lib/errors";
import { fulfillPaidBookingFromWorker, HOLD_EXPIRED_AFTER_PAYMENT_REASON } from "@/services/checkout";

type Supabase = ReturnType<typeof createAdminSupabaseClient>;
const ABANDONED_PAYMENT_LINK_REASON = "Payment link prepared but abandoned before payment.";
const PENDING_PAYMENT_ATTEMPT_STATUSES = ["order_create_pending", "payment_pending"] as const;
const NGENIUS_RECONCILE_AUTH_REASON = "N-Genius authorization failed during payment status reconciliation.";

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

type StalePaymentBookingRow = {
  id: string;
  status: string;
  held_until: string | null;
};

function errorMessage(error: unknown, fallback: string) {
  const message = formatErrorMessage(error);
  return message && message !== "Unknown error" ? message : fallback;
}

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

function isNgeniusUnauthorizedError(error: unknown) {
  return error instanceof NgeniusApiError && error.status === 401;
}

async function updateBookingUnlessFulfilled(
  supabase: Supabase,
  bookingIntentId: string,
  values: Record<string, unknown>
) {
  const { error } = await supabase
    .from("booking_intents")
    .update(values)
    .eq("id", bookingIntentId)
    .neq("status", "fulfilled");

  if (error) {
    throw error;
  }
}

async function updatePendingBookingForManualAction(
  supabase: Supabase,
  bookingIntentId: string,
  values: Record<string, unknown>
) {
  const { error } = await supabase
    .from("booking_intents")
    .update(values)
    .eq("id", bookingIntentId)
    .in("status", ["otp_sent", "email_verified", "payment_pending", "manual_action_required"]);

  if (error) {
    throw error;
  }
}

async function markNgeniusReconcileAuthFailure(supabase: Supabase, attempt: PaymentAttemptRow) {
  const { error: attemptError } = await supabase
    .from("payment_attempts")
    .update({
      status: "manual_action_required",
      last_error: NGENIUS_RECONCILE_AUTH_REASON
    })
    .eq("id", attempt.id)
    .neq("status", "paid");

  if (attemptError) {
    throw attemptError;
  }

  await updatePendingBookingForManualAction(supabase, attempt.booking_intent_id, {
    status: "manual_action_required",
    manual_action_reason: NGENIUS_RECONCILE_AUTH_REASON
  });
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

  let order: Record<string, unknown>;
  try {
    order = await getNgeniusOrder(attempt.ni_order_reference);
  } catch (error) {
    if (isNgeniusUnauthorizedError(error)) {
      await markNgeniusReconcileAuthFailure(supabase, attempt);
      return;
    }
    throw error;
  }
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
    await updateBookingUnlessFulfilled(supabase, attempt.booking_intent_id, {
      status: "manual_action_required",
      manual_action_reason: reason
    });
    return;
  }

  if (attempt.status === "expired" && (state.kind === "pending" || state.kind === "failed" || state.kind === "cancelled")) {
    return;
  }

  if (state.kind === "paid") {
    const expiredHold = await markExpiredHoldAsManualAction(supabase, attempt);
    if (expiredHold) {
      return;
    }

    await supabase.from("payment_attempts").update({
      status: "paid",
      last_error: null
    }).eq("id", attempt.id);
    await updateBookingUnlessFulfilled(supabase, attempt.booking_intent_id, {
      status: "paid",
      manual_action_reason: null
    });

    try {
      await fulfillPaidBookingFromWorker({
        bookingIntentId: attempt.booking_intent_id,
        paymentAttemptId: attempt.id
      });
    } catch (error) {
      const reason = errorMessage(error, "Payment was verified, but ticket fulfillment failed.");
      await supabase.from("payment_attempts").update({
        status: "manual_action_required",
        last_error: reason
      }).eq("id", attempt.id);
      await updateBookingUnlessFulfilled(supabase, attempt.booking_intent_id, {
        status: "manual_action_required",
        manual_action_reason: reason
      });
      throw error;
    }
    return;
  }

  if (state.kind === "failed" || state.kind === "cancelled") {
    await supabase.from("payment_attempts").update({
      status: state.kind === "cancelled" ? "cancelled" : "failed",
      last_error: state.state ? `N-Genius state: ${state.state}` : null
    }).eq("id", attempt.id);
    await updateBookingUnlessFulfilled(supabase, attempt.booking_intent_id, {
      status: "payment_failed",
      manual_action_reason: null
    });
    return;
  }

  if (state.kind === "manual_review") {
    const reason = state.state ? `N-Genius manual review state: ${state.state}` : "N-Genius state requires manual review.";
    await supabase.from("payment_attempts").update({
      status: "manual_action_required",
      last_error: reason
    }).eq("id", attempt.id);
    await updateBookingUnlessFulfilled(supabase, attempt.booking_intent_id, {
      status: "manual_action_required",
      manual_action_reason: reason
    });
  }
}

async function markExpiredHoldAsManualAction(supabase: Supabase, attempt: PaymentAttemptRow) {
  const { count: bookingIssuedCount, error: bookingIssuedError } = await supabase
    .from("registrations")
    .select("id", { count: "exact", head: true })
    .eq("booking_intent_id", attempt.booking_intent_id)
    .not("status", "in", "(cancelled,revoked)");

  if (bookingIssuedError) {
    throw bookingIssuedError;
  }

  if ((bookingIssuedCount ?? 0) > 0) {
    return false;
  }

  const { count: attemptIssuedCount, error: issuedError } = await supabase
    .from("registrations")
    .select("id", { count: "exact", head: true })
    .eq("booking_intent_id", attempt.booking_intent_id)
    .eq("payment_attempt_id", attempt.id);

  if (issuedError) {
    throw issuedError;
  }

  if ((attemptIssuedCount ?? 0) > 0) {
    return false;
  }

  const { data, error } = await supabase
    .from("booking_capacity_holds")
    .select("id")
    .eq("booking_intent_id", attempt.booking_intent_id)
    .lte("held_until", new Date().toISOString())
    .limit(1);

  if (error) {
    throw error;
  }

  if (!data?.length) {
    return false;
  }

  await supabase.from("payment_attempts").update({
    status: "manual_action_required",
    last_error: HOLD_EXPIRED_AFTER_PAYMENT_REASON
  }).eq("id", attempt.id);
  await updatePendingBookingForManualAction(supabase, attempt.booking_intent_id, {
    status: "manual_action_required",
    manual_action_reason: HOLD_EXPIRED_AFTER_PAYMENT_REASON
  });

  return true;
}

async function countIssuedRegistrations(supabase: Supabase, bookingIntentId: string) {
  const { count, error } = await supabase
    .from("registrations")
    .select("id", { count: "exact", head: true })
    .eq("booking_intent_id", bookingIntentId);

  if (error) {
    throw error;
  }

  return count ?? 0;
}

async function expireStalePreparedPaymentLinks(supabase: Supabase) {
  const nowIso = new Date().toISOString();
  const { data: staleBookings, error: bookingError } = await supabase
    .from("booking_intents")
    .select("id, status, held_until")
    .eq("status", "payment_pending")
    .not("held_until", "is", null)
    .lte("held_until", nowIso)
    .limit(50);

  if (bookingError) {
    throw bookingError;
  }

  let expiredBookings = 0;
  let expiredPaymentAttempts = 0;
  let failedReconciliations = 0;

  for (const booking of (staleBookings ?? []) as StalePaymentBookingRow[]) {
    const { data: attempts, error: attemptsError } = await supabase
      .from("payment_attempts")
      .select("*")
      .eq("booking_intent_id", booking.id)
      .in("status", [...PENDING_PAYMENT_ATTEMPT_STATUSES])
      .order("attempt_number", { ascending: true });

    if (attemptsError) {
      throw attemptsError;
    }

    const pendingAttempts = (attempts ?? []) as PaymentAttemptRow[];
    let reconciliationFailed = false;

    for (const attempt of pendingAttempts) {
      if (!attempt.ni_order_reference) {
        continue;
      }

      try {
        await processAttempt(supabase, attempt);
      } catch (error) {
        reconciliationFailed = true;
        failedReconciliations += 1;
        await supabase
          .from("payment_attempts")
          .update({
            last_error: errorMessage(error, "Stale payment link cleanup reconcile failed.")
          })
          .eq("id", attempt.id);
      }
    }

    if (reconciliationFailed) {
      continue;
    }

    const { data: currentBooking, error: currentBookingError } = await supabase
      .from("booking_intents")
      .select("id, status, held_until")
      .eq("id", booking.id)
      .single();

    if (currentBookingError) {
      throw currentBookingError;
    }

    const issuedRegistrations = await countIssuedRegistrations(supabase, booking.id);
    const currentHoldExpired =
      Boolean(currentBooking?.held_until) && new Date(currentBooking.held_until as string).getTime() <= Date.now();

    if (issuedRegistrations > 0 || currentBooking?.status !== "payment_pending" || !currentHoldExpired) {
      continue;
    }

    const { data: currentAttempts, error: currentAttemptsError } = await supabase
      .from("payment_attempts")
      .select("id")
      .eq("booking_intent_id", booking.id)
      .in("status", [...PENDING_PAYMENT_ATTEMPT_STATUSES]);

    if (currentAttemptsError) {
      throw currentAttemptsError;
    }

    const currentAttemptIds = (currentAttempts ?? []).map((attempt) => attempt.id as string);
    if (!currentAttemptIds.length) {
      continue;
    }

    const { error: expireAttemptsError } = await supabase
      .from("payment_attempts")
      .update({
        status: "expired",
        last_error: ABANDONED_PAYMENT_LINK_REASON
      })
      .in("id", currentAttemptIds)
      .in("status", [...PENDING_PAYMENT_ATTEMPT_STATUSES]);

    if (expireAttemptsError) {
      throw expireAttemptsError;
    }

    const { error: expireBookingError } = await supabase
      .from("booking_intents")
      .update({
        status: "expired",
        manual_action_reason: ABANDONED_PAYMENT_LINK_REASON
      })
      .eq("id", booking.id)
      .eq("status", "payment_pending");

    if (expireBookingError) {
      throw expireBookingError;
    }

    expiredBookings += 1;
    expiredPaymentAttempts += currentAttemptIds.length;
  }

  return { expiredBookings, expiredPaymentAttempts, failedReconciliations };
}

export async function runPaymentWorker(limit = 10) {
  const supabase = createAdminSupabaseClient({ noStore: true });
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

export async function runPaymentAttemptWorker(paymentAttemptId: string) {
  const supabase = createAdminSupabaseClient({ noStore: true });
  const { data, error } = await supabase
    .from("payment_attempts")
    .select("*")
    .eq("id", paymentAttemptId)
    .single();

  if (error) {
    throw error;
  }

  await processAttempt(supabase, data as PaymentAttemptRow);
  await supabase
    .from("payment_jobs")
    .update({ status: "done", locked_at: null, last_error: null })
    .eq("payment_attempt_id", paymentAttemptId)
    .in("status", ["queued", "processing"]);
}

export async function runPaymentReconcile() {
  const supabase = createAdminSupabaseClient({ noStore: true });
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
  let failed = 0;
  for (const attempt of (data ?? []) as PaymentAttemptRow[]) {
    try {
      await processAttempt(supabase, attempt);
      checked += 1;
    } catch (error) {
      failed += 1;
      await supabase.from("payment_attempts").update({
        last_error: errorMessage(error, "Payment reconcile failed.")
      }).eq("id", attempt.id);
    }
  }

  return { checked, failed };
}

export async function reconcilePaymentAttempt(input: { paymentAttemptId: string; bookingIntentId: string }) {
  const supabase = createAdminSupabaseClient({ noStore: true });
  const { data, error } = await supabase
    .from("payment_attempts")
    .select("*")
    .eq("id", input.paymentAttemptId)
    .eq("booking_intent_id", input.bookingIntentId)
    .single();

  if (error) {
    throw error;
  }

  await processAttempt(supabase, data as PaymentAttemptRow);
  return { checked: 1, failed: 0 };
}

export async function runPaymentMaintenance() {
  const supabase = createAdminSupabaseClient({ noStore: true });
  const { data, error } = await supabase.rpc("release_expired_booking_holds");
  if (error) {
    throw error;
  }

  const stalePreparedPayments = await expireStalePreparedPaymentLinks(supabase);
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

  return {
    releasedHolds: data ?? 0,
    expiredBookings: expiredRows?.length ?? 0,
    expiredPreparedBookings: stalePreparedPayments.expiredBookings,
    expiredPreparedPaymentAttempts: stalePreparedPayments.expiredPaymentAttempts,
    stalePreparedPaymentReconcileFailures: stalePreparedPayments.failedReconciliations
  };
}
