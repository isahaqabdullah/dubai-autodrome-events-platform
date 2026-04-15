import Link from "next/link";
import { ArrowLeft, CalendarDays, MapPin, Users } from "lucide-react";
import { notFound } from "next/navigation";
import { ManualCheckinByEmail } from "@/components/checkin/manual-checkin-button";
import { ScanConsole } from "@/components/checkin/scan-console";
import { StatusPill } from "@/components/ui/status-pill";
import { requireAuthenticatedUser } from "@/lib/auth";
import { formatEventDateRange } from "@/lib/utils";
import { getScanAnalytics } from "@/services/checkin";
import { getEventBySlug } from "@/services/events";

export default async function CheckinPage({
  params
}: {
  params: { slug: string };
}) {
  await requireAuthenticatedUser("staff");

  const event = await getEventBySlug(params.slug);

  if (!event) {
    notFound();
  }

  const analytics = await getScanAnalytics(event.id);

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
        <div className="mx-auto w-full max-w-2xl px-5 py-6 sm:px-8 sm:py-8">
          <div className="flex items-center gap-2 text-ink">
            <Users className="h-4 w-4 text-[#2f7b76]" />
            <p className="section-title">Manual fallback</p>
          </div>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-ink">Check in by email</h2>
          <p className="mt-2 text-sm text-slate">
            Enter the attendee&apos;s registered email address to check them in directly.
          </p>

          <div className="mt-6">
            <ManualCheckinByEmail eventId={event.id} />
          </div>
        </div>
      </section>
    </main>
  );
}
