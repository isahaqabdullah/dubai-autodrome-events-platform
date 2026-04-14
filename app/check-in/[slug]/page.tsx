import Link from "next/link";
import { ArrowLeft, CalendarDays, MapPin, Search, Users } from "lucide-react";
import { notFound } from "next/navigation";
import { ManualCheckinButton } from "@/components/checkin/manual-checkin-button";
import { ScanConsole } from "@/components/checkin/scan-console";
import { StatusPill } from "@/components/ui/status-pill";
import { requireAuthenticatedUser } from "@/lib/auth";
import { formatEventDateRange, formatShortDateTime } from "@/lib/utils";
import { getScanAnalytics, searchRegistrationsForEvent } from "@/services/checkin";
import { getEventBySlug } from "@/services/events";

function getRegistrationTone(status: string) {
  if (status === "checked_in") {
    return "success" as const;
  }

  if (status === "revoked" || status === "cancelled") {
    return "danger" as const;
  }

  return "neutral" as const;
}

function formatRegistrationLabel(status: string) {
  return status.replaceAll("_", " ");
}

export default async function CheckinPage({
  params,
  searchParams
}: {
  params: { slug: string };
  searchParams: { q?: string };
}) {
  await requireAuthenticatedUser("staff");

  const event = await getEventBySlug(params.slug);

  if (!event) {
    notFound();
  }

  const [analytics, manualLookup] = await Promise.all([
    getScanAnalytics(event.id),
    searchParams.q ? searchRegistrationsForEvent(event.id, searchParams.q) : Promise.resolve([])
  ]);

  const summary = analytics.summary;
  const recentScans = analytics.recentActivity;
  const scanExceptions = summary.duplicateScans + summary.invalidScans;
  const completionRate =
    summary.totalRegistered > 0 ? Math.round((summary.totalCheckedIn / summary.totalRegistered) * 100) : 0;

  return (
    <main className="page-shell page-stack-compact">
      <section className="card-panel overflow-hidden">
        <div className="px-4 py-3.5 sm:px-6 sm:py-4 lg:px-7">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill tone="success">staff access</StatusPill>
              <StatusPill tone="neutral">check-in desk</StatusPill>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
              <Link href="/admin" className="inline-flex items-center gap-2 font-medium text-slate transition hover:text-ink">
                <ArrowLeft className="h-4 w-4" />
                Back to admin
              </Link>
            </div>

            <p className="section-title mt-3">Operations</p>
            <h1 className="mt-1.5 text-xl font-semibold tracking-tight text-ink sm:text-2xl">{event.title}</h1>

            <div className="mt-3 grid gap-3 text-sm text-slate sm:mt-4 sm:grid-cols-2">
              <div className="inline-flex items-start gap-3 rounded-2xl border border-slate/10 bg-[#f7fafc] px-4 py-3">
                <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-[#2f7b76]" />
                <span>{formatEventDateRange(event.start_at, event.end_at, event.timezone)}</span>
              </div>
              <div className="inline-flex items-start gap-3 rounded-2xl border border-slate/10 bg-[#f7fafc] px-4 py-3">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#d27a30]" />
                <span>{event.venue ?? "Venue to be announced"}</span>
              </div>
            </div>

            <div className="mt-3 grid gap-3 sm:mt-4 sm:grid-cols-2 md:grid-cols-3">
              <div className="rounded-2xl border border-slate/10 bg-white px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate">Checked in</p>
                <p className="mt-1.5 text-2xl font-semibold tracking-tight text-ink">{summary.totalCheckedIn}</p>
                <p className="mt-1.5 text-sm text-slate">{completionRate}% processed</p>
              </div>
              <div className="rounded-2xl border border-slate/10 bg-white px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate">Remaining</p>
                <p className="mt-1.5 text-2xl font-semibold tracking-tight text-ink">{summary.remaining}</p>
              </div>
              <div className="rounded-2xl border border-slate/10 bg-white px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate">Needs attention</p>
                <p className="mt-1.5 text-2xl font-semibold tracking-tight text-ink">{scanExceptions}</p>
              </div>
            </div>
        </div>
      </section>

      <ScanConsole eventId={event.id} initialRecentScans={recentScans} initialSummary={summary} />

      <section className="card-panel overflow-hidden">
        <div className="grid gap-0 lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[340px_minmax(0,1fr)]">
          <div className="border-b border-slate/10 bg-[#f7faf8] px-4 py-5 sm:px-6 sm:py-6 lg:border-b-0 lg:border-r">
            <div className="flex items-center gap-2 text-ink">
              <Users className="h-4 w-4 text-[#2f7b76]" />
              <p className="section-title">Manual fallback</p>
            </div>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-ink">Find attendee</h2>

            <form className="mt-6 space-y-3">
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-ink">Search registrations</span>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate" />
                  <input
                    name="q"
                    defaultValue={searchParams.q ?? ""}
                    placeholder="Name, email, or phone"
                    className="w-full rounded-2xl border border-slate/15 bg-white py-3 pl-11 pr-4 text-sm text-ink outline-none transition placeholder:text-slate/70 focus:border-[#2f7b76]/30 focus:bg-white focus:shadow-[0_0_0_4px_rgba(47,123,118,0.08)]"
                  />
                </div>
              </label>
              <button className="admin-action-primary w-full">Search attendee</button>
            </form>

            <div className="mt-6 rounded-2xl border border-slate/10 bg-white px-4 py-4 text-sm text-slate">
              <p className="font-semibold text-ink">Current result set</p>
              <p className="mt-2">
                {searchParams.q ? `${manualLookup.length} matching attendee${manualLookup.length === 1 ? "" : "s"}` : "Search to load matching attendees."}
              </p>
            </div>
          </div>

          <div className="px-5 py-6 sm:px-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="section-title">Search results</p>
                <h3 className="mt-2 text-xl font-semibold tracking-tight text-ink">Manual check-in candidates</h3>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {manualLookup.length === 0 ? (
                <div className="rounded-2xl border border-slate/10 bg-[#f8fafb] px-4 py-6 text-sm text-slate">
                  {searchParams.q ? "No matching registrations found." : "Run a search to display attendees here."}
                </div>
              ) : null}

              {manualLookup.map((registration) => (
                <div
                  key={registration.id}
                  className="flex flex-col gap-4 rounded-2xl border border-slate/10 bg-white px-4 py-4 lg:flex-row lg:items-center lg:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-ink">{String(registration.full_name)}</p>
                      <StatusPill tone={getRegistrationTone(String(registration.status))}>
                        {formatRegistrationLabel(String(registration.status))}
                      </StatusPill>
                    </div>
                    <p className="mt-2 truncate text-sm text-slate">{String(registration.email_raw)}</p>
                    <p className="mt-1 text-xs text-slate">
                      Created {formatShortDateTime(String(registration.created_at), event.timezone)}
                    </p>
                  </div>

                  <ManualCheckinButton
                    eventId={event.id}
                    registrationId={String(registration.id)}
                    className="rounded-2xl px-5 py-3"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
