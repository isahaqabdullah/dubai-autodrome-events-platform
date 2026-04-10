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
    <div className="card-panel overflow-hidden p-4">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-gold/60 via-ember/50 to-aurora/70" />
      <div className="relative space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-lg font-semibold tracking-tight text-ink">{String(row.full_name ?? "")}</p>
            <p className="truncate text-sm text-slate">{String(row.email_raw ?? "")}</p>
            {row.phone ? <p className="text-sm text-slate">{String(row.phone)}</p> : null}
          </div>
          <StatusPill tone={registrationTone(status)}>{status.replaceAll("_", " ")}</StatusPill>
        </div>

        <div className="grid gap-3 rounded-[22px] border border-slate/10 bg-mist/35 p-4 text-sm text-slate">
          <div className="flex items-center justify-between gap-3">
            <span>Event</span>
            <div className="min-w-0 text-right">
              <p className="truncate font-medium text-ink">{event?.title ?? "Unknown event"}</p>
              {event?.slug ? <p className="font-mono text-xs text-slate">{event.slug}</p> : null}
            </div>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span>Created</span>
            <span className="text-right font-medium text-ink">{formatShortDateTime(String(row.created_at ?? ""))}</span>
          </div>
          {event?.slug ? (
            <Link
              href={`/check-in/${event.slug}`}
              className="inline-flex items-center justify-center rounded-2xl border border-slate/15 bg-white/80 px-4 py-2.5 font-semibold text-ink transition hover:border-slate/30 hover:bg-white"
            >
              Open check-in desk
            </Link>
          ) : null}
        </div>

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
      <div className="space-y-3 md:hidden">
        {rows.length === 0 ? (
          <div className="card-panel px-4 py-8 text-center text-sm text-slate">
            No registrations found for the current filters.
          </div>
        ) : null}
        {rows.map((row) => (
          <RegistrationCard key={String(row.id)} row={row} />
        ))}
      </div>

      <div className="card-panel hidden overflow-hidden md:block">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate/10 bg-mist/40 text-slate">
              <tr>
                <th className="px-6 py-4 font-semibold">Attendee</th>
                <th className="px-6 py-4 font-semibold">Event</th>
                <th className="px-6 py-4 font-semibold">Status</th>
                <th className="px-6 py-4 font-semibold">Created</th>
                <th className="px-6 py-4 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate/10 bg-white/75">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-slate">
                    No registrations found for the current filters.
                  </td>
                </tr>
              ) : null}
              {rows.map((row) => {
                const event = (row.events as { title?: string; slug?: string } | null) ?? null;
                const status = String(row.status ?? "registered");

                return (
                  <tr key={String(row.id)} className="align-top">
                    <td className="px-6 py-5">
                      <p className="font-semibold text-ink">{String(row.full_name ?? "")}</p>
                      <p className="mt-1 text-slate">{String(row.email_raw ?? "")}</p>
                      {row.phone ? <p className="text-slate">{String(row.phone)}</p> : null}
                    </td>
                    <td className="px-6 py-5 text-slate">
                      <p className="font-medium text-ink">{event?.title ?? "Unknown event"}</p>
                      {event?.slug ? (
                        <Link href={`/check-in/${event.slug}`} className="mt-2 inline-flex text-xs font-semibold text-slate hover:text-ink">
                          Open check-in desk
                        </Link>
                      ) : null}
                    </td>
                    <td className="px-6 py-5">
                      <StatusPill tone={registrationTone(status)}>{status.replaceAll("_", " ")}</StatusPill>
                    </td>
                    <td className="px-6 py-5 text-slate">{formatShortDateTime(String(row.created_at ?? ""))}</td>
                    <td className="px-6 py-5">
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
