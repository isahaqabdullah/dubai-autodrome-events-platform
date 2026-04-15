import Link from "next/link";
import { AnalyticsCards } from "@/components/admin/analytics-cards";
import { DownloadDropdown } from "@/components/admin/download-dropdown";
import { Pagination } from "@/components/admin/pagination";
import { RegistrationsTable } from "@/components/admin/registrations-table";
import { StatusPill } from "@/components/ui/status-pill";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatEventDateRange, formatShortDateTime, getRegistrationWindowState } from "@/lib/utils";
import { getScanAnalytics } from "@/services/checkin";
import { listRegistrations } from "@/services/admin";
import { getEventById, listAdminEvents } from "@/services/events";

const REGISTRATIONS_PAGE_SIZE = 25;
const ACTIVITY_PAGE_SIZE = 10;

function parsePage(value: string | undefined) {
  const parsed = Number.parseInt(value ?? "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export default async function RegistrationsPage({
  searchParams
}: {
  searchParams: { eventId?: string; status?: string; q?: string; page?: string; aPage?: string };
}) {
  const selectedEventId = searchParams.eventId?.trim() || undefined;
  const [events, rows, selectedEvent] = await Promise.all([
    listAdminEvents(),
    listRegistrations({
      eventId: selectedEventId,
      status: searchParams.status,
      query: searchParams.q
    }),
    selectedEventId ? getEventById(selectedEventId) : Promise.resolve(null)
  ]);
  const analytics = selectedEvent ? await getScanAnalytics(selectedEvent.id) : null;
  const checkedInCount = rows.filter((row) => String(row.status ?? "") === "checked_in").length;
  const revokedCount = rows.filter((row) => String(row.status ?? "") === "revoked").length;
  const registrationState = selectedEvent ? getRegistrationWindowState(selectedEvent) : null;

  const totalRows = rows.length;
  const registrationsPage = Math.min(
    parsePage(searchParams.page),
    Math.max(1, Math.ceil(totalRows / REGISTRATIONS_PAGE_SIZE))
  );
  const pagedRows = rows.slice(
    (registrationsPage - 1) * REGISTRATIONS_PAGE_SIZE,
    registrationsPage * REGISTRATIONS_PAGE_SIZE
  );

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
                <Link href={`/check-in/${selectedEvent.slug}`} className="admin-action-primary">
                  Check in
                </Link>
                <Link href={`/admin/events/${selectedEvent.id}/edit`} className="admin-action">
                  Edit
                </Link>
                <Link href={`/events/${selectedEvent.slug}`} className="admin-action">
                  Public
                </Link>
              </>
            ) : (
              <>
                <div className="admin-card-muted flex items-center gap-1.5 px-2 py-1 sm:gap-2 sm:px-3 sm:py-1.5">
                  <span className="text-[10px] text-slate sm:text-xs">Rows</span>
                  <span className="text-xs font-semibold text-ink sm:text-sm">{rows.length}</span>
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
      </section>

      {analytics ? <AnalyticsCards summary={analytics.summary} hideDetail /> : null}

      <section className="rounded-xl border-2 border-ink/25 bg-ink/[0.03] p-2 sm:p-3.5">
        <form className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-2">
          <span className="shrink-0 self-start rounded bg-ink px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">Filter</span>
          <Select
            name="eventId"
            defaultValue={selectedEventId ?? ""}
            className="rounded-lg border-ink/25 bg-white px-2.5 py-1.5 text-sm font-medium shadow-sm focus:border-ink/40 focus:ring-1 focus:ring-ink/20"
          >
            <option value="">All events</option>
            {events.map((event) => (
              <option key={event.id} value={event.id}>
                {event.title}
              </option>
            ))}
          </Select>
          <Select
            name="status"
            defaultValue={searchParams.status ?? ""}
            className="rounded-lg border-ink/25 bg-white px-2.5 py-1.5 text-sm font-medium shadow-sm focus:border-ink/40 focus:ring-1 focus:ring-ink/20"
          >
            <option value="">All statuses</option>
            <option value="registered">Registered</option>
            <option value="checked_in">Checked in</option>
            <option value="revoked">Revoked</option>
            <option value="cancelled">Cancelled</option>
          </Select>
          <Input
            name="q"
            placeholder="Search name, email, phone"
            defaultValue={searchParams.q ?? ""}
            className="rounded-lg border-ink/25 bg-white px-2.5 py-1.5 text-sm shadow-sm"
          />
          <button className="admin-action-primary shrink-0 !py-1.5 text-sm">Apply</button>
        </form>
      </section>

      <RegistrationsTable rows={pagedRows} />

      <Pagination
        currentPage={registrationsPage}
        totalItems={totalRows}
        pageSize={REGISTRATIONS_PAGE_SIZE}
        paramKey="page"
        searchParams={searchParams}
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
                    {formatShortDateTime(scan.scanned_at)}
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
