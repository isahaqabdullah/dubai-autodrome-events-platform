import Link from "next/link";
import { AnalyticsCards } from "@/components/admin/analytics-cards";
import { DownloadDropdown } from "@/components/admin/download-dropdown";
import { RegistrationsTable } from "@/components/admin/registrations-table";
import { StatusPill } from "@/components/ui/status-pill";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatEventDateRange, formatShortDateTime, getRegistrationWindowState } from "@/lib/utils";
import { getScanAnalytics } from "@/services/checkin";
import { listRegistrations } from "@/services/admin";
import { getEventById, listAdminEvents } from "@/services/events";

export default async function RegistrationsPage({
  searchParams
}: {
  searchParams: { eventId?: string; status?: string; q?: string };
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

  return (
    <main className="admin-page">
      <section className="admin-card p-3 sm:p-3.5">
        <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <div className="mb-1 flex flex-wrap items-center gap-1.5 text-xs">
              <Link href="/admin" className="font-medium text-slate transition hover:text-ink">
                Admin
              </Link>
              <span className="text-slate/50">/</span>
              <span className="font-medium text-slate">Registrations &amp; Analytics</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold tracking-tight text-ink sm:text-base">
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
              <p className="mt-0.5 text-xs text-slate">
                {formatEventDateRange(selectedEvent.start_at, selectedEvent.end_at, selectedEvent.timezone)}
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-1.5">
            {selectedEvent ? (
              <>
                <DownloadDropdown eventId={selectedEvent.id} />
                <Link href={`/check-in/${selectedEvent.slug}`} className="admin-action-primary text-xs">
                  Check in
                </Link>
                <Link href={`/admin/events/${selectedEvent.id}/edit`} className="admin-action text-xs">
                  Edit
                </Link>
                <Link href={`/events/${selectedEvent.slug}`} className="admin-action text-xs">
                  Public view
                </Link>
              </>
            ) : (
              <>
                <div className="admin-card-muted flex items-center gap-2 px-3 py-1.5">
                  <span className="text-xs text-slate">Rows</span>
                  <span className="text-sm font-semibold text-ink">{rows.length}</span>
                </div>
                <div className="admin-card-muted flex items-center gap-2 px-3 py-1.5">
                  <span className="text-xs text-slate">Checked in</span>
                  <span className="text-sm font-semibold text-ink">{checkedInCount}</span>
                </div>
                <div className="admin-card-muted flex items-center gap-2 px-3 py-1.5">
                  <span className="text-xs text-slate">Revoked</span>
                  <span className="text-sm font-semibold text-ink">{revokedCount}</span>
                </div>
                <div className="admin-card-muted flex items-center gap-2 px-3 py-1.5">
                  <span className="text-xs text-slate">Events</span>
                  <span className="text-sm font-semibold text-ink">{events.length}</span>
                </div>
              </>
            )}
          </div>
        </div>
      </section>

      {analytics ? <AnalyticsCards summary={analytics.summary} hideDetail /> : null}

      <section className="rounded-xl border-2 border-ink/25 bg-ink/[0.03] p-3 sm:p-3.5">
        <form className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <span className="shrink-0 rounded bg-ink px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">Filter</span>
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

      <RegistrationsTable rows={rows} />

      {analytics ? (
        <section className="admin-card p-3 sm:p-3.5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate">Recent activity</h3>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate">
              {analytics.recentActivity.length}
            </span>
          </div>

          <div className="mt-2 space-y-1.5">
            {analytics.recentActivity.length === 0 ? (
              <div className="admin-card-muted px-3 py-3 text-xs text-slate">No scan activity yet.</div>
            ) : null}

            {analytics.recentActivity.map((scan) => (
              <div
                key={scan.id}
                className="admin-card-muted flex items-center justify-between gap-2 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{scan.registration?.full_name ?? "Unknown attendee"}</p>
                  {scan.registration?.email_raw ? <p className="truncate text-xs text-slate">{scan.registration.email_raw}</p> : null}
                </div>
                <div className="flex shrink-0 items-center gap-2">
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
                  <span className="text-xs text-slate">
                    {scan.gate_name ? `${scan.gate_name} · ` : ""}
                    {formatShortDateTime(scan.scanned_at)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
