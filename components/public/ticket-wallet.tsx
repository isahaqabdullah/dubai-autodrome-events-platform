"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, ChevronLeft, ChevronRight, Copy, Download, Mail, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EventTicketCard } from "@/components/public/event-ticket-card";
import type { CheckoutTicketEvent, ConfirmedCheckoutAttendee } from "@/lib/types";
import { cn } from "@/lib/utils";

interface TicketWalletProps {
  event: CheckoutTicketEvent;
  attendees: ConfirmedCheckoutAttendee[];
  ticketToken?: string;
  ticketUrl?: string;
  mapLink?: string | null;
  className?: string;
  showHeader?: boolean;
}

export function TicketWallet({
  event,
  attendees,
  ticketToken,
  ticketUrl,
  mapLink,
  className,
  showHeader = true
}: TicketWalletProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [isResending, setIsResending] = useState(false);
  const activeAttendee = attendees[activeIndex] ?? attendees[0] ?? null;
  const pdfHref = ticketToken ? `/api/tickets/pdf?token=${encodeURIComponent(ticketToken)}` : null;
  const canGoBack = activeIndex > 0;
  const canGoNext = activeIndex < attendees.length - 1;

  const attendeeListLabel = useMemo(() => {
    if (attendees.length === 1) return "1 ticket issued";
    return `${attendees.length} tickets issued`;
  }, [attendees.length]);

  function go(delta: number) {
    setActiveIndex((current) => Math.min(Math.max(current + delta, 0), attendees.length - 1));
  }

  async function copyTicketLink() {
    if (!ticketUrl) return;
    try {
      await navigator.clipboard.writeText(ticketUrl);
      setActionMessage("Ticket link copied.");
    } catch {
      setActionMessage("Unable to copy the ticket link.");
    }
  }

  async function shareTicketLink() {
    if (!ticketUrl) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: event.title,
          text: "View event tickets",
          url: ticketUrl
        });
        return;
      } catch {
        // User cancellation is common; fall back to copy.
      }
    }
    await copyTicketLink();
  }

  async function resendEmail() {
    if (!ticketToken || isResending) return;
    setActionMessage("Queueing ticket email...");
    setIsResending(true);
    try {
      const response = await fetch("/api/tickets/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: ticketToken })
      });
      const result = (await response.json().catch(() => ({}))) as { message?: string };
      setActionMessage(result.message ?? (response.ok ? "Ticket email queued." : "Unable to resend ticket email."));
    } catch {
      setActionMessage("Unable to resend ticket email.");
    } finally {
      setIsResending(false);
    }
  }

  if (!activeAttendee) {
    return null;
  }

  return (
    <section className={cn("mx-auto w-full max-w-6xl", className)}>
      {showHeader ? (
        <div className="mb-5 text-center">
          <CheckCircle2 className="mx-auto h-10 w-10 text-[#2c7a86] sm:h-12 sm:w-12" />
          <p className="mt-3 text-xs font-bold uppercase tracking-[0.22em] text-[#2c7a86]">{attendeeListLabel}</p>
          <h1 className="mt-2 font-title text-2xl font-black italic leading-tight text-ink sm:text-4xl">
            {event.title}
          </h1>
        </div>
      ) : null}

      <div className="mb-4 flex flex-col items-center justify-between gap-3 sm:flex-row">
        <div className="text-center sm:text-left">
          <p className="text-sm font-semibold text-ink">Ticket {activeIndex + 1} of {attendees.length}</p>
          <p className="text-sm text-slate">{activeAttendee.fullName}</p>
        </div>
        <div className="flex items-center gap-1.5">
          {attendees.map((attendee, index) => (
            <button
              key={attendee.registrationId}
              type="button"
              aria-label={`Show ticket ${index + 1}`}
              aria-current={index === activeIndex ? "true" : undefined}
              onClick={() => setActiveIndex(index)}
              className={cn(
                "h-2.5 w-2.5 rounded-full transition",
                index === activeIndex ? "bg-ink" : "bg-slate/25 hover:bg-slate/45"
              )}
            />
          ))}
        </div>
      </div>

      <div
        onTouchStart={(event) => setTouchStartX(event.touches[0]?.clientX ?? null)}
        onTouchEnd={(event) => {
          if (touchStartX === null) return;
          const delta = (event.changedTouches[0]?.clientX ?? touchStartX) - touchStartX;
          if (Math.abs(delta) > 48) {
            go(delta > 0 ? -1 : 1);
          }
          setTouchStartX(null);
        }}
      >
        <EventTicketCard
          event={event}
          attendee={activeAttendee}
          qrSrc={`/api/qr?token=${encodeURIComponent(activeAttendee.qrToken)}`}
          mapLink={mapLink}
        />
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        <Button type="button" variant="secondary" onClick={() => go(-1)} disabled={!canGoBack} className="min-w-[112px]">
          <ChevronLeft className="mr-2 h-4 w-4" />
          Previous
        </Button>
        <Button type="button" variant="secondary" onClick={() => go(1)} disabled={!canGoNext} className="min-w-[112px]">
          Next
          <ChevronRight className="ml-2 h-4 w-4" />
        </Button>
        {pdfHref ? (
          <a
            href={pdfHref}
            className="inline-flex items-center justify-center rounded-2xl border border-ink bg-ink px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-ink/92"
          >
            <Download className="mr-2 h-4 w-4" />
            Download all tickets PDF
          </a>
        ) : null}
        {ticketToken ? (
          <Button type="button" variant="secondary" onClick={resendEmail} disabled={isResending}>
            <Mail className="mr-2 h-4 w-4" />
            Resend email
          </Button>
        ) : null}
        {ticketUrl ? (
          <>
            <Button type="button" variant="secondary" onClick={copyTicketLink}>
              <Copy className="mr-2 h-4 w-4" />
              Copy link
            </Button>
            <Button type="button" variant="ghost" onClick={shareTicketLink}>
              <Share2 className="mr-2 h-4 w-4" />
              Share
            </Button>
          </>
        ) : null}
      </div>

      {actionMessage ? (
        <p className="mt-3 text-center text-sm text-slate" role="status">{actionMessage}</p>
      ) : null}
    </section>
  );
}
