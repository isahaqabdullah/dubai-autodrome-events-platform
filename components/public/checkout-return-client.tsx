"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Clock3, XCircle } from "lucide-react";
import { EventTicketCard } from "@/components/public/event-ticket-card";
import type { CheckoutStatusResult } from "@/lib/types";

const CHECKOUT_DRAFT_CLEAR_KEY = "checkout-drafts-clear-at";

function clearBookingDrafts() {
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i -= 1) {
      const key = sessionStorage.key(i);
      if (key?.startsWith("booking-draft-")) {
        sessionStorage.removeItem(key);
      }
    }
  } catch {
    // Ignore storage access issues; the server-side checkout state remains authoritative.
  }
  try {
    localStorage.setItem(CHECKOUT_DRAFT_CLEAR_KEY, String(Date.now()));
  } catch {
    // Ignore cross-tab cleanup failures.
  }
}

export function CheckoutReturnClient({
  checkoutToken,
  cancelled
}: {
  checkoutToken: string;
  cancelled: boolean;
}) {
  const [status, setStatus] = useState<CheckoutStatusResult | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const ticketEvent = status?.status === "fulfilled" && status.event ? status.event : null;
  const ticketAttendees = ticketEvent ? status?.attendees ?? [] : [];
  const canShowTickets = Boolean(ticketEvent && ticketAttendees.length > 0);
  const mapLink = ticketEvent?.form_config?.mapLink ?? null;

  useEffect(() => {
    let stopped = false;
    let tick = 0;

    async function poll() {
      if (stopped) return;
      let nextStatus: CheckoutStatusResult["status"] | null = null;
      const response = await fetch(`/api/checkout/status?token=${encodeURIComponent(checkoutToken)}`, {
        cache: "no-store"
      });
      if (response.ok) {
        const next = await response.json() as CheckoutStatusResult;
        nextStatus = next.status;
        setStatus(next);
        if (["fulfilled", "payment_failed", "manual_action_required", "cancelled", "expired"].includes(next.status)) {
          return;
        }
      }

      const delaySeconds = nextStatus === "paid" ? 1 : 2;
      tick += delaySeconds;
      setElapsed(tick);
      if (tick < 60) {
        window.setTimeout(poll, delaySeconds * 1000);
      }
    }

    void poll();
    return () => {
      stopped = true;
    };
  }, [checkoutToken]);

  useEffect(() => {
    if (status && ["paid", "fulfilled", "manual_action_required"].includes(status.status)) {
      clearBookingDrafts();
    }
  }, [status]);

  const settledStatus = status?.status;
  const finalStatus =
    settledStatus && !["payment_pending", "paid", "email_verified", "otp_sent"].includes(settledStatus)
      ? settledStatus
      : cancelled
        ? "cancelled"
        : settledStatus;
  const icon =
    finalStatus === "fulfilled" || finalStatus === "paid"
      ? <CheckCircle2 className="h-12 w-12 text-[#2c7a86]" />
      : finalStatus === "payment_failed" || finalStatus === "cancelled" || finalStatus === "expired"
        ? <XCircle className="h-12 w-12 text-rose-600" />
        : <Clock3 className="h-12 w-12 text-slate" />;

  const title =
    finalStatus === "fulfilled"
      ? "Registration complete"
      : finalStatus === "paid"
        ? "Payment confirmed"
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
      ? "Your tickets are ready below. We are also emailing a copy."
      : finalStatus === "paid"
        ? "Your payment is confirmed. We are preparing your tickets and will email them shortly."
      : finalStatus === "manual_action_required"
        ? "Payment was received, but ticket issuance needs manual review."
        : finalStatus === "payment_failed" || finalStatus === "cancelled" || finalStatus === "expired"
          ? "No ticket was issued. Return to the event page to try again."
          : elapsed >= 60
            ? "Payment confirmation is taking longer than usual. Keep this page or check your email."
            : "This can take a few seconds after the secure payment page returns.";
  const canLeave =
    elapsed >= 60 ||
    ["fulfilled", "payment_failed", "manual_action_required", "cancelled", "expired"].includes(finalStatus ?? "");

  return (
    <div className={`mx-auto flex min-h-[70vh] flex-col items-center justify-center px-4 py-12 text-center ${canShowTickets ? "max-w-6xl" : "max-w-xl"}`}>
      {icon}
      <h1 className="mt-4 font-title text-3xl font-black italic text-ink">{title}</h1>
      <p className="mt-3 text-sm leading-relaxed text-slate">{message}</p>
      {canShowTickets ? (
        <div className="mt-8 grid w-full gap-5 text-left">
          {ticketAttendees.map((attendee) => (
            <EventTicketCard
              key={attendee.registrationId}
              event={ticketEvent!}
              attendee={attendee}
              qrSrc={`/api/qr?token=${encodeURIComponent(attendee.qrToken)}`}
              mapLink={mapLink}
            />
          ))}
        </div>
      ) : status?.attendees?.length ? (
        <div className="mt-6 w-full rounded-2xl border border-slate/10 bg-white p-4 text-left">
          {status.attendees.map((attendee) => (
            <div key={attendee.registrationId} className="flex items-center justify-between gap-3 border-b border-slate/10 py-2 last:border-0">
              <span className="font-medium text-ink">{attendee.fullName}</span>
              <span className="text-sm text-slate">{attendee.manualCheckinCode}</span>
            </div>
          ))}
        </div>
      ) : null}
      {canLeave ? (
        <Link
          href="/events"
          onClick={clearBookingDrafts}
          className="mt-6 inline-flex items-center justify-center rounded-2xl border border-ink bg-ink px-4 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:bg-ink/92"
        >
          View events
        </Link>
      ) : null}
    </div>
  );
}
