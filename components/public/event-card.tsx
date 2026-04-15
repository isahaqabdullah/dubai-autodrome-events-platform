import Link from "next/link";
import type { EventRecord } from "@/lib/types";
import { formatEventDateRange } from "@/lib/utils";

export function EventCard({ event }: { event: EventRecord }) {
  return (
    <article className="card-panel flex h-full flex-col gap-2.5 p-3.5 sm:gap-5 sm:p-5 md:p-6">
      <div className="min-w-0 space-y-1 sm:space-y-2">
        <p className="section-title">Edition</p>
        <h2 className="font-title text-lg font-black italic leading-tight tracking-tight text-ink sm:text-2xl">{event.title}</h2>
      </div>

      <div className="space-y-1 text-[13px] leading-snug text-slate sm:space-y-1.5 sm:text-sm">
        <p className="text-[13px] font-medium text-ink/70 sm:text-sm">{formatEventDateRange(event.start_at, event.end_at, event.timezone)}</p>
        {event.venue ? <p className="line-clamp-1">{event.venue}</p> : null}
        <p className="line-clamp-2 sm:line-clamp-3">{event.description ?? "Registration opens on this event page."}</p>
      </div>

      <div className="mt-auto">
        <Link
          href={`/events/${event.slug}`}
          className="inline-flex items-center rounded-xl px-3.5 py-2 text-[13px] font-semibold text-white transition hover:bg-ink/90 bg-ink sm:rounded-2xl sm:px-4 sm:py-2.5 sm:text-sm"
        >
          View event
        </Link>
      </div>
    </article>
  );
}
