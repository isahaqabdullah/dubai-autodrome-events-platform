import { NextResponse } from "next/server";
import { checkoutStatusSchema } from "@/lib/validation/checkout";
import { getCheckoutStatus } from "@/services/checkout";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = checkoutStatusSchema.safeParse({ token: url.searchParams.get("token") ?? "" });

  if (!parsed.success) {
    return NextResponse.json({ message: "Invalid checkout status request." }, { status: 400 });
  }

  const result = await getCheckoutStatus(parsed.data.token);
  return NextResponse.json(result);
}
