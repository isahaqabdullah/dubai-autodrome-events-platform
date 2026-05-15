import Link from "next/link";
import { SiteHeader } from "@/components/public/site-header";
import { listUpcomingEventGroups } from "@/services/events";

export const revalidate = 30;

export default async function EventsPage() {
  const eventGroups = await listUpcomingEventGroups();

  return (
    <>
      <SiteHeader />
      <main className="page-shell page-stack">
        <section className="card-panel px-4 py-5 sm:px-6 sm:py-12">
          <p className="section-title">Public events</p>
          <h1 className="heading-hero mt-2 sm:mt-4">Events</h1>
        </section>

        <section className="grid gap-3 sm:gap-5 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3">
          {eventGroups.length === 0 ? (
            <div className="card-panel px-4 py-6 text-sm text-slate sm:px-6 sm:py-10 sm:text-base">
              No event categories are published yet.
            </div>
          ) : null}
          {eventGroups.map((group) => (
            <Link
              key={group.id}
              href={`/events/${group.slug}`}
              className="card-panel flex h-full flex-col gap-3 p-3.5 transition hover:-translate-y-0.5 hover:shadow-soft sm:p-5 md:p-6"
            >
              <div className="min-w-0">
                <p className="section-title">{group.events.length} event{group.events.length === 1 ? "" : "s"}</p>
                <h2 className="font-title text-xl font-black italic leading-tight tracking-tight text-ink sm:text-3xl">
                  {group.name}
                </h2>
              </div>
              {group.description ? (
                <p className="text-sm leading-relaxed text-slate">{group.description}</p>
              ) : null}
              <span className="mt-auto inline-flex text-sm font-semibold text-ink">View events</span>
            </Link>
          ))}
        </section>
      </main>
    </>
  );
}
