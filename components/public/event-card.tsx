import Link from "next/link";
import type { EventRecord } from "@/lib/types";
import { formatEventDateRange } from "@/lib/utils";

export function EventCard({ event }: { event: EventRecord }) {
  return (
    <article className="card-panel flex h-full flex-col gap-3 p-4 sm:gap-5 sm:p-5 md:p-6">
      <div className="min-w-0 space-y-1.5 sm:space-y-2">
        <p className="section-title">Edition</p>
        <h2 className="text-xl font-semibold tracking-tight text-ink sm:text-2xl">{event.title}</h2>
      </div>

      <div className="space-y-2 text-sm text-slate">
        <p className="text-sm font-medium text-ink/70">{formatEventDateRange(event.start_at, event.end_at, event.timezone)}</p>
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
