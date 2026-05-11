"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, ChevronLeft, ChevronRight, Copy, Download, ExternalLink, Mail, Share2 } from "lucide-react";
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
  compactMobile?: boolean;
}

export function TicketWallet({
  event,
  attendees,
  ticketToken,
  ticketUrl,
  mapLink,
  className,
  showHeader = true,
  compactMobile = false
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
  const hasMultipleTickets = attendees.length > 1;

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
        <div className={cn("mb-5 text-center", compactMobile && "hidden sm:block")}>
          <CheckCircle2 className="mx-auto h-10 w-10 text-[#2c7a86] sm:h-12 sm:w-12" />
          <p className="mt-3 text-xs font-bold uppercase tracking-[0.22em] text-[#2c7a86]">{attendeeListLabel}</p>
          <h1 className="mt-2 font-title text-2xl font-black italic leading-tight text-ink sm:text-4xl">Your tickets</h1>
          <p className="mx-auto mt-2 max-w-2xl text-sm leading-relaxed text-slate">
            {event.title}
          </p>
        </div>
      ) : null}

      <div
        className={cn(
          "mb-4 rounded-[22px] border border-slate/12 bg-white p-3 shadow-[0_18px_50px_rgba(12,23,35,0.08)] sm:p-4",
          compactMobile && "mb-3 p-3 sm:mb-4 sm:p-4",
          compactMobile && !hasMultipleTickets && "hidden sm:block"
        )}
      >
        <div className={cn("flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between", compactMobile && "gap-3")}>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#2c7a86]">All tickets</p>
            <h2 className={cn("mt-1 font-title font-black italic leading-tight text-ink sm:text-2xl", compactMobile ? "text-xl" : "text-[26px]")}>
              {attendeeListLabel}
            </h2>
            <p className={cn("mt-1.5 max-w-2xl text-xs leading-relaxed text-slate sm:text-sm", compactMobile && "hidden sm:block")}>
              {hasMultipleTickets
                ? "Select an attendee below to show the matching QR code. Each attendee has a separate ticket."
                : "This ticket link contains the QR code and backup manual code for the attendee."}
            </p>
          </div>

          <div className="flex flex-wrap gap-2 lg:justify-end">
            {ticketUrl && !showHeader && !compactMobile ? (
              <a
                href={ticketUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center rounded-xl border border-ink bg-ink px-3 py-2 text-sm font-semibold text-white transition hover:bg-ink/92"
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                View all tickets link
              </a>
            ) : null}
          </div>
        </div>

        <div className={cn("grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5", compactMobile ? "mt-3" : "mt-3")}>
          {attendees.map((attendee, index) => (
            <button
              key={attendee.registrationId}
              type="button"
              aria-label={`Show ticket ${index + 1} for ${attendee.fullName}`}
              aria-current={index === activeIndex ? "true" : undefined}
              onClick={() => setActiveIndex(index)}
              className={cn(
                "rounded-2xl border text-left transition",
                compactMobile ? "min-h-[58px] p-2.5 sm:min-h-[66px]" : "min-h-[66px] p-2.5",
                index === activeIndex
                  ? "border-ink bg-ink text-white shadow-[0_12px_30px_rgba(12,23,35,0.18)]"
                  : "border-slate/12 bg-mist/55 text-ink hover:border-slate/28 hover:bg-white"
              )}
            >
              <span className={cn("text-[9px] font-bold uppercase tracking-[0.18em]", index === activeIndex ? "text-white/64" : "text-slate")}>
                Ticket {index + 1}
              </span>
              <span className="mt-0.5 block truncate text-sm font-black">{attendee.fullName}</span>
              <span className={cn("mt-0.5 block truncate text-xs", index === activeIndex ? "text-white/72" : "text-slate")}>
                {attendee.categoryTitle}
                {attendee.ticketTitle ? ` - ${attendee.ticketTitle}` : ""}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className={cn("mb-3 flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-center", compactMobile && !hasMultipleTickets && "hidden sm:flex")}>
        <div>
          <p className="text-sm font-bold text-ink">
            Showing ticket {activeIndex + 1} of {attendees.length}
          </p>
          <p className="text-sm text-slate">{activeAttendee.fullName}</p>
        </div>
        {hasMultipleTickets ? (
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={() => go(-1)} disabled={!canGoBack} className="px-3 py-2">
              <ChevronLeft className="mr-1 h-4 w-4" />
              Previous
            </Button>
            <Button type="button" variant="secondary" onClick={() => go(1)} disabled={!canGoNext} className="px-3 py-2">
              Next
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        ) : null}
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
          ticketNumber={activeIndex + 1}
          ticketTotal={attendees.length}
          mapLink={mapLink}
          compactMobile={compactMobile}
        />
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
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
