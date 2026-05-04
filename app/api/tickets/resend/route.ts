import { NextResponse } from "next/server";
import { getClientIp } from "@/lib/request";
import { createTicketResendDelivery } from "@/services/tickets";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const token = typeof payload?.token === "string" ? payload.token : "";

  if (!token) {
    return NextResponse.json({ message: "Missing ticket link." }, { status: 400 });
  }

  const result = await createTicketResendDelivery({
    ticketToken: token,
    ipAddress: getClientIp(request.headers)
  });

  return NextResponse.json(
    { ok: result.ok, message: result.message },
    { status: result.status }
  );
}
