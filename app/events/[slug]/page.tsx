import { notFound } from "next/navigation";
import { RegistrationForm } from "@/components/public/registration-form";
import { SiteHeader } from "@/components/public/site-header";
import { StatusPill } from "@/components/ui/status-pill";
import { formatEventDateRange, getRegistrationWindowState } from "@/lib/utils";
import { getEventBySlug, getRegistrationCountForEvent } from "@/services/events";

export const dynamic = "force-dynamic";

export default async function EventDetailPage({
  params
}: {
  params: { slug: string };
}) {
  const event = await getEventBySlug(params.slug);

  if (!event) {
    notFound();
  }

  const registrationCount = await getRegistrationCountForEvent(event.id);
  const registrationState = getRegistrationWindowState(event);

  return (
    <>
      <SiteHeader />
      <main className="page-shell space-y-5 sm:space-y-8">
        <section className="grid gap-5 sm:gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(300px,0.8fr)]">
          <div className="card-panel p-4 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3 sm:gap-4">
              <div className="min-w-0">
                <p className="section-title">Event edition</p>
                <h1 className="heading-xl mt-2 sm:mt-3">{event.title}</h1>
              </div>
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
            </div>

            <div className="mt-4 grid gap-3 sm:mt-6 sm:gap-4 sm:grid-cols-2">
              <div className="rounded-xl bg-mist/60 p-3 sm:rounded-2xl sm:p-4">
                <p className="section-title">Schedule</p>
                <p className="mt-1.5 text-sm text-slate sm:mt-2">{formatEventDateRange(event.start_at, event.end_at, event.timezone)}</p>
              </div>
              <div className="rounded-xl bg-mist/60 p-3 sm:rounded-2xl sm:p-4">
                <p className="section-title">Venue</p>
                <p className="mt-1.5 text-sm text-slate sm:mt-2">{event.venue ?? "Venue to be announced"}</p>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-3 sm:mt-6 sm:gap-4">
              <div className="rounded-xl border border-slate/10 bg-white/70 p-3 sm:rounded-2xl sm:p-4">
                <p className="section-title">Registrations</p>
                <p className="mt-1.5 text-2xl font-semibold tracking-tight text-ink sm:mt-2 sm:text-3xl">{registrationCount}</p>
              </div>
              <div className="rounded-xl border border-slate/10 bg-white/70 p-3 sm:rounded-2xl sm:p-4">
                <p className="section-title">Capacity</p>
                <p className="mt-1.5 text-2xl font-semibold tracking-tight text-ink sm:mt-2 sm:text-3xl">{event.capacity ?? "Open"}</p>
              </div>
              <div className="rounded-xl border border-slate/10 bg-white/70 p-3 sm:rounded-2xl sm:p-4">
                <p className="section-title">Version</p>
                <p className="mt-1.5 text-2xl font-semibold tracking-tight text-ink sm:mt-2 sm:text-3xl">{event.declaration_version}</p>
              </div>
            </div>

            <div className="mt-4 space-y-3 text-slate sm:mt-6 sm:space-y-4">
              <p className="text-sm sm:text-base">{event.description ?? "This event edition uses the shared registration and verification workflow."}</p>
              <div className="rounded-2xl border border-slate/10 bg-white/70 p-4 sm:rounded-3xl sm:p-5">
                <p className="section-title">Declaration preview</p>
                <p className="mt-2 whitespace-pre-wrap text-sm text-slate sm:mt-3">{event.declaration_text}</p>
              </div>
            </div>
          </div>

          <div>
            {registrationState.state === "open" ? (
              <RegistrationForm event={event} />
            ) : (
              <div className="card-panel p-4 sm:p-6">
                <p className="section-title">Registration status</p>
                <h2 className="heading-lg mt-2 sm:mt-3">{registrationState.label}</h2>
                <p className="mt-2 text-sm text-slate sm:mt-3">
                  This event page is still driven by the same reusable registration system, but registrations are not
                  currently being accepted for this edition.
                </p>
              </div>
            )}
          </div>
        </section>
      </main>
    </>
  );
}
