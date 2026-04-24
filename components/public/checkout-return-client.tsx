"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Clock3, XCircle } from "lucide-react";
import type { CheckoutStatusResult } from "@/lib/types";

export function CheckoutReturnClient({
  checkoutToken,
  cancelled
}: {
  checkoutToken: string;
  cancelled: boolean;
}) {
  const [status, setStatus] = useState<CheckoutStatusResult | null>(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    let stopped = false;
    let tick = 0;

    async function poll() {
      if (stopped) return;
      const response = await fetch(`/api/checkout/status?token=${encodeURIComponent(checkoutToken)}`, {
        cache: "no-store"
      });
      if (response.ok) {
        const next = await response.json() as CheckoutStatusResult;
        setStatus(next);
        if (["fulfilled", "payment_failed", "manual_action_required", "cancelled", "expired"].includes(next.status)) {
          return;
        }
      }

      tick += 3;
      setElapsed(tick);
      if (tick < 60) {
        window.setTimeout(poll, 3000);
      }
    }

    void poll();
    return () => {
      stopped = true;
    };
  }, [checkoutToken]);

  const finalStatus = cancelled ? "cancelled" : status?.status;
  const icon =
    finalStatus === "fulfilled"
      ? <CheckCircle2 className="h-12 w-12 text-[#2c7a86]" />
      : finalStatus === "payment_failed" || finalStatus === "cancelled" || finalStatus === "expired"
        ? <XCircle className="h-12 w-12 text-rose-600" />
        : <Clock3 className="h-12 w-12 text-slate" />;

  const title =
    finalStatus === "fulfilled"
      ? "Registration complete"
      : finalStatus === "payment_failed"
        ? "Payment failed"
        : finalStatus === "cancelled"
          ? "Payment cancelled"
          : finalStatus === "manual_action_required"
            ? "Payment under review"
            : elapsed >= 60
              ? "Still processing"
              : "Checking payment";

  const message =
    finalStatus === "fulfilled"
      ? "Your tickets are being emailed. You can close this page."
      : finalStatus === "manual_action_required"
        ? "Payment was received, but ticket issuance needs manual review."
        : finalStatus === "payment_failed" || finalStatus === "cancelled" || finalStatus === "expired"
          ? "No ticket was issued. Return to the event page to try again."
          : elapsed >= 60
            ? "Payment confirmation is taking longer than usual. Keep this page or check your email."
            : "This can take a few seconds after the secure payment page returns.";

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-xl flex-col items-center justify-center px-4 py-12 text-center">
      {icon}
      <h1 className="mt-4 font-title text-3xl font-black italic text-ink">{title}</h1>
      <p className="mt-3 text-sm leading-relaxed text-slate">{message}</p>
      {status?.attendees?.length ? (
        <div className="mt-6 w-full rounded-2xl border border-slate/10 bg-white p-4 text-left">
          {status.attendees.map((attendee) => (
            <div key={attendee.registrationId} className="flex items-center justify-between gap-3 border-b border-slate/10 py-2 last:border-0">
              <span className="font-medium text-ink">{attendee.fullName}</span>
              <span className="text-sm text-slate">{attendee.manualCheckinCode}</span>
            </div>
          ))}
        </div>
      ) : null}
      <Link
        href="/events"
        className="mt-6 inline-flex items-center justify-center rounded-2xl border border-ink bg-ink px-4 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:bg-ink/92"
      >
        View events
      </Link>
    </div>
  );
}
