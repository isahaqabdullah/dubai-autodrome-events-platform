import { NextResponse } from "next/server";
import { slugify } from "@/lib/utils";
import { generateTicketPdf } from "@/services/ticket-pdf";
import { getTicketWalletByToken } from "@/services/tickets";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token") ?? "";
  const wallet = token ? await getTicketWalletByToken(token) : null;

  if (!wallet) {
    return NextResponse.json({ message: "Invalid ticket link." }, { status: 404 });
  }

  let pdf: Buffer;
  try {
    pdf = generateTicketPdf(wallet);
  } catch (error) {
    console.error("[tickets-pdf] failed to generate PDF", {
      bookingIntentId: wallet.booking.id,
      error: error instanceof Error ? error.message : String(error)
    });
    return NextResponse.json({ message: "Unable to generate ticket PDF right now." }, { status: 500 });
  }

  const filename = `${slugify(wallet.event.title) || "event"}-tickets.pdf`;

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff"
    }
  });
}
