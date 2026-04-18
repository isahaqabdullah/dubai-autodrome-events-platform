import type { Route } from "next";
import Link from "next/link";
import { AdminNav } from "@/components/admin/admin-nav";
import { DeleteEventButton } from "@/components/admin/delete-event-button";
import { StatusPill } from "@/components/ui/status-pill";
import { appendReturnTo } from "@/lib/admin-navigation";
import type { EventRecord } from "@/lib/types";
import { formatEventDateRange, getRegistrationWindowState } from "@/lib/utils";
import { listAdminEvents } from "@/services/events";

function ActionLink({
  href,
  children,
  variant = "secondary",
  compact = false,
  fresh = false
}: {
  href: string;
  children: React.ReactNode;
  variant?: "primary" | "secondary";
  compact?: boolean;
  fresh?: boolean;
}) {
  const className =
    variant === "primary"
      ? `inline-flex items-center justify-center font-semibold text-white transition hover:bg-ink/92 ${
          compact ? "rounded-lg border border-ink bg-ink px-2.5 py-1.5 text-[11px] sm:rounded-2xl sm:px-3 sm:py-2 sm:text-xs" : "rounded-2xl border border-ink bg-ink px-4 py-3 text-sm"
        }`
      : `inline-flex items-center justify-center font-semibold text-ink transition hover:border-slate/30 hover:bg-slate-50 ${
          compact ? "rounded-lg border border-slate/15 bg-white px-2.5 py-1.5 text-[11px] sm:rounded-2xl sm:px-3 sm:py-2 sm:text-xs" : "rounded-2xl border border-slate/15 bg-white px-4 py-3 text-sm"
        }`;

  return fresh ? (
    <a href={href} className={className}>
      {children}
    </a>
  ) : (
    <Link href={href as Route} className={className}>
      {children}
    </Link>
  );
}

function EventSection({
  title,
  events,
  showStatusPills = true
}: {
  title: string;
  events: EventRecord[];
  showStatusPills?: boolean;
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
        {events.map((event) => {
          const registrationState = getRegistrationWindowState(event);

          return (
            <article key={event.id} className="border-b border-slate/10 px-3 py-2.5 last:border-b-0 sm:px-5 sm:py-3.5">
              <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
                <div className="min-w-0 xl:flex-1">
                  <div className="flex flex-wrap items-center gap-1.5 sm:gap-2.5">
                    <h3 className="truncate text-[13px] font-semibold tracking-tight text-ink sm:text-base">
                      {event.title}
                    </h3>
                    {showStatusPills && (
                      <>
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
                      </>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs font-medium text-ink/70 sm:mt-1 sm:text-sm">
                    {formatEventDateRange(event.start_at, event.end_at, event.timezone)}
                  </p>
                </div>

                <div className="flex flex-wrap gap-1 sm:gap-2 xl:justify-end">
                  <ActionLink href={appendReturnTo(`/check-in/${event.slug}`, "/admin")} variant="primary" compact fresh>
                    Check in
                  </ActionLink>
                  <ActionLink href={appendReturnTo(`/admin/events/${event.id}/edit`, "/admin")} compact>
                    Edit
                  </ActionLink>
                  <ActionLink href={`/admin/registrations?eventId=${event.id}`} compact fresh>
                    Registrations
                  </ActionLink>
                  <ActionLink href={`/events/${event.slug}`} compact>
                    Public
                  </ActionLink>
                  <DeleteEventButton eventId={event.id} eventTitle={event.title} />
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
    <main className="admin-page">
      <section className="admin-card p-2.5 sm:p-4">
        <div className="flex flex-col gap-2 sm:gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <p className="admin-label">Dashboard</p>
            <h2 className="mt-0.5 text-sm font-semibold tracking-tight text-ink sm:mt-1 sm:text-xl">Events</h2>
          </div>

          <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-4 sm:gap-2 md:grid-cols-4 xl:min-w-[680px]">
            <div className="admin-card-muted flex items-center justify-between px-2 py-1.5 sm:px-3.5 sm:py-2.5">
              <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-slate sm:text-[10px] sm:tracking-[0.16em]">All</p>
              <p className="text-base font-semibold tracking-tight text-ink sm:text-xl">{events.length}</p>
            </div>
            <div className="admin-card-muted flex items-center justify-between px-2 py-1.5 sm:px-3.5 sm:py-2.5">
              <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-slate sm:text-[10px] sm:tracking-[0.16em]">Open</p>
              <p className="text-base font-semibold tracking-tight text-ink sm:text-xl">{registrationOpenCount}</p>
            </div>
            <div className="admin-card-muted flex items-center justify-between px-2 py-1.5 sm:px-3.5 sm:py-2.5">
              <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-slate sm:text-[10px] sm:tracking-[0.16em]">Live</p>
              <p className="text-base font-semibold tracking-tight text-ink sm:text-xl">{liveEvents.length}</p>
            </div>
            <div className="admin-card-muted flex items-center justify-between px-2 py-1.5 sm:px-3.5 sm:py-2.5">
              <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-slate sm:text-[10px] sm:tracking-[0.16em]">Past</p>
              <p className="text-base font-semibold tracking-tight text-ink sm:text-xl">{pastEvents.length}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-2 sm:space-y-3">
        <div>
          <p className="admin-label">Quick Actions</p>
          <h3 className="mt-0.5 text-sm font-semibold tracking-tight text-ink sm:mt-1 sm:text-xl">
            Events, creation, registrations, and analytics
          </h3>
        </div>
        <AdminNav activeStyle="line" />
      </section>

      {events.length === 0 ? (
        <section className="admin-card p-6 sm:p-8">
          <p className="admin-label">No events</p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-ink">Create the first event</h2>
          <div className="mt-4">
            <ActionLink href={appendReturnTo("/admin/events/new", "/admin")} variant="primary">
              Create event
            </ActionLink>
          </div>
        </section>
      ) : (
        <>
          <EventSection title="Live events" events={liveEvents} />
          <EventSection title="Upcoming and draft events" events={upcomingEvents} showStatusPills={false} />
          <EventSection title="Past events" events={pastEvents} />
        </>
      )}
    </main>
  );
}
