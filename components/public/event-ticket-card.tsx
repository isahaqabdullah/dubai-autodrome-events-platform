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
  className?: string;
}

export function EventTicketCard({
  event,
  attendee,
  qrSrc,
  ticketNumber = 1,
  ticketTotal = 1,
  mapLink,
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
        "relative mx-auto w-full max-w-[1040px] overflow-hidden rounded-[26px] border border-slate/12 bg-white shadow-[0_24px_70px_rgba(12,23,35,0.14)]",
        className
      )}
      aria-labelledby={titleId}
    >
      <div className="relative overflow-hidden bg-[#091118] text-white">
        <div className="absolute inset-0">
          {!hidePoster ? (
            <img
              src={posterImage}
              alt={event.title}
              referrerPolicy="no-referrer"
              className="absolute inset-0 h-full w-full object-cover object-center"
              onError={() => setHidePoster(true)}
            />
          ) : null}
          <div className="absolute inset-0 bg-[linear-gradient(105deg,rgba(3,8,13,0.96)_0%,rgba(3,8,13,0.86)_50%,rgba(3,8,13,0.54)_100%)]" />
        </div>

        <div className="relative p-4 sm:p-6 lg:p-7">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <img
              src="/autodrome-header-logo.svg"
              alt="Dubai Autodrome"
              referrerPolicy="no-referrer"
              className="h-9 w-auto shrink-0 sm:h-10 lg:h-11"
            />
            <span className="inline-flex w-fit items-center rounded-full border border-white/16 bg-white/12 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-white backdrop-blur-sm">
              Ticket {ticketNumber} of {ticketTotal}
            </span>
          </div>

          <div className="mt-7 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.58fr)] lg:items-end">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-white/72">Ticket holder</p>
              <h2
                id={titleId}
                className="mt-2 font-title text-[2rem] font-black italic leading-none text-white sm:text-[2.7rem] lg:text-[3.2rem]"
              >
                {presentation.attendeeName}
              </h2>
              <p className="mt-3 max-w-2xl text-sm font-medium leading-relaxed text-white/78 sm:text-base">
                Present this ticket at check-in. Use the QR code first; the manual code is a backup for staff.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <div className="rounded-[20px] border border-white/14 bg-white/12 p-3.5 backdrop-blur-sm">
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/62">Ticket type</p>
                <p className="mt-1 text-base font-bold text-white">{presentation.categoryLabel}</p>
              </div>
              {presentation.addOnLabel ? (
                <div className="rounded-[20px] border border-white/14 bg-white/12 p-3.5 backdrop-blur-sm">
                  <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/62">Activity</p>
                  <p className="mt-1 text-base font-bold text-white">{presentation.addOnLabel}</p>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="p-4 sm:p-6 lg:p-7">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate">Event</p>
            <h3 className="mt-2 font-title text-2xl font-black italic leading-tight text-ink sm:text-3xl">
              {presentation.title}
            </h3>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {eventRows.map((row) => {
              const Icon = row.icon;
              return (
                <div key={row.label} className="rounded-[18px] border border-slate/12 bg-mist/55 p-3.5">
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
              className="mt-5 inline-flex items-center gap-2 rounded-2xl border border-slate/15 bg-white px-4 py-2.5 text-sm font-semibold text-ink transition hover:border-slate/30 hover:bg-mist"
            >
              <MapPin className="h-4 w-4" />
              View venue map
            </a>
          ) : null}
        </div>

        <aside className="relative border-t border-slate/12 bg-[#f4ede4] p-4 text-ink lg:border-l lg:border-t-0 lg:p-6">
          <div className="absolute inset-x-6 top-0 lg:hidden" aria-hidden="true">
            <div className="relative border-t border-dashed border-[#ccbfb0]">
              <div className="absolute -left-1 top-0 h-4 w-4 -translate-y-1/2 rounded-full bg-white" />
              <div className="absolute -right-1 top-0 h-4 w-4 -translate-y-1/2 rounded-full bg-white" />
            </div>
          </div>

          <div className="flex h-full flex-col justify-center">
            <div className="text-center">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-[#2c7a86]/10 text-[#2c7a86]">
                <QrCode className="h-5 w-5" />
              </div>
              <p className="mt-3 text-[10px] font-bold uppercase tracking-[0.24em] text-slate/70">Scan this ticket</p>
            </div>

            <div className="mt-3 rounded-[24px] border border-[#d7cfc4] bg-[#fffdfa] p-3 shadow-[0_16px_30px_rgba(12,23,35,0.08)]">
              <img
                src={qrSrc}
                alt={`Ticket QR code for ${presentation.attendeeName}`}
                referrerPolicy="no-referrer"
                className="mx-auto block h-auto w-full max-w-[214px]"
              />
              {manualCheckinCode ? (
                <div className="mt-3 rounded-2xl border border-[#d7cfc4] bg-white px-3 py-2.5 text-center">
                  <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate/70">Manual code</p>
                  <p className="mt-1 text-[28px] font-black tracking-[0.24em] text-ink">{manualCheckinCode}</p>
                </div>
              ) : null}
            </div>

            <p className="mt-3 text-[10px] leading-relaxed text-slate sm:text-[11px]">
              {ticketTotal > 1
                ? `This code is only for ${presentation.attendeeName}. Use the attendee selector above to view the other tickets.`
                : `This code is only for ${presentation.attendeeName}. Staff can use the manual code if scanning fails.`}
            </p>
          </div>
        </aside>
      </div>
    </section>
  );
}
