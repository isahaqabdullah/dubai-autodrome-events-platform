import Link from "next/link";
import { notFound } from "next/navigation";
import { ManualCheckinButton } from "@/components/checkin/manual-checkin-button";
import { ScanConsole } from "@/components/checkin/scan-console";
import { StatusPill } from "@/components/ui/status-pill";
import { requireAuthenticatedUser } from "@/lib/auth";
import { formatEventDateRange, formatShortDateTime } from "@/lib/utils";
import { getRecentCheckins, getScanAnalytics, searchRegistrationsForEvent } from "@/services/checkin";
import { getEventBySlug } from "@/services/events";

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

  const [recentScans, analytics, manualLookup] = await Promise.all([
    getRecentCheckins(event.id, 10),
    getScanAnalytics(event.id),
    searchParams.q ? searchRegistrationsForEvent(event.id, searchParams.q) : Promise.resolve([])
  ]);

  return (
    <main className="page-shell space-y-5 sm:space-y-6">
      <section className="card-panel overflow-hidden p-5 sm:p-6 lg:p-7">
        <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-r from-gold/20 via-white/0 to-aurora/35" />
        <div className="relative flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill tone="success">staff access</StatusPill>
              <Link href="/admin" className="text-sm font-medium text-slate transition hover:text-ink">
                Back to admin
              </Link>
            </div>
            <p className="section-title mt-4">Check-in station</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">{event.title}</h1>
            <p className="mt-3 text-sm text-slate sm:text-base">
              {formatEventDateRange(event.start_at, event.end_at, event.timezone)}
            </p>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm text-slate">
              <span>{event.venue ?? "Venue TBD"}</span>
              <span>Timezone: {event.timezone}</span>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:w-[420px]">
            <Link
              href={`/admin/events/${event.id}`}
              className="inline-flex items-center justify-center rounded-2xl border border-slate/15 bg-white/80 px-4 py-3 text-sm font-semibold text-ink transition hover:border-slate/30 hover:bg-mist/70"
            >
              Analytics
            </Link>
            <Link
              href={`/admin/registrations?eventId=${event.id}`}
              className="inline-flex items-center justify-center rounded-2xl border border-slate/15 bg-white/80 px-4 py-3 text-sm font-semibold text-ink transition hover:border-slate/30 hover:bg-mist/70"
            >
              Registrations
            </Link>
          </div>
        </div>
      </section>

      <ScanConsole
        eventId={event.id}
        initialRecentScans={recentScans}
        initialSummary={analytics.summary}
      />

      <section className="card-panel p-5 sm:p-6">
        <p className="section-title">Manual lookup</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink">Search by attendee details</h2>

        <form className="mt-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          <input
            name="q"
            defaultValue={searchParams.q ?? ""}
            placeholder="Search by name, email, or phone"
            className="w-full rounded-2xl border border-slate/15 bg-white/90 px-4 py-3 text-sm text-ink outline-none transition placeholder:text-slate/70 focus:border-ink/30 focus:bg-white focus:shadow-[0_0_0_4px_rgba(19,32,42,0.06)]"
          />
          <button className="inline-flex items-center justify-center rounded-2xl border border-ink bg-ink px-4 py-3 text-sm font-semibold text-white transition hover:bg-ink/92">
            Search
          </button>
        </form>

        <div className="mt-5 space-y-3">
          {manualLookup.length === 0 ? (
            <div className="rounded-[24px] border border-slate/10 bg-mist/35 px-4 py-5 text-sm text-slate">
              {searchParams.q ? "No matching registrations found." : "Search registrations."}
            </div>
          ) : null}
          {manualLookup.map((registration) => (
            <div
              key={registration.id}
              className="flex flex-col gap-4 rounded-[24px] border border-slate/10 bg-white/80 px-4 py-4 lg:flex-row lg:items-center lg:justify-between"
            >
              <div className="min-w-0">
                <p className="font-semibold text-ink">{String(registration.full_name)}</p>
                <p className="truncate text-sm text-slate">{String(registration.email_raw)}</p>
                <p className="text-xs text-slate">
                  {String(registration.status).replaceAll("_", " ")} ·{" "}
                  {formatShortDateTime(String(registration.created_at))}
                </p>
              </div>
              <ManualCheckinButton eventId={event.id} registrationId={String(registration.id)} />
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
