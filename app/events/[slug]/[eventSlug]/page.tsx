import { notFound } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { EventDetailView } from "@/app/events/event-detail-view";
import { getEventBySlugForGroup, getEventGroupBySlug } from "@/services/events";

export const dynamic = "force-dynamic";

export default async function EventCategoryDetailPage({
  params
}: {
  params: Promise<{ slug: string; eventSlug: string }>;
}) {
  noStore();

  const { slug, eventSlug } = await params;
  const group = await getEventGroupBySlug(slug);

  if (!group) {
    notFound();
  }

  const event = await getEventBySlugForGroup(eventSlug, group.id);

  if (!event) {
    notFound();
  }

  return <EventDetailView event={{ ...event, event_group: group }} />;
}
