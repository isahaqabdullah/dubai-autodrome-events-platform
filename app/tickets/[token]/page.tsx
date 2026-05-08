import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/public/site-header";
import { TicketWallet } from "@/components/public/ticket-wallet";
import { getTicketWalletByToken } from "@/services/tickets";

export const dynamic = "force-dynamic";

export default async function TicketWalletPage({
  params
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const wallet = await getTicketWalletByToken(token);

  if (!wallet) {
    notFound();
  }

  return (
    <>
      <SiteHeader />
      <main className="mx-auto min-h-[70vh] max-w-7xl px-3 py-4 sm:px-6 sm:py-8 lg:px-8">
        <TicketWallet
          event={wallet.event}
          attendees={wallet.attendees}
          ticketToken={wallet.ticketToken}
          ticketUrl={wallet.ticketUrl}
          mapLink={wallet.event.form_config?.mapLink}
          compactMobile
        />
      </main>
    </>
  );
}
