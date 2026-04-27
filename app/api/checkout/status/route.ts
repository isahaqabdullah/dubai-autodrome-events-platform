import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { checkoutStatusSchema } from "@/lib/validation/checkout";
import { fulfillPaidBookingFromWorker, getCheckoutStatus } from "@/services/checkout";
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

  let result = await getCheckoutStatus(parsed.data.token);
  if (result.status === "paid" && result.bookingIntentId && result.paymentAttemptId) {
    try {
      await fulfillPaidBookingFromWorker({
        bookingIntentId: result.bookingIntentId,
        paymentAttemptId: result.paymentAttemptId
      });
      await runEmailWorker();
      result = await getCheckoutStatus(parsed.data.token);
    } catch (error) {
      console.error("[checkout/status] inline fulfillment failed", error);
      try {
        result = await getCheckoutStatus(parsed.data.token);
      } catch {
        // Keep the already-known paid response if the defensive reload fails.
      }
      waitUntil(
        runPaymentWorker(3)
          .then(() => runEmailWorker())
          .catch((workerError) => {
            console.error("[checkout/status] background fulfillment failed", workerError);
          })
      );
    }
  }

  return NextResponse.json(result, {
    headers: {
      "Cache-Control": "no-store"
    }
  });
}
