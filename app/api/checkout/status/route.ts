import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { checkoutStatusSchema } from "@/lib/validation/checkout";
import { getCheckoutStatus } from "@/services/checkout";
import { runEmailWorker } from "@/services/email-worker";
import { runPaymentWorker } from "@/services/payment-worker";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = checkoutStatusSchema.safeParse({ token: url.searchParams.get("token") ?? "" });

  if (!parsed.success) {
    return NextResponse.json({ message: "Invalid checkout status request." }, { status: 400 });
  }

  const result = await getCheckoutStatus(parsed.data.token);
  if (result.status === "paid") {
    waitUntil(
      runPaymentWorker(3)
        .then(() => runEmailWorker())
        .catch((error) => {
          console.error("[checkout/status] background fulfillment failed", error);
        })
    );
  }

  return NextResponse.json(result);
}
