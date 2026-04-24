"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type PaymentAction = "refresh" | "retry_fulfillment" | "mark_reviewed" | "cancel_expired";

export function PaymentActions({
  paymentAttemptId,
  bookingIntentId,
  paymentStatus,
  bookingStatus
}: {
  paymentAttemptId: string;
  bookingIntentId: string | null;
  paymentStatus: string;
  bookingStatus: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  async function runAction(action: PaymentAction) {
    if (!bookingIntentId && action !== "refresh") {
      setMessage("Missing booking reference.");
      return;
    }

    setMessage(null);
    const response = await fetch("/api/admin/payments/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        paymentAttemptId,
        bookingIntentId
      })
    });

    const result = await response.json().catch(() => ({} as { message?: string }));
    if (!response.ok) {
      setMessage(result.message ?? "Action failed.");
      return;
    }

    setMessage("Updated.");
    startTransition(() => {
      router.refresh();
    });
  }

  const canRetryFulfillment = Boolean(bookingIntentId) && ["paid", "manual_action_required"].includes(paymentStatus);
  const canMarkReviewed = Boolean(bookingIntentId) && bookingStatus === "manual_action_required";
  const canCancel = Boolean(bookingIntentId) && ["expired", "payment_failed", "email_verified"].includes(bookingStatus ?? "");

  return (
    <div className="flex min-w-[180px] flex-wrap gap-1.5">
      <button
        type="button"
        disabled={isPending}
        onClick={() => runAction("refresh")}
        className="rounded-lg border border-slate/15 bg-white px-2 py-1 text-xs font-semibold text-ink transition hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60"
      >
        Refresh
      </button>
      <button
        type="button"
        disabled={isPending || !canRetryFulfillment}
        onClick={() => runAction("retry_fulfillment")}
        className="rounded-lg border border-slate/15 bg-white px-2 py-1 text-xs font-semibold text-ink transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45"
      >
        Retry
      </button>
      <button
        type="button"
        disabled={isPending || !canMarkReviewed}
        onClick={() => runAction("mark_reviewed")}
        className="rounded-lg border border-slate/15 bg-white px-2 py-1 text-xs font-semibold text-ink transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45"
      >
        Reviewed
      </button>
      <button
        type="button"
        disabled={isPending || !canCancel}
        onClick={() => runAction("cancel_expired")}
        className="rounded-lg border border-rose-200 bg-white px-2 py-1 text-xs font-semibold text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-45"
      >
        Cancel
      </button>
      {message ? <p className="basis-full text-xs text-slate">{message}</p> : null}
    </div>
  );
}
