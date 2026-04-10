import { RegistrationsTable } from "@/components/admin/registrations-table";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { listAdminEvents } from "@/services/events";
import { listRegistrations } from "@/services/admin";

export default async function RegistrationsPage({
  searchParams
}: {
  searchParams: { eventId?: string; status?: string; q?: string };
}) {
  const [events, rows] = await Promise.all([
    listAdminEvents(),
    listRegistrations({
      eventId: searchParams.eventId,
      status: searchParams.status,
      query: searchParams.q
    })
  ]);

  const checkedInCount = rows.filter((row) => String(row.status ?? "") === "checked_in").length;
  const revokedCount = rows.filter((row) => String(row.status ?? "") === "revoked").length;

  return (
    <main className="space-y-5 sm:space-y-6">
      <section className="card-panel overflow-hidden p-5 sm:p-6 lg:p-7">
        <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-r from-gold/20 via-white/0 to-aurora/35" />
        <div className="relative grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)]">
          <div>
            <p className="section-title">Registrations desk</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">Registrations</h2>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            <div className="rounded-[24px] border border-slate/10 bg-white/80 p-4">
              <p className="section-title">Visible rows</p>
              <p className="mt-3 text-4xl font-semibold tracking-tight text-ink">{rows.length}</p>
            </div>
            <div className="rounded-[24px] border border-slate/10 bg-white/80 p-4">
              <p className="section-title">Checked in</p>
              <p className="mt-3 text-4xl font-semibold tracking-tight text-ink">{checkedInCount}</p>
            </div>
            <div className="rounded-[24px] border border-slate/10 bg-white/80 p-4">
              <p className="section-title">Revoked</p>
              <p className="mt-3 text-4xl font-semibold tracking-tight text-ink">{revokedCount}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="card-panel p-5 sm:p-6">
        <div className="mb-5">
          <p className="section-title">Filters</p>
          <h3 className="mt-2 text-2xl font-semibold tracking-tight text-ink">Find the right attendee quickly</h3>
        </div>
        <form className="grid gap-3 lg:grid-cols-[1fr_220px_minmax(0,1.2fr)_auto]">
          <Select name="eventId" defaultValue={searchParams.eventId ?? ""}>
            <option value="">All events</option>
            {events.map((event) => (
              <option key={event.id} value={event.id}>
                {event.title}
              </option>
            ))}
          </Select>
          <Select name="status" defaultValue={searchParams.status ?? ""}>
            <option value="">All statuses</option>
            <option value="registered">Registered</option>
            <option value="checked_in">Checked in</option>
            <option value="revoked">Revoked</option>
            <option value="cancelled">Cancelled</option>
          </Select>
          <Input
            name="q"
            placeholder="Search by name, email, or phone"
            defaultValue={searchParams.q ?? ""}
          />
          <button className="inline-flex items-center justify-center rounded-2xl border border-ink bg-ink px-4 py-3 text-sm font-semibold text-white transition hover:bg-ink/92">
            Apply filters
          </button>
        </form>
      </section>

      <RegistrationsTable rows={rows} />
    </main>
  );
}
