import { EventBookingFlow } from "@/components/public/event-booking-flow";
import { SiteHeader } from "@/components/public/site-header";
import type { EventRecord } from "@/lib/types";
import { getRegistrationWindowState } from "@/lib/utils";
import { catalogOptionToTicketOption, getEventCatalog } from "@/services/catalog";
import { getRegistrationSummaryForEvent } from "@/services/events";

export async function EventDetailView({ event }: { event: EventRecord }) {
  const { count: registrationCount, ticketCounts, categoryCounts } = await getRegistrationSummaryForEvent(event.id);
  const catalog = await getEventCatalog(event);
  const eventWithCatalog = {
    ...event,
    form_config: {
      ...(event.form_config ?? {}),
      categories: catalog.categories.map(catalogOptionToTicketOption),
      ticketOptions: catalog.addons.map(catalogOptionToTicketOption)
    }
  };
  const registrationState = getRegistrationWindowState(event);

  return (
    <>
      <SiteHeader />
      <main className="page-shell page-stack-compact pb-12 sm:pb-16 lg:pb-20">
        <EventBookingFlow
          event={eventWithCatalog}
          registrationCount={registrationCount}
          registrationState={registrationState}
          ticketCounts={ticketCounts}
          categoryCounts={categoryCounts}
        />
      </main>
    </>
  );
}
