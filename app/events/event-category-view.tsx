import Link from "next/link";
import { EventCard } from "@/components/public/event-card";
import { SiteHeader } from "@/components/public/site-header";
import type { EventGroup, EventRecord } from "@/lib/types";

export function EventCategoryView({
  group,
  events
}: {
  group: EventGroup;
  events: EventRecord[];
}) {
  return (
    <>
      <SiteHeader />
      <main className="page-shell page-stack">
        <section className="card-panel px-4 py-5 sm:px-6 sm:py-10">
          <Link href="/events" className="section-title transition hover:text-ink">
            Events
          </Link>
          <h1 className="heading-hero mt-2 sm:mt-4">{group.name}</h1>
          {group.description ? (
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate sm:text-base">{group.description}</p>
          ) : null}
        </section>

        <section className="grid gap-3 sm:gap-5 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3">
          {events.length === 0 ? (
            <div className="card-panel px-4 py-6 text-sm text-slate sm:px-6 sm:py-10 sm:text-base">
              No upcoming events are published in this category yet.
            </div>
          ) : null}
          {events.map((event) => (
            <EventCard
              key={event.id}
              event={{ ...event, event_group: group }}
              href={`/events/${group.slug}/${event.slug}`}
            />
          ))}
        </section>
      </main>
    </>
  );
}
