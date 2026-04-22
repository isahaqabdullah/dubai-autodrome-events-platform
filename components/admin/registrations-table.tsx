import { RegistrationActions } from "@/components/admin/registration-actions";
import { StatusPill } from "@/components/ui/status-pill";
import { formatShortDateTime, isSyntheticEmail } from "@/lib/utils";

function registrationTone(status: string) {
  if (status === "checked_in") {
    return "success" as const;
  }

  if (status === "registered") {
    return "neutral" as const;
  }

  return "danger" as const;
}

function displayEmail(row: Record<string, unknown>) {
  const email = String(row.email_raw ?? "");
  if (isSyntheticEmail(email)) {
    const bookedBy = row.registered_by_email ? String(row.registered_by_email) : null;
    return bookedBy ? `No email (booked by ${bookedBy})` : "No email (group booking)";
  }
  return email;
}

function RegistrationCard({
  row,
  timeZone
}: {
  row: Record<string, unknown>;
  timeZone: string;
}) {
  const event = (row.events as { title?: string; slug?: string } | null) ?? null;
  const status = String(row.status ?? "registered");
  const categoryTitle = row.category_title ? String(row.category_title) : null;
  const ticketTitle = row.ticket_option_title ? String(row.ticket_option_title) : null;

  return (
    <div className="admin-card p-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-ink">{String(row.full_name ?? "")}</p>
          <p className="truncate text-[11px] text-slate">{displayEmail(row)}</p>
        </div>
        <StatusPill tone={registrationTone(status)}>{status.replaceAll("_", " ")}</StatusPill>
      </div>
      {categoryTitle ? (
        <div className="mt-1 flex flex-wrap gap-1 text-[11px]">
          <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-ink">{categoryTitle}</span>
          {ticketTitle ? <span className="rounded-full bg-blue-50 px-2 py-0.5 text-blue-700">{ticketTitle}</span> : null}
        </div>
      ) : null}
      <div className="mt-1 flex items-center justify-between gap-2 border-t border-slate/10 pt-1 text-[11px] text-slate">
        <span className="truncate font-medium text-ink">{event?.title ?? "Unknown event"}</span>
        <span className="shrink-0">{formatShortDateTime(String(row.created_at ?? ""), timeZone)}</span>
      </div>
      <div className="mt-1.5 flex items-center gap-1">
        <RegistrationActions registrationId={String(row.id)} eventId={String(row.event_id ?? "")} status={status} />
      </div>
    </div>
  );
}

export function RegistrationsTable({
  rows,
  timeZone
}: {
  rows: Array<Record<string, unknown>>;
  timeZone: string;
}) {
  return (
    <>
      <div className="space-y-1.5 md:hidden">
        {rows.length === 0 ? (
          <div className="admin-card px-4 py-8 text-center text-sm text-slate">
            No registrations found for the current filters.
          </div>
        ) : null}
        {rows.map((row) => (
          <RegistrationCard key={String(row.id)} row={row} timeZone={timeZone} />
        ))}
      </div>

      <div className="admin-card hidden overflow-hidden md:block">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate/10 bg-slate-50 text-xs text-slate">
              <tr>
                <th className="px-3 py-2 font-semibold">Attendee</th>
                <th className="px-3 py-2 font-semibold">Category</th>
                <th className="px-3 py-2 font-semibold">Event</th>
                <th className="px-3 py-2 font-semibold">Status</th>
                <th className="px-3 py-2 font-semibold">Created</th>
                <th className="px-3 py-2 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate/10 bg-white">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-xs text-slate">
                    No registrations found for the current filters.
                  </td>
                </tr>
              ) : null}
              {rows.map((row) => {
                const event = (row.events as { title?: string; slug?: string } | null) ?? null;
                const status = String(row.status ?? "registered");
                const categoryTitle = row.category_title ? String(row.category_title) : null;
                const ticketTitle = row.ticket_option_title ? String(row.ticket_option_title) : null;

                return (
                  <tr key={String(row.id)} className="align-top">
                    <td className="px-3 py-2">
                      <p className="text-sm font-medium text-ink">{String(row.full_name ?? "")}</p>
                      <p className="text-xs text-slate">{displayEmail(row)}</p>
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {categoryTitle ? (
                        <div className="flex flex-col gap-1">
                          <span className="font-medium text-ink">{categoryTitle}</span>
                          {ticketTitle ? <span className="text-blue-600">{ticketTitle}</span> : null}
                        </div>
                      ) : (
                        <span className="text-slate">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate">
                      <p className="font-medium text-ink">{event?.title ?? "Unknown event"}</p>
                    </td>
                    <td className="px-3 py-2">
                      <StatusPill tone={registrationTone(status)}>{status.replaceAll("_", " ")}</StatusPill>
                    </td>
                    <td className="px-3 py-2 text-xs text-slate">{formatShortDateTime(String(row.created_at ?? ""), timeZone)}</td>
                    <td className="px-3 py-2">
                      <RegistrationActions
                        registrationId={String(row.id)}
                        eventId={String(row.event_id ?? "")}
                        status={status}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
