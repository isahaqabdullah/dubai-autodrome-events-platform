"use client";

import { useId, useState } from "react";
import { CalendarDays, Clock3, Download, MapPin, Ticket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildTicketPresentation, getTicketPosterImageSrc, type TicketPresentationAttendee } from "@/lib/ticket-presentation";
import type { EventRecord } from "@/lib/types";
import { cn } from "@/lib/utils";

interface EventTicketCardProps {
  event: Pick<EventRecord, "title" | "venue" | "start_at" | "end_at" | "timezone" | "form_config">;
  attendee: TicketPresentationAttendee & { qrToken: string };
  qrSrc: string;
  mapLink?: string | null;
  onDownload?: () => void;
  className?: string;
}

export function EventTicketCard({
  event,
  attendee,
  qrSrc,
  mapLink,
  onDownload,
  className
}: EventTicketCardProps) {
  const titleId = useId();
  const [hidePoster, setHidePoster] = useState(false);
  const presentation = buildTicketPresentation(event, attendee);
  const posterImage = getTicketPosterImageSrc(event.form_config);
  const manualCheckinCode = attendee.manualCheckinCode?.trim().toUpperCase() || null;
  const stubRows = [
    { label: "Date", value: presentation.dateLabel },
    { label: "Time", value: presentation.startTime },
    { label: "Venue", value: presentation.venueShort },
    { label: "Category", value: presentation.categoryLabel },
    ...(presentation.addOnLabel ? [{ label: "Add-on", value: presentation.addOnLabel }] : [])
  ];

  return (
    <section
      className={cn(
        "relative mx-auto w-full max-w-[1040px] overflow-hidden rounded-[28px] border border-[#0b1117]/8 bg-[#091118] shadow-[0_30px_90px_rgba(12,23,35,0.18)]",
        className
      )}
      aria-labelledby={titleId}
    >
      <div className="grid lg:min-h-[270px] lg:grid-cols-[minmax(0,1fr)_208px] xl:grid-cols-[minmax(0,1fr)_224px]">
        <div className="relative min-h-[220px] overflow-hidden bg-[#091118] sm:min-h-[240px] lg:min-h-[270px]">
          {!hidePoster ? (
            <img
              src={posterImage}
              alt={event.title}
              className="absolute inset-0 h-full w-full object-cover object-center"
              onError={() => setHidePoster(true)}
            />
          ) : null}
          <div className="absolute inset-0 bg-[linear-gradient(108deg,rgba(3,8,13,0.96)_10%,rgba(3,8,13,0.78)_40%,rgba(3,8,13,0.28)_100%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(36,140,119,0.26),transparent_34%),radial-gradient(circle_at_bottom_left,rgba(244,184,96,0.14),transparent_34%)]" />

          <div className="relative flex h-full flex-col justify-between gap-3 p-4 sm:p-5 lg:p-[22px] xl:p-6">
            <div className="flex flex-wrap gap-2">
              <span className="inline-flex items-center rounded-full border border-white/12 bg-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.22em] text-white backdrop-blur-sm">
                {presentation.categoryLabel}
              </span>
              {presentation.addOnLabel ? (
                <span className="inline-flex items-center rounded-full border border-white/12 bg-black/20 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.22em] text-white backdrop-blur-sm">
                  {presentation.addOnLabel}
                </span>
              ) : null}
            </div>

            <div className="max-w-2xl">
              <p className="text-[10px] font-semibold uppercase tracking-[0.34em] text-white">Event access pass</p>
              <h2
                id={titleId}
                className="mt-2 max-w-[620px] font-title text-[1.35rem] font-black italic leading-[0.94] tracking-tight text-white sm:text-[1.8rem] lg:text-[2.1rem] xl:text-[2.3rem]"
              >
                {presentation.title}
              </h2>

              <div className="mt-3 space-y-2">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/10 px-3 py-1.5 text-[12px] text-white backdrop-blur-sm sm:text-[13px]">
                  <CalendarDays className="h-4 w-4 text-white" />
                  <span className="font-semibold">{presentation.dateBadge}</span>
                  <span className="text-white/72">•</span>
                  <Clock3 className="h-4 w-4 text-white" />
                  <span>{presentation.timeRange}</span>
                </div>

                <div className="flex max-w-xl items-start gap-3 rounded-3xl border border-white/12 bg-black/18 px-3.5 py-2 text-white backdrop-blur-sm">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-white" />
                  <div>
                    <p className="text-[13px] font-semibold sm:text-sm">{presentation.venueShort}</p>
                    {presentation.venueSecondary ? (
                      <p className="mt-0.5 text-[12px] text-white sm:text-sm">{presentation.venueSecondary}</p>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-3 rounded-[24px] border border-white/12 bg-black/22 p-3.5 backdrop-blur-sm md:grid-cols-[1.15fr_1fr]">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-white">Attendee</p>
                <p className="mt-1 text-[14px] font-semibold text-white sm:text-base">{presentation.attendeeName}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-white">Admission</p>
                <p className="mt-1 text-[13px] font-semibold text-white sm:text-[15px]">{presentation.admissionLabel}</p>
                {mapLink ? (
                  <a
                    href={mapLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex items-center gap-2 text-[12px] font-semibold text-white transition hover:text-white/80 sm:text-[13px]"
                  >
                    <MapPin className="h-4 w-4" />
                    View on map
                  </a>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <aside className="relative border-t border-[#d7cec3] bg-[#f4ede4] p-4 text-ink lg:border-l lg:border-t-0 lg:p-[18px] xl:p-5">
          <div className="absolute inset-x-6 top-0 lg:hidden" aria-hidden="true">
            <div className="relative border-t border-dashed border-[#ccbfb0]">
              <div className="absolute -left-1 top-0 h-4 w-4 -translate-y-1/2 rounded-full bg-[#f4f7f8]" />
              <div className="absolute -right-1 top-0 h-4 w-4 -translate-y-1/2 rounded-full bg-[#f4f7f8]" />
            </div>
          </div>
          <div className="absolute inset-y-8 left-0 hidden lg:block" aria-hidden="true">
            <div className="relative h-full border-l border-dashed border-[#ccbfb0]">
              <div className="absolute left-0 top-0 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#f4f7f8]" />
              <div className="absolute left-0 bottom-0 h-6 w-6 -translate-x-1/2 translate-y-1/2 rounded-full bg-[#f4f7f8]" />
            </div>
          </div>

          <div className="relative flex h-full flex-col">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.26em] text-slate/65">Check-in stub</p>
              <div className="mt-2.5 flex items-center gap-2 text-[13px] font-semibold text-ink/90 sm:text-sm">
                <Ticket className="h-4 w-4 text-[#2c7a86]" />
                <span>Ticket #{presentation.ticketReference}</span>
              </div>
            </div>

            <div className="mt-3 rounded-[22px] border border-[#d7cfc4] bg-[#fffdfa] p-2.5 shadow-[0_16px_30px_rgba(12,23,35,0.08)]">
              <img
                src={qrSrc}
                alt={`Ticket QR code for ${presentation.attendeeName}`}
                className="mx-auto block h-auto w-full max-w-[138px] xl:max-w-[146px]"
              />
              {manualCheckinCode ? (
                <div className="mt-2.5 text-center">
                  <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate/65">Manual code</p>
                  <p className="mt-1 text-[24px] font-black tracking-[0.28em] text-ink">{manualCheckinCode}</p>
                </div>
              ) : null}
            </div>

            <div className="mt-3 space-y-2">
              {stubRows.map((row) => (
                <div key={`${row.label}-${row.value}`} className="rounded-2xl border border-[#ddd4c9] bg-[#fffaf4] px-3 py-2">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate/65">{row.label}</p>
                  <p className="mt-1 text-[12px] font-semibold text-ink sm:text-[13px]">{row.value}</p>
                </div>
              ))}
            </div>

            <p className="mt-3 text-[10px] leading-relaxed text-slate sm:text-[11px]">
              Present this QR code at check-in. If scanning fails, staff can also use the manual code shown below it.
            </p>

            {onDownload ? (
              <Button
                type="button"
                variant="secondary"
                onClick={onDownload}
                className="mt-3 w-full justify-center border-[#cfc4b6] bg-[#fffdfa] px-3 py-2 text-[12px] hover:border-[#bcae9b] hover:bg-white sm:text-sm"
              >
                <Download className="mr-2 h-4 w-4" />
                Download ticket
              </Button>
            ) : null}
          </div>
        </aside>
      </div>
    </section>
  );
}
