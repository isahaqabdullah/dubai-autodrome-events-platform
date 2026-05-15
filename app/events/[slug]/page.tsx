import { notFound } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { EventCategoryView } from "@/app/events/event-category-view";
import { EventDetailView } from "@/app/events/event-detail-view";
import {
  getEventBySlug,
  getEventGroupBySlug,
  listUpcomingEventsForGroup
} from "@/services/events";

export const dynamic = "force-dynamic";

export default async function EventSlugPage({
  params
}: {
  params: Promise<{ slug: string }>;
}) {
  noStore();

  const { slug } = await params;
  const group = await getEventGroupBySlug(slug);

  if (group) {
    const events = await listUpcomingEventsForGroup(group.id);
    return <EventCategoryView group={group} events={events} />;
  }

  const event = await getEventBySlug(slug);

  if (!event) {
    notFound();
  }

  return <EventDetailView event={event} />;
}
