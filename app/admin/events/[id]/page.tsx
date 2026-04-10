import type { Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AnalyticsCards } from "@/components/admin/analytics-cards";
import { StatusPill } from "@/components/ui/status-pill";
import { formatEventDateRange, formatShortDateTime, getRegistrationWindowState } from "@/lib/utils";
import { getScanAnalytics } from "@/services/checkin";
import { getEventById } from "@/services/events";

function ActionLink({
  href,
  children,
  variant = "secondary"
}: {
  href: string;
  children: React.ReactNode;
  variant?: "primary" | "secondary";
}) {
  return (
    <Link
      href={href as Route}
      className={
        variant === "primary"
          ? "inline-flex items-center justify-center rounded-2xl border border-ink bg-ink px-4 py-3 text-sm font-semibold text-white transition hover:bg-ink/92"
          : "inline-flex items-center justify-center rounded-2xl border border-slate/15 bg-white/80 px-4 py-3 text-sm font-semibold text-ink transition hover:border-slate/30 hover:bg-mist/70"
      }
    >
      {children}
    </Link>
  );
}

function ExportLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className="inline-flex items-center justify-center rounded-2xl border border-slate/15 bg-white/80 px-4 py-3 text-sm font-semibold text-ink transition hover:border-slate/30 hover:bg-mist/70"
    >
      {children}
    </a>
  );
}

export default async function EventAnalyticsPage({
  params
}: {
  params: { id: string };
}) {
  const event = await getEventById(params.id);

  if (!event) {
    notFound();
  }

  const analytics = await getScanAnalytics(event.id);
  const registrationState = getRegistrationWindowState(event);

  return (
    <main className="space-y-5 sm:space-y-6">
      <section className="card-panel overflow-hidden p-5 sm:p-6 lg:p-7">
        <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-r from-gold/20 via-white/0 to-aurora/35" />
        <div className="relative space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/admin" className="text-sm font-medium text-slate transition hover:text-ink">
              Admin
            </Link>
            <span className="text-slate/50">/</span>
            <span className="text-sm font-medium text-slate">Analytics</span>
          </div>

          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="max-w-3xl">
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
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">{event.title}</h1>
              <p className="mt-3 text-sm text-slate sm:text-base">
                {formatEventDateRange(event.start_at, event.end_at, event.timezone)}
              </p>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm text-slate">
                <span>{event.venue ?? "Venue TBD"}</span>
                <span>Timezone: {event.timezone}</span>
                <span>Capacity: {event.capacity ?? "Open"}</span>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:w-[420px]">
              <ActionLink href={`/check-in/${event.slug}`} variant="primary">
                Check-in
              </ActionLink>
              <ActionLink href={`/admin/registrations?eventId=${event.id}`}>Registrations</ActionLink>
              <ExportLink href={`/api/admin/export/registrations?eventId=${event.id}`}>
                Export registrations
              </ExportLink>
              <ExportLink href={`/api/admin/export/checkins?eventId=${event.id}`}>
                Export scans
              </ExportLink>
              <ActionLink href={`/events/${event.slug}`}>Public view</ActionLink>
            </div>
          </div>
        </div>
      </section>

      <AnalyticsCards summary={analytics.summary} />

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="card-panel p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="section-title">Recent scan activity</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink">Latest check-in outcomes</h2>
            </div>
            <span className="rounded-full border border-slate/15 bg-white/80 px-3 py-1 text-sm font-medium text-slate">
              {analytics.recentActivity.length} latest attempts
            </span>
          </div>
          <div className="mt-5 space-y-3">
            {analytics.recentActivity.length === 0 ? (
              <div className="rounded-[24px] border border-slate/10 bg-mist/35 px-4 py-5 text-sm text-slate">
                No scan activity yet.
              </div>
            ) : null}
            {analytics.recentActivity.map((scan) => (
              <div
                key={scan.id}
                className="flex flex-col gap-3 rounded-[24px] border border-slate/10 bg-white/75 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-semibold text-ink">{scan.registration?.full_name ?? "Unknown attendee"}</p>
                  <p className="text-sm text-slate">{scan.registration?.email_raw ?? "No email attached"}</p>
                </div>
                <div className="text-left sm:text-right">
                  <StatusPill
                    tone={
                      scan.result === "success"
                        ? "success"
                        : scan.result === "already_checked_in"
                          ? "warning"
                          : "danger"
                    }
                  >
                    {scan.result.replaceAll("_", " ")}
                  </StatusPill>
                  <p className="mt-2 text-xs text-slate">
                    {scan.gate_name ?? "Unspecified gate"} · {formatShortDateTime(scan.scanned_at)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card-panel p-5 sm:p-6">
          <p className="section-title">Event details</p>
          <div className="mt-4 grid gap-3">
            <div className="rounded-[24px] border border-slate/10 bg-mist/35 p-4">
              <p className="text-sm font-semibold text-ink">Registration</p>
              <p className="mt-2 text-sm text-slate">{registrationState.label}</p>
            </div>
            <div className="rounded-[24px] border border-slate/10 bg-mist/35 p-4">
              <p className="text-sm font-semibold text-ink">Declaration version</p>
              <p className="mt-2 text-sm text-slate">Version {event.declaration_version}</p>
            </div>
            <div className="rounded-[24px] border border-slate/10 bg-mist/35 p-4">
              <p className="text-sm font-semibold text-ink">Public route</p>
              <p className="mt-2 break-all font-mono text-xs text-slate">/events/{event.slug}</p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
