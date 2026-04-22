import { StatusPill } from "@/components/ui/status-pill";
import { appendReturnTo } from "@/lib/admin-navigation";
import type { EventRecord } from "@/lib/types";
import { formatEventDateRange } from "@/lib/utils";
import { listAdminEvents } from "@/services/events";

export const dynamic = "force-dynamic";

function EventSection({
  title,
  events
}: {
  title: string;
  events: EventRecord[];
}) {
  if (events.length === 0) {
    return null;
  }

  return (
    <section className="space-y-2 sm:space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="admin-label">{title}</p>
          <h2 className="mt-0.5 text-sm font-semibold tracking-tight text-ink sm:mt-1 sm:text-xl">{title}</h2>
        </div>
        <span className="rounded-full border border-slate/15 bg-white/80 px-2.5 py-0.5 text-xs font-medium text-slate sm:px-3 sm:py-1 sm:text-sm">
          {events.length} event{events.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="admin-card overflow-hidden">
        {events.map((event) => (
          <article key={event.id} className="border-b border-slate/10 px-3 py-2.5 last:border-b-0 sm:px-5 sm:py-3.5">
            <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
              <div className="min-w-0 xl:flex-1">
                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2.5">
                  <h3 className="truncate text-[13px] font-semibold tracking-tight text-ink sm:text-base">{event.title}</h3>
                  <StatusPill
                    tone={
                      event.status === "live"
                        ? "success"
                        : event.status === "draft" || event.status === "archived"
                          ? "warning"
                          : "neutral"
                    }
                  >
                    {event.status}
                  </StatusPill>
                </div>
                <p className="mt-0.5 text-xs font-medium text-ink/70 sm:mt-1 sm:text-sm">
                  {formatEventDateRange(event.start_at, event.end_at, event.timezone)}
                </p>
                {event.venue ? <p className="mt-1 text-xs text-slate sm:text-sm">{event.venue}</p> : null}
              </div>

              <div className="flex flex-wrap gap-1 sm:gap-2 xl:justify-end">
                <a
                  href={appendReturnTo(`/check-in/${event.slug}`, "/check-in")}
                  className="inline-flex items-center justify-center rounded-lg border border-ink bg-ink px-2.5 py-1.5 text-[11px] font-semibold text-white transition hover:bg-ink/92 sm:rounded-2xl sm:px-3 sm:py-2 sm:text-xs"
                >
                  Check in
                </a>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export default async function CheckinHomePage() {
  const events = await listAdminEvents();
  const now = Date.now();

  const liveEvents = events.filter((event) => {
    if (event.status === "live") {
      return true;
    }

    const startsAt = new Date(event.start_at).getTime();
    const endsAt = new Date(event.end_at).getTime();
    return event.status !== "archived" && startsAt <= now && endsAt >= now;
  });

  const pastEvents = events.filter(
    (event) => event.status === "archived" || new Date(event.end_at).getTime() < now
  );

  const upcomingEvents = events.filter((event) => !liveEvents.includes(event) && !pastEvents.includes(event));

  return (
    <main className="page-stack-compact">
      <section className="admin-card p-2.5 sm:p-4">
        <div className="flex flex-col gap-2 sm:gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <p className="admin-label">Check-in</p>
            <h2 className="mt-0.5 text-sm font-semibold tracking-tight text-ink sm:mt-1 sm:text-xl">Event access</h2>
            <p className="mt-1 text-xs text-slate sm:text-sm">Choose an event to open its scanning and manual check-in tools.</p>
          </div>

          <div className="grid grid-cols-3 gap-1.5 sm:gap-2 md:min-w-[420px]">
            <div className="admin-card-muted flex items-center justify-between px-2 py-1.5 sm:px-3.5 sm:py-2.5">
              <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-slate sm:text-[10px] sm:tracking-[0.16em]">All</p>
              <p className="text-base font-semibold tracking-tight text-ink sm:text-xl">{events.length}</p>
            </div>
            <div className="admin-card-muted flex items-center justify-between px-2 py-1.5 sm:px-3.5 sm:py-2.5">
              <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-slate sm:text-[10px] sm:tracking-[0.16em]">Live</p>
              <p className="text-base font-semibold tracking-tight text-ink sm:text-xl">{liveEvents.length}</p>
            </div>
            <div className="admin-card-muted flex items-center justify-between px-2 py-1.5 sm:px-3.5 sm:py-2.5">
              <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-slate sm:text-[10px] sm:tracking-[0.16em]">Upcoming</p>
              <p className="text-base font-semibold tracking-tight text-ink sm:text-xl">{upcomingEvents.length}</p>
            </div>
          </div>
        </div>
      </section>

      {events.length === 0 ? (
        <section className="admin-card p-6 sm:p-8">
          <p className="admin-label">No events</p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-ink">No events available for check-in</h2>
          <p className="mt-2 text-sm text-slate">Create an event in the admin panel before staff can access check-in.</p>
        </section>
      ) : (
        <>
          <EventSection title="Live events" events={liveEvents} />
          <EventSection title="Upcoming events" events={upcomingEvents} />
          <EventSection title="Past events" events={pastEvents} />
        </>
      )}
    </main>
  );
}
