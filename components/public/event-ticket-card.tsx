"use client";

import { useId, useState } from "react";
import { CalendarDays, Clock3, MapPin, QrCode, Ticket } from "lucide-react";
import { buildTicketPresentation, getTicketPosterImageSrc, type TicketPresentationAttendee } from "@/lib/ticket-presentation";
import type { EventRecord } from "@/lib/types";
import { cn } from "@/lib/utils";

interface EventTicketCardProps {
  event: Pick<EventRecord, "title" | "venue" | "start_at" | "end_at" | "timezone" | "form_config">;
  attendee: TicketPresentationAttendee & { qrToken: string };
  qrSrc: string;
  ticketNumber?: number;
  ticketTotal?: number;
  mapLink?: string | null;
  compactMobile?: boolean;
  className?: string;
}

export function EventTicketCard({
  event,
  attendee,
  qrSrc,
  ticketNumber = 1,
  ticketTotal = 1,
  mapLink,
  compactMobile = false,
  className
}: EventTicketCardProps) {
  const titleId = useId();
  const [hidePoster, setHidePoster] = useState(false);
  const presentation = buildTicketPresentation(event, attendee);
  const posterImage = getTicketPosterImageSrc(event.form_config);
  const manualCheckinCode = attendee.manualCheckinCode?.trim().toUpperCase() || null;
  const eventRows = [
    { label: "Date", value: presentation.dateLabel, icon: CalendarDays },
    { label: "Time", value: presentation.timeRange, icon: Clock3 },
    { label: "Venue", value: presentation.venueFull, icon: MapPin },
    { label: "Reference", value: presentation.ticketReference, icon: Ticket }
  ];

  return (
    <section
      className={cn(
        "relative mx-auto w-full max-w-[1040px] overflow-hidden border border-slate/12 bg-white shadow-[0_24px_70px_rgba(12,23,35,0.14)]",
        compactMobile ? "rounded-[20px] sm:rounded-[26px]" : "rounded-[26px]",
        className
      )}
      aria-labelledby={titleId}
    >
      <div className="relative overflow-hidden bg-[#091118] text-white">
        <div className="absolute inset-0">
          {!hidePoster ? (
            posterImage ? (
              <img
                src={posterImage}
                alt={event.title}
                referrerPolicy="no-referrer"
                className="absolute inset-0 h-full w-full object-cover object-center"
                onError={() => setHidePoster(true)}
              />
            ) : null
          ) : null}
          <div className="absolute inset-0 bg-[linear-gradient(105deg,rgba(3,8,13,0.96)_0%,rgba(3,8,13,0.86)_50%,rgba(3,8,13,0.54)_100%)]" />
        </div>

        <div className={cn("relative", compactMobile ? "p-3 sm:p-6 lg:p-7" : "p-4 sm:p-6 lg:p-7")}>
          <div className={cn("flex flex-col sm:flex-row sm:items-start sm:justify-between", compactMobile ? "gap-2 sm:gap-4" : "gap-4")}>
            <img
              src="/autodrome-header-logo.svg"
              alt="Dubai Autodrome"
              referrerPolicy="no-referrer"
              className={cn("w-auto shrink-0", compactMobile ? "h-7 sm:h-10 lg:h-11" : "h-9 sm:h-10 lg:h-11")}
            />
            <span
              className={cn(
                "inline-flex w-fit items-center rounded-full border border-white/16 bg-white/12 font-bold uppercase text-white backdrop-blur-sm",
                compactMobile ? "px-2.5 py-1 text-[10px] tracking-[0.14em] sm:px-3 sm:py-1.5 sm:text-[11px] sm:tracking-[0.18em]" : "px-3 py-1.5 text-[11px] tracking-[0.18em]"
              )}
            >
              Ticket {ticketNumber} of {ticketTotal}
            </span>
          </div>

          <div className={cn("grid lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.58fr)] lg:items-end", compactMobile ? "mt-4 gap-3 sm:mt-7 sm:gap-5" : "mt-7 gap-5")}>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-white/72">Ticket holder</p>
              <h2
                id={titleId}
                className={cn(
                  "font-title font-black italic leading-none text-white sm:text-[2.7rem] lg:text-[3.2rem]",
                  compactMobile ? "mt-1 text-[1.75rem] sm:mt-2" : "mt-2 text-[2rem]"
                )}
              >
                {presentation.attendeeName}
              </h2>
            </div>

            <div className={cn("grid sm:grid-cols-2 lg:grid-cols-1", compactMobile ? "gap-2 sm:gap-3" : "gap-3")}>
              <div className={cn("border border-white/14 bg-white/12 backdrop-blur-sm", compactMobile ? "rounded-2xl p-2.5 sm:rounded-[20px] sm:p-3.5" : "rounded-[20px] p-3.5")}>
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/62">Ticket type</p>
                <p className="mt-1 text-base font-bold text-white">{presentation.categoryLabel}</p>
              </div>
              {presentation.addOnLabel ? (
                <div className={cn("border border-white/14 bg-white/12 backdrop-blur-sm", compactMobile ? "rounded-2xl p-2.5 sm:rounded-[20px] sm:p-3.5" : "rounded-[20px] p-3.5")}>
                  <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/62">Activity</p>
                  <p className="mt-1 text-base font-bold text-white">{presentation.addOnLabel}</p>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_320px]">
        <aside className={cn("relative order-1 border-t border-slate/12 bg-[#f4ede4] text-ink lg:order-2 lg:border-l lg:border-t-0", compactMobile ? "p-3 sm:p-4 lg:p-6" : "p-4 lg:p-6")}>
          <div className="absolute inset-x-6 top-0 lg:hidden" aria-hidden="true">
            <div className="relative border-t border-dashed border-[#ccbfb0]">
              <div className="absolute -left-1 top-0 h-4 w-4 -translate-y-1/2 rounded-full bg-white" />
              <div className="absolute -right-1 top-0 h-4 w-4 -translate-y-1/2 rounded-full bg-white" />
            </div>
          </div>
          <div className="absolute inset-y-6 left-0 hidden lg:block" aria-hidden="true">
            <div className="relative h-full border-l border-dashed border-[#ccbfb0]">
              <div className="absolute left-0 top-0 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white" />
              <div className="absolute bottom-0 left-0 h-4 w-4 -translate-x-1/2 translate-y-1/2 rounded-full bg-white" />
            </div>
          </div>

          <div className="mx-auto flex h-full max-w-[260px] flex-col justify-center">
            <div className="text-center">
              <div className={cn("mx-auto h-10 w-10 items-center justify-center rounded-full bg-[#2c7a86]/10 text-[#2c7a86]", compactMobile ? "hidden sm:flex" : "flex")}>
                <QrCode className="h-5 w-5" />
              </div>
              <p className={cn("text-[10px] font-bold uppercase tracking-[0.24em] text-slate/70", compactMobile ? "mt-0 sm:mt-3" : "mt-3")}>Scan this ticket</p>
            </div>

            <div className={cn("border border-[#d7cfc4] bg-[#fffdfa] shadow-[0_16px_30px_rgba(12,23,35,0.08)]", compactMobile ? "mt-2 rounded-[18px] p-2 sm:mt-3 sm:rounded-[24px] sm:p-3" : "mt-3 rounded-[24px] p-3")}>
              <img
                src={qrSrc}
                alt={`Ticket QR code for ${presentation.attendeeName}`}
                referrerPolicy="no-referrer"
                className={cn("mx-auto block h-auto w-full", compactMobile ? "max-w-[190px] sm:max-w-[214px]" : "max-w-[214px]")}
              />
              {manualCheckinCode ? (
                <div className={cn("rounded-2xl border border-[#d7cfc4] bg-white px-3 text-center", compactMobile ? "mt-2 py-2 sm:mt-3 sm:py-2.5" : "mt-3 py-2.5")}>
                  <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate/70">Manual code</p>
                  <p className={cn("mt-1 font-black tracking-[0.24em] text-ink", compactMobile ? "text-2xl sm:text-[28px]" : "text-[28px]")}>{manualCheckinCode}</p>
                </div>
              ) : null}
            </div>

            <p className={cn("text-[10px] leading-relaxed text-slate sm:text-[11px]", compactMobile ? "mt-2 sm:mt-3" : "mt-3")}>
              {ticketTotal > 1
                ? `This code is only for ${presentation.attendeeName}. Use the attendee selector above to view the other tickets.`
                : `This code is only for ${presentation.attendeeName}. Staff can use the manual code if scanning fails.`}
            </p>
          </div>
        </aside>

        <div className={cn("order-2 lg:order-1", compactMobile ? "p-3 sm:p-6 lg:p-7" : "p-4 sm:p-6 lg:p-7")}>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate">Event</p>
            <h3 className={cn("font-title font-black italic leading-tight text-ink sm:mt-2 sm:text-3xl", compactMobile ? "mt-1 text-xl" : "mt-2 text-2xl")}>
              {presentation.title}
            </h3>
          </div>

          <div className={cn("grid sm:grid-cols-2", compactMobile ? "mt-3 gap-2 sm:mt-5 sm:gap-3" : "mt-5 gap-3")}>
            {eventRows.map((row) => {
              const Icon = row.icon;
              return (
                <div key={row.label} className={cn("border border-slate/12 bg-mist/55", compactMobile ? "rounded-2xl p-2.5 sm:rounded-[18px] sm:p-3.5" : "rounded-[18px] p-3.5")}>
                  <div className="flex items-center gap-2 text-slate">
                    <Icon className="h-4 w-4" />
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em]">{row.label}</p>
                  </div>
                  <p className="mt-2 text-sm font-semibold leading-snug text-ink">{row.value}</p>
                </div>
              );
            })}
          </div>

          {mapLink ? (
            <a
              href={mapLink}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                "inline-flex items-center gap-2 rounded-2xl border border-slate/15 bg-white px-4 py-2.5 text-sm font-semibold text-ink transition hover:border-slate/30 hover:bg-mist",
                compactMobile ? "mt-3 sm:mt-5" : "mt-5"
              )}
            >
              <MapPin className="h-4 w-4" />
              View venue map
            </a>
          ) : null}
        </div>
      </div>
    </section>
  );
}
