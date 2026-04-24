import { notFound } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { EventBookingFlow } from "@/components/public/event-booking-flow";
import { SiteHeader } from "@/components/public/site-header";
import { getRegistrationWindowState } from "@/lib/utils";
import { getEventBySlug, getRegistrationSummaryForEvent } from "@/services/events";

export const dynamic = "force-dynamic";

export default async function EventDetailPage({
  params
}: {
  params: { slug: string };
}) {
  noStore();

  const event = await getEventBySlug(params.slug);

  if (!event) {
    notFound();
  }

  const { count: registrationCount, ticketCounts, categoryCounts } = await getRegistrationSummaryForEvent(event.id);
  const registrationState = getRegistrationWindowState(event);

  return (
    <>
    <SiteHeader />
    <main className="page-shell page-stack-compact pb-12 sm:pb-16 lg:pb-20">
      <EventBookingFlow
        event={event}
        registrationCount={registrationCount}
        registrationState={registrationState}
        ticketCounts={ticketCounts}
        categoryCounts={categoryCounts}
      />
    </main>
    </>
  );
}
