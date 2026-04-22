import { ArrowLeft, CalendarDays, MapPin, Users } from "lucide-react";
import { notFound } from "next/navigation";
import { ManualCheckinByCode, ManualCheckinByName } from "@/components/checkin/manual-checkin-button";
import { ScanConsole } from "@/components/checkin/scan-console";
import { StatusPill } from "@/components/ui/status-pill";
import { getAdminBackLabel, normalizeAdminReturnTo } from "@/lib/admin-navigation";
import { requireAuthenticatedUser } from "@/lib/auth";
import { formatEventDateRange } from "@/lib/utils";
import { getScanAnalytics } from "@/services/checkin";
import { getEventBySlug } from "@/services/events";

export default async function CheckinPage({
  params,
  searchParams
}: {
  params: { slug: string };
  searchParams: { returnTo?: string };
}) {
  const user = await requireAuthenticatedUser("staff");
  const event = await getEventBySlug(params.slug);

  if (!event) {
    notFound();
  }

  const analytics = await getScanAnalytics(event.id, user.gateName);
  const backHref = normalizeAdminReturnTo(searchParams.returnTo, "/admin");
  const backLabel = getAdminBackLabel(backHref);

  const summary = analytics.summary;
  const recentScans = analytics.recentActivity;
  const scanExceptions = summary.duplicateScans + summary.invalidScans;
  const completionRate =
    summary.totalRegistered > 0 ? Math.round((summary.totalCheckedIn / summary.totalRegistered) * 100) : 0;

  return (
    <main className="page-stack-compact">
      <section className="card-panel overflow-hidden">
        <div className="px-3.5 py-2.5 sm:px-6 sm:py-4 lg:px-7">
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <StatusPill tone="success">staff access</StatusPill>
            <StatusPill tone="neutral">check-in desk</StatusPill>
            <StatusPill tone="neutral">{user.gateName}</StatusPill>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-3 text-[13px] sm:mt-3 sm:text-sm">
            <a href={backHref} className="admin-back-link self-start">
              <ArrowLeft className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              {backLabel}
            </a>
          </div>

          <p className="section-title mt-2 sm:mt-3">Operations</p>
          <h1 className="mt-1 text-base font-semibold tracking-tight text-ink sm:mt-1.5 sm:text-2xl">{event.title}</h1>

          <div className="mt-2 grid gap-2 text-[13px] text-slate sm:mt-4 sm:gap-3 sm:grid-cols-2 sm:text-sm">
            <div className="inline-flex items-start gap-2 rounded-xl border border-slate/10 bg-[#f7fafc] px-3 py-2 sm:gap-3 sm:rounded-2xl sm:px-4 sm:py-3">
              <CalendarDays className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#2f7b76] sm:h-4 sm:w-4" />
              <span>{formatEventDateRange(event.start_at, event.end_at, event.timezone)}</span>
            </div>
            <div className="inline-flex items-start gap-2 rounded-xl border border-slate/10 bg-[#f7fafc] px-3 py-2 sm:gap-3 sm:rounded-2xl sm:px-4 sm:py-3">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#d27a30] sm:h-4 sm:w-4" />
              <span className="line-clamp-1">{event.venue ?? "Venue to be announced"}</span>
            </div>
          </div>

          <div className="mt-2 grid grid-cols-2 gap-2 sm:mt-4 sm:gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-slate/10 bg-white px-3 py-2 sm:rounded-2xl sm:px-4 sm:py-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate sm:text-[11px] sm:tracking-[0.16em]">Checked in</p>
              <p className="mt-1 text-lg font-semibold tracking-tight text-ink sm:mt-1.5 sm:text-2xl">{summary.totalCheckedIn}</p>
              <p className="mt-0.5 hidden text-sm text-slate sm:block">{completionRate}% processed</p>
            </div>
            <div className="rounded-xl border border-slate/10 bg-white px-3 py-2 sm:rounded-2xl sm:px-4 sm:py-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate sm:text-[11px] sm:tracking-[0.16em]">Remaining</p>
              <p className="mt-1 text-lg font-semibold tracking-tight text-ink sm:mt-1.5 sm:text-2xl">{summary.remaining}</p>
            </div>
            <div className="rounded-xl border border-slate/10 bg-white px-3 py-2 sm:rounded-2xl sm:px-4 sm:py-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate sm:text-[11px] sm:tracking-[0.16em]">Attention</p>
              <p className="mt-1 text-lg font-semibold tracking-tight text-ink sm:mt-1.5 sm:text-2xl">{scanExceptions}</p>
            </div>
          </div>
        </div>
      </section>

      <ScanConsole
        eventId={event.id}
        eventTimeZone={event.timezone}
        initialRecentScans={recentScans}
        initialSummary={summary}
        assignedGateName={user.gateName}
      />

      <section className="card-panel overflow-hidden">
        <div className="mx-auto w-full max-w-2xl px-3.5 py-4 sm:px-8 sm:py-8">
          <div className="flex items-center gap-2 text-ink">
            <Users className="h-4 w-4 text-[#2f7b76]" />
            <p className="section-title">Manual fallback</p>
          </div>
          <h2 className="mt-2 text-lg font-semibold tracking-tight text-ink sm:mt-3 sm:text-2xl">
            Check in by code or name
          </h2>
          <p className="mt-1.5 text-[13px] text-slate sm:mt-2 sm:text-sm">
            Enter the 4-character code from the ticket, or type at least 4 letters from an attendee&apos;s name to get
            event-scoped recommendations.
          </p>

          <div className="mt-4 sm:mt-6">
            <ManualCheckinByCode eventId={event.id} />
          </div>

          <div className="mt-6 border-t border-slate/10 pt-6">
            <ManualCheckinByName eventId={event.id} />
          </div>
        </div>
      </section>
    </main>
  );
}
