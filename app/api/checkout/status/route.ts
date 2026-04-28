import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { checkoutStatusSchema } from "@/lib/validation/checkout";
import {
  buildFulfilledCheckoutStatusForBooking,
  claimCheckoutStatusSideEffect,
  fulfillPaidBookingFromWorker,
  getCheckoutStatus
} from "@/services/checkout";
import { runEmailWorker } from "@/services/email-worker";
import { runPaymentWorker } from "@/services/payment-worker";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function responseHeaders() {
  return {
    "Cache-Control": "no-store"
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = checkoutStatusSchema.safeParse({ token: url.searchParams.get("token") ?? "" });

  if (!parsed.success) {
    return NextResponse.json(
      { message: "Invalid checkout status request." },
      { status: 400, headers: responseHeaders() }
    );
  }

  let result = await getCheckoutStatus(parsed.data.token);
  if (
    result.status === "paid" &&
    result.bookingIntentId &&
    result.paymentAttemptId &&
    await claimCheckoutStatusSideEffect({
      bookingIntentId: result.bookingIntentId,
      action: "checkout_status_inline_fulfillment",
      maxRequests: 5
    })
  ) {
    try {
      console.info("[checkout/status] fulfilling verified paid checkout", {
        bookingIntentId: result.bookingIntentId,
        paymentAttemptId: result.paymentAttemptId
      });
      const fulfilled = await fulfillPaidBookingFromWorker({
        bookingIntentId: result.bookingIntentId,
        paymentAttemptId: result.paymentAttemptId
      });
      await runEmailWorker();
      result = await getCheckoutStatus(parsed.data.token);
      if (
        result.status !== "fulfilled" &&
        ["fulfilled", "already_fulfilled"].includes(fulfilled.outcome) &&
        fulfilled.attendees.length > 0
      ) {
        result = await buildFulfilledCheckoutStatusForBooking({
          bookingIntentId: fulfilled.bookingIntentId,
          paymentAttemptId: result.paymentAttemptId,
          attendees: fulfilled.attendees
        });
      }
      console.info("[checkout/status] fulfilled status reload", {
        bookingIntentId: result.bookingIntentId,
        status: result.status,
        attendeeCount: result.attendees?.length ?? 0
      });
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
    headers: responseHeaders()
  });
}
