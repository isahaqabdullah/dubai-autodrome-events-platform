import Link from "next/link";
import type { EventRecord } from "@/lib/types";
import { formatEventDateRange, getRegistrationWindowState } from "@/lib/utils";
import { StatusPill } from "@/components/ui/status-pill";

export function EventCard({ event }: { event: EventRecord }) {
  const registrationState = getRegistrationWindowState(event);

  return (
    <article className="card-panel flex h-full flex-col gap-4 p-4 sm:gap-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1.5 sm:space-y-2">
          <p className="section-title">Edition</p>
          <h2 className="text-xl font-semibold tracking-tight text-ink sm:text-2xl">{event.title}</h2>
        </div>
        <StatusPill
          tone={
            registrationState.state === "open"
              ? "success"
              : registrationState.state === "not_open_yet"
                ? "warning"
                : "danger"
          }
        >
          {registrationState.label}
        </StatusPill>
      </div>

      <div className="space-y-2 text-sm text-slate">
        <p>{formatEventDateRange(event.start_at, event.end_at, event.timezone)}</p>
        {event.venue ? <p>{event.venue}</p> : null}
        <p className="line-clamp-3">{event.description ?? "Registration opens on this event page."}</p>
      </div>

      <div className="mt-auto">
        <Link
          href={`/events/${event.slug}`}
          className="inline-flex items-center rounded-2xl bg-ink px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-ink/90"
        >
          View event
        </Link>
      </div>
    </article>
  );
}
