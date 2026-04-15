import Link from "next/link";
import { RegistrationActions } from "@/components/admin/registration-actions";
import { StatusPill } from "@/components/ui/status-pill";
import { formatShortDateTime } from "@/lib/utils";

function registrationTone(status: string) {
  if (status === "checked_in") {
    return "success" as const;
  }

  if (status === "registered") {
    return "neutral" as const;
  }

  return "danger" as const;
}

function RegistrationCard({ row }: { row: Record<string, unknown> }) {
  const event = (row.events as { title?: string; slug?: string } | null) ?? null;
  const status = String(row.status ?? "registered");

  return (
    <div className="admin-card p-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-ink">{String(row.full_name ?? "")}</p>
          <p className="truncate text-[11px] text-slate">{String(row.email_raw ?? "")}</p>
        </div>
        <StatusPill tone={registrationTone(status)}>{status.replaceAll("_", " ")}</StatusPill>
      </div>
      <div className="mt-1 flex items-center justify-between gap-2 border-t border-slate/10 pt-1 text-[11px] text-slate">
        <span className="truncate font-medium text-ink">{event?.title ?? "Unknown event"}</span>
        <span className="shrink-0">{formatShortDateTime(String(row.created_at ?? ""), "Asia/Dubai")}</span>
      </div>
      <div className="mt-1.5 flex items-center gap-1">
        {event?.slug ? (
          <Link href={`/check-in/${event.slug}`} className="admin-action !px-2 !py-1">
            Check-in
          </Link>
        ) : null}
        <RegistrationActions registrationId={String(row.id)} status={status} />
      </div>
    </div>
  );
}

export function RegistrationsTable({
  rows
}: {
  rows: Array<Record<string, unknown>>;
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
          <RegistrationCard key={String(row.id)} row={row} />
        ))}
      </div>

      <div className="admin-card hidden overflow-hidden md:block">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate/10 bg-slate-50 text-xs text-slate">
              <tr>
                <th className="px-3 py-2 font-semibold">Attendee</th>
                <th className="px-3 py-2 font-semibold">Event</th>
                <th className="px-3 py-2 font-semibold">Status</th>
                <th className="px-3 py-2 font-semibold">Created</th>
                <th className="px-3 py-2 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate/10 bg-white">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-xs text-slate">
                    No registrations found for the current filters.
                  </td>
                </tr>
              ) : null}
              {rows.map((row) => {
                const event = (row.events as { title?: string; slug?: string } | null) ?? null;
                const status = String(row.status ?? "registered");

                return (
                  <tr key={String(row.id)} className="align-top">
                    <td className="px-3 py-2">
                      <p className="text-sm font-medium text-ink">{String(row.full_name ?? "")}</p>
                      <p className="text-xs text-slate">{String(row.email_raw ?? "")}</p>
                    </td>
                    <td className="px-3 py-2 text-xs text-slate">
                      <p className="font-medium text-ink">{event?.title ?? "Unknown event"}</p>
                      {event?.slug ? (
                        <Link href={`/check-in/${event.slug}`} className="text-[11px] font-semibold text-slate hover:text-ink">
                          Check-in desk
                        </Link>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">
                      <StatusPill tone={registrationTone(status)}>{status.replaceAll("_", " ")}</StatusPill>
                    </td>
                    <td className="px-3 py-2 text-xs text-slate">{formatShortDateTime(String(row.created_at ?? ""), "Asia/Dubai")}</td>
                    <td className="px-3 py-2">
                      <RegistrationActions registrationId={String(row.id)} status={status} />
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
