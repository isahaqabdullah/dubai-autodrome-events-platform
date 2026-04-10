import type { Route } from "next";
import Link from "next/link";
import { StatusPill } from "@/components/ui/status-pill";
import type { EventRecord } from "@/lib/types";
import { formatEventDateRange, getRegistrationWindowState } from "@/lib/utils";
import { listAdminEvents } from "@/services/events";

function ActionLink({
  href,
  children,
  variant = "secondary",
  compact = false
}: {
  href: string;
  children: React.ReactNode;
  variant?: "primary" | "secondary";
  compact?: boolean;
}) {
  return (
    <Link
      href={href as Route}
      className={
        variant === "primary"
          ? `inline-flex items-center justify-center rounded-2xl border border-ink bg-ink font-semibold text-white transition hover:bg-ink/92 ${
              compact ? "px-3 py-2 text-xs sm:text-sm" : "px-4 py-3 text-sm"
            }`
          : `inline-flex items-center justify-center rounded-2xl border border-slate/15 bg-white/80 font-semibold text-ink transition hover:border-slate/30 hover:bg-mist/70 ${
              compact ? "px-3 py-2 text-xs sm:text-sm" : "px-4 py-3 text-sm"
            }`
      }
    >
      {children}
    </Link>
  );
}

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
    <section className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="section-title">{title}</p>
          <h2 className="mt-1.5 text-xl font-semibold tracking-tight text-ink sm:text-2xl">{title}</h2>
        </div>
        <span className="rounded-full border border-slate/15 bg-white/80 px-3 py-1 text-sm font-medium text-slate">
          {events.length} event{events.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="card-panel overflow-hidden">
        {events.map((event) => {
          const registrationState = getRegistrationWindowState(event);

          return (
            <article key={event.id} className="border-b border-slate/10 last:border-b-0">
              <div className="flex flex-col gap-3 px-4 py-3 sm:px-5 sm:py-3.5 lg:grid lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
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
                  <h3 className="mt-2 truncate text-base font-semibold tracking-tight text-ink sm:text-lg">
                    {event.title}
                  </h3>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate sm:text-sm">
                    <span>{formatEventDateRange(event.start_at, event.end_at, event.timezone)}</span>
                    <span>{event.venue ?? "Venue TBD"}</span>
                    <span>Cap {event.capacity ?? "Open"}</span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5 lg:max-w-[620px] lg:justify-end">
                  <ActionLink href={`/check-in/${event.slug}`} variant="primary" compact>
                    Check-in
                  </ActionLink>
                  <ActionLink href={`/admin/registrations?eventId=${event.id}`} compact>
                    Registrations
                  </ActionLink>
                  <ActionLink href={`/admin/events/${event.id}`} compact>
                    Analytics
                  </ActionLink>
                  <ActionLink href={`/admin/events/${event.id}/edit`} compact>
                    Edit
                  </ActionLink>
                  <ActionLink href={`/events/${event.slug}`} compact>
                    Public view
                  </ActionLink>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export default async function AdminDashboardPage() {
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
  const registrationOpenCount = events.filter(
    (event) => getRegistrationWindowState(event).state === "open"
  ).length;

  return (
    <main className="space-y-5 sm:space-y-6">
      <section className="card-panel overflow-hidden p-4 sm:p-5">
        <div className="flex flex-col gap-4 border-b border-slate/10 pb-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="section-title">Operations overview</p>
            <h2 className="mt-1.5 text-xl font-semibold tracking-tight text-ink sm:text-2xl">Event queue</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <ActionLink href="/admin/events/new" variant="primary" compact>
              Create event
            </ActionLink>
            <ActionLink href="/admin/registrations" compact>
              Registrations desk
            </ActionLink>
          </div>
        </div>

        <div className="grid gap-2 pt-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="flex items-center justify-between rounded-[20px] border border-slate/10 bg-white/80 px-4 py-3">
            <p className="section-title">All events</p>
            <p className="text-2xl font-semibold tracking-tight text-ink">{events.length}</p>
          </div>
          <div className="flex items-center justify-between rounded-[20px] border border-slate/10 bg-white/80 px-4 py-3">
            <p className="section-title">Registration open</p>
            <p className="text-2xl font-semibold tracking-tight text-ink">{registrationOpenCount}</p>
          </div>
          <div className="flex items-center justify-between rounded-[20px] border border-slate/10 bg-white/80 px-4 py-3">
            <p className="section-title">Live now</p>
            <p className="text-2xl font-semibold tracking-tight text-ink">{liveEvents.length}</p>
          </div>
          <div className="flex items-center justify-between rounded-[20px] border border-slate/10 bg-white/80 px-4 py-3">
            <p className="section-title">Past editions</p>
            <p className="text-2xl font-semibold tracking-tight text-ink">{pastEvents.length}</p>
          </div>
        </div>
      </section>

      {events.length === 0 ? (
        <section className="card-panel p-6 sm:p-8">
          <p className="section-title">Start here</p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-ink">Create the first event edition</h2>
          <div className="mt-5">
            <ActionLink href="/admin/events/new" variant="primary">
              Create your first event
            </ActionLink>
          </div>
        </section>
      ) : (
        <>
          <EventSection title="Live events" events={liveEvents} />
          <EventSection title="Upcoming and draft events" events={upcomingEvents} />
          <EventSection title="Past events" events={pastEvents} />
        </>
      )}
    </main>
  );
}
