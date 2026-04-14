import { EventCard } from "@/components/public/event-card";
import { SiteHeader } from "@/components/public/site-header";
import { listUpcomingEvents } from "@/services/events";

export const revalidate = 30;

export default async function EventsPage() {
  const events = await listUpcomingEvents();

  return (
    <>
      <SiteHeader />
      <main className="page-shell page-stack">
        <section className="card-panel px-4 py-8 sm:px-6 sm:py-12">
          <p className="section-title">Public events</p>
          <h1 className="heading-hero mt-3 sm:mt-4">Upcoming events</h1>
        </section>

        <section className="grid gap-4 sm:gap-5 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3">
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
