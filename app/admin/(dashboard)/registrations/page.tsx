import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { AnalyticsCards } from "@/components/admin/analytics-cards";
import { DownloadDropdown } from "@/components/admin/download-dropdown";
import { Pagination } from "@/components/admin/pagination";
import { RegistrationsFilters } from "@/components/admin/registrations-filters";
import { RegistrationsTable } from "@/components/admin/registrations-table";
import { StatusPill } from "@/components/ui/status-pill";
import { appendReturnTo, buildPathWithSearch } from "@/lib/admin-navigation";
import { isRetryableUpstreamError, withTransientRetry } from "@/lib/transient-retry";
import { formatEventDateRange, formatShortDateTime, getRegistrationWindowState } from "@/lib/utils";
import { getScanAnalytics } from "@/services/checkin";
import { listRegistrations } from "@/services/admin";
import { getEventById, listAdminEvents } from "@/services/events";

export const dynamic = "force-dynamic";

const DEFAULT_REGISTRATIONS_PAGE_SIZE = 25;
const REGISTRATIONS_PAGE_SIZE_OPTIONS = [25, 50, 100] as const;
const ACTIVITY_PAGE_SIZE = 10;

function parsePage(value: string | undefined) {
  const parsed = Number.parseInt(value ?? "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function parseRegistrationsPageSize(value: string | undefined) {
  const parsed = Number.parseInt(value ?? String(DEFAULT_REGISTRATIONS_PAGE_SIZE), 10);
  return REGISTRATIONS_PAGE_SIZE_OPTIONS.includes(parsed as (typeof REGISTRATIONS_PAGE_SIZE_OPTIONS)[number])
    ? parsed
    : DEFAULT_REGISTRATIONS_PAGE_SIZE;
}

export default async function RegistrationsPage({
  searchParams
}: {
  searchParams: { eventId?: string; status?: string; q?: string; page?: string; pageSize?: string; aPage?: string };
}) {
  const selectedEventId = searchParams.eventId?.trim() || undefined;
  const requestedRegistrationsPage = parsePage(searchParams.page);
  const registrationsPageSize = parseRegistrationsPageSize(searchParams.pageSize);
  let events: Awaited<ReturnType<typeof listAdminEvents>>;
  let registrations: Awaited<ReturnType<typeof listRegistrations>>;
  let selectedEvent: Awaited<ReturnType<typeof getEventById>>;
  let analytics: Awaited<ReturnType<typeof getScanAnalytics>> | null;
  let checkedInCount = 0;
  let revokedCount = 0;

  try {
    const registrationFilters = {
      eventId: selectedEventId,
      status: searchParams.status,
      query: searchParams.q
    };
    const loadRegistrations = (page: number, statusOverride?: string, pageSize = registrationsPageSize) =>
      withTransientRetry(
        () =>
          listRegistrations({
            ...registrationFilters,
            status: statusOverride ?? registrationFilters.status,
            page,
            pageSize
          }),
        { label: "admin registrations listRegistrations" }
      );

    const [requestedRegistrations, checkedInRegistrations, revokedRegistrations] = await Promise.all([
      loadRegistrations(requestedRegistrationsPage),
      !selectedEventId && !searchParams.status ? loadRegistrations(1, "checked_in", 1) : Promise.resolve(null),
      !selectedEventId && !searchParams.status ? loadRegistrations(1, "revoked", 1) : Promise.resolve(null)
    ]);

    const totalRegistrationPages = Math.max(1, Math.ceil(requestedRegistrations.total / registrationsPageSize));
    registrations =
      requestedRegistrationsPage > totalRegistrationPages && requestedRegistrations.total > 0
        ? await loadRegistrations(totalRegistrationPages)
        : requestedRegistrations;

    if (!selectedEventId) {
      checkedInCount =
        searchParams.status === "checked_in" ? registrations.total : checkedInRegistrations?.total ?? 0;
      revokedCount =
        searchParams.status === "revoked" ? registrations.total : revokedRegistrations?.total ?? 0;
    }

    [events, selectedEvent] = await Promise.all([
      withTransientRetry(() => listAdminEvents(), { label: "admin registrations listAdminEvents" }),
      selectedEventId
        ? withTransientRetry(() => getEventById(selectedEventId), { label: "admin registrations getEventById" })
        : Promise.resolve(null)
    ]);
    if (selectedEvent) {
      const analyticsEventId = selectedEvent.id;
      analytics = await withTransientRetry(() => getScanAnalytics(analyticsEventId), {
        label: "admin registrations getScanAnalytics"
      });
    } else {
      analytics = null;
    }
  } catch (error) {
    if (!isRetryableUpstreamError(error)) {
      throw error;
    }

    return (
      <main className="admin-page">
        <section className="admin-card p-4 sm:p-6">
          <div className="max-w-2xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate">Registrations</p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-ink sm:text-2xl">Live data temporarily unavailable</h2>
            <p className="mt-2 text-sm text-slate sm:text-base">
              The admin page is configured to fetch the latest registrations on every request. A temporary upstream gateway error
              interrupted this load, so the page could not safely show current data.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <a href="/admin/registrations" className="admin-action-primary">
                Retry now
              </a>
              <Link href="/admin" className="admin-action">
                Back to admin
              </Link>
            </div>
          </div>
        </section>
      </main>
    );
  }

  const registrationState = selectedEvent ? getRegistrationWindowState(selectedEvent) : null;
  const totalRows = registrations.total;
  const registrationsPage = Math.min(
    requestedRegistrationsPage,
    Math.max(1, Math.ceil(totalRows / registrationsPageSize))
  );
  const pagedRows = registrations.rows;
  const normalizedSearchParams = {
    ...searchParams,
    pageSize:
      registrationsPageSize === DEFAULT_REGISTRATIONS_PAGE_SIZE ? undefined : String(registrationsPageSize),
    page: registrationsPage > 1 ? String(registrationsPage) : undefined
  };
  const currentRegistrationsHref = buildPathWithSearch("/admin/registrations", normalizedSearchParams);
  const activityTimeZone = selectedEvent?.timezone ?? "Asia/Dubai";

  const totalActivity = analytics?.recentActivity.length ?? 0;
  const activityPage = Math.min(
    parsePage(searchParams.aPage),
    Math.max(1, Math.ceil(totalActivity / ACTIVITY_PAGE_SIZE))
  );
  const pagedActivity = analytics
    ? analytics.recentActivity.slice(
        (activityPage - 1) * ACTIVITY_PAGE_SIZE,
        activityPage * ACTIVITY_PAGE_SIZE
      )
    : [];

  return (
    <main className="admin-page">
      <section className="admin-card p-2.5 sm:p-3.5">
        <div className="flex flex-col gap-3">
          <a href="/admin" className="admin-back-link self-start">
            <ArrowLeft className="h-4 w-4" />
            Back to admin
          </a>

          <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
            <div className="min-w-0">
              <div className="mb-0.5 flex flex-wrap items-center gap-1.5 text-[11px] sm:mb-1 sm:text-xs">
                <Link href="/admin" className="font-medium text-slate transition hover:text-ink">
                  Admin
                </Link>
                <span className="text-slate/50">/</span>
                <span className="font-medium text-slate">Registrations</span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                <h2 className="text-[13px] font-semibold tracking-tight text-ink sm:text-base">
                  {selectedEvent?.title ?? "All events"}
                </h2>
                {selectedEvent ? (
                  <>
                    <StatusPill
                      tone={
                        selectedEvent.status === "live"
                          ? "success"
                          : selectedEvent.status === "draft" || selectedEvent.status === "archived"
                            ? "warning"
                            : "neutral"
                      }
                    >
                      {selectedEvent.status}
                    </StatusPill>
                    {registrationState ? (
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
                    ) : null}
                  </>
                ) : null}
              </div>
              {selectedEvent ? (
                <p className="mt-0.5 text-[11px] text-slate sm:text-xs">
                  {formatEventDateRange(selectedEvent.start_at, selectedEvent.end_at, selectedEvent.timezone)}
                </p>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-1 sm:gap-1.5">
              {selectedEvent ? (
                <>
                  <DownloadDropdown eventId={selectedEvent.id} />
                  <a
                    href={appendReturnTo(`/check-in/${selectedEvent.slug}`, currentRegistrationsHref)}
                    className="admin-action-primary"
                  >
                    Check in
                  </a>
                  <a
                    href={appendReturnTo(`/admin/events/${selectedEvent.id}/edit`, currentRegistrationsHref)}
                    className="admin-action"
                  >
                    Edit
                  </a>
                  <Link href={`/events/${selectedEvent.slug}`} className="admin-action">
                    Public
                  </Link>
                </>
              ) : (
                <>
                  <div className="admin-card-muted flex items-center gap-1.5 px-2 py-1 sm:gap-2 sm:px-3 sm:py-1.5">
                    <span className="text-[10px] text-slate sm:text-xs">Rows</span>
                    <span className="text-xs font-semibold text-ink sm:text-sm">{totalRows}</span>
                  </div>
                  <div className="admin-card-muted flex items-center gap-1.5 px-2 py-1 sm:gap-2 sm:px-3 sm:py-1.5">
                    <span className="text-[10px] text-slate sm:text-xs">Checked in</span>
                    <span className="text-xs font-semibold text-ink sm:text-sm">{checkedInCount}</span>
                  </div>
                  <div className="admin-card-muted flex items-center gap-1.5 px-2 py-1 sm:gap-2 sm:px-3 sm:py-1.5">
                    <span className="text-[10px] text-slate sm:text-xs">Revoked</span>
                    <span className="text-xs font-semibold text-ink sm:text-sm">{revokedCount}</span>
                  </div>
                  <div className="admin-card-muted flex items-center gap-1.5 px-2 py-1 sm:gap-2 sm:px-3 sm:py-1.5">
                    <span className="text-[10px] text-slate sm:text-xs">Events</span>
                    <span className="text-xs font-semibold text-ink sm:text-sm">{events.length}</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      {analytics ? <AnalyticsCards summary={analytics.summary} hideDetail /> : null}

      <section className="rounded-xl border-2 border-ink/25 bg-ink/[0.03] p-2 sm:p-3.5">
        <RegistrationsFilters
          events={events.map((event) => ({ id: event.id, title: event.title }))}
          selectedEventId={selectedEventId}
          status={searchParams.status}
          query={searchParams.q}
          pageSize={registrationsPageSize}
          pageSizeOptions={REGISTRATIONS_PAGE_SIZE_OPTIONS}
        />
      </section>

      <RegistrationsTable rows={pagedRows} returnTo={currentRegistrationsHref} timeZone={activityTimeZone} />

      <Pagination
        currentPage={registrationsPage}
        totalItems={totalRows}
        pageSize={registrationsPageSize}
        paramKey="page"
        searchParams={normalizedSearchParams}
      />

      {analytics ? (
        <section className="admin-card p-2.5 sm:p-3.5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate sm:text-xs">Recent activity</h3>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate sm:text-xs">
              {analytics.recentActivity.length}
            </span>
          </div>

          <div className="mt-1.5 space-y-1 sm:mt-2 sm:space-y-1.5">
            {analytics.recentActivity.length === 0 ? (
              <div className="admin-card-muted px-3 py-3 text-xs text-slate">No scan activity yet.</div>
            ) : null}

            {pagedActivity.map((scan) => (
              <div
                key={scan.id}
                className="admin-card-muted flex items-center justify-between gap-2 px-2 py-1.5 sm:px-3 sm:py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-ink sm:text-sm">{scan.registration?.full_name ?? "Unknown attendee"}</p>
                  {scan.registration?.email_raw ? <p className="hidden truncate text-xs text-slate sm:block">{scan.registration.email_raw}</p> : null}
                </div>
                <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
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
                  <span className="hidden text-xs text-slate sm:inline">
                    {scan.gate_name ? `${scan.gate_name} · ` : ""}
                    {formatShortDateTime(scan.scanned_at, activityTimeZone)}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <Pagination
            currentPage={activityPage}
            totalItems={totalActivity}
            pageSize={ACTIVITY_PAGE_SIZE}
            paramKey="aPage"
            searchParams={searchParams}
          />
        </section>
      ) : null}
    </main>
  );
}
