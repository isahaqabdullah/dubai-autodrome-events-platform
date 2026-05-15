import { EventCard } from "@/components/public/event-card";
import { SiteHeader } from "@/components/public/site-header";
import { listUpcomingEventGroups } from "@/services/events";

export const revalidate = 30;

export default async function EventsPage() {
  const eventGroups = await listUpcomingEventGroups();
  const eventCount = eventGroups.reduce((total, group) => total + group.events.length, 0);

  return (
    <>
      <SiteHeader />
      <main className="page-shell page-stack">
        <section className="card-panel px-4 py-5 sm:px-6 sm:py-12">
          <p className="section-title">Public events</p>
          <h1 className="heading-hero mt-2 sm:mt-4">Upcoming events</h1>
        </section>

        <section className="grid gap-6 sm:gap-8">
          {eventCount === 0 ? (
            <div className="card-panel px-4 py-6 text-sm text-slate sm:px-6 sm:py-10 sm:text-base">No upcoming event editions are published yet.</div>
          ) : null}
          {eventGroups.map((group) => (
            <section key={group.id} className="grid gap-3 sm:gap-4">
              <div className="flex flex-col gap-1">
                <p className="section-title">
                  {group.events.length} event{group.events.length === 1 ? "" : "s"}
                </p>
                <h2 className="font-title text-xl font-black italic leading-tight tracking-tight text-ink sm:text-3xl">
                  {group.name}
                </h2>
                {group.description ? (
                  <p className="max-w-2xl text-sm leading-relaxed text-slate">{group.description}</p>
                ) : null}
              </div>
              <div className="grid gap-3 sm:gap-5 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3">
                {group.events.map((event) => (
                  <EventCard key={event.id} event={event} />
                ))}
              </div>
            </section>
          ))}
        </section>
      </main>
    </>
  );
}
