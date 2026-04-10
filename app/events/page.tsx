import { EventCard } from "@/components/public/event-card";
import { SiteHeader } from "@/components/public/site-header";
import { listUpcomingEvents } from "@/services/events";

export const dynamic = "force-dynamic";

export default async function EventsPage() {
  const events = await listUpcomingEvents();

  return (
    <>
      <SiteHeader />
      <main className="page-shell space-y-5 sm:space-y-8">
        <section className="card-panel px-4 py-8 sm:px-6 sm:py-12">
          <p className="section-title">Public events</p>
          <div className="mt-3 max-w-3xl space-y-3 sm:mt-4 sm:space-y-4">
            <h1 className="heading-hero">Recurring editions managed as data, not code.</h1>
            <p className="text-base text-slate sm:text-lg">
              Each event occurrence is its own record with its own schedule, declaration version, registration window,
              capacity, and check-in analytics.
            </p>
          </div>
        </section>

        <section className="grid gap-4 sm:gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {events.length === 0 ? (
            <div className="card-panel px-4 py-8 text-slate sm:px-6 sm:py-10">No upcoming event editions are published yet.</div>
          ) : null}
          {events.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </section>
      </main>
    </>
  );
}
