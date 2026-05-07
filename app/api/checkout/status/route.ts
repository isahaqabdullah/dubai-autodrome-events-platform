import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { checkoutStatusSchema } from "@/lib/validation/checkout";
import type { CheckoutStatusResult } from "@/lib/types";
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

function isExpiredCheckoutTokenError(error: unknown) {
  return error instanceof Error && error.message === "Invalid or expired checkout token.";
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

  let result: CheckoutStatusResult;
  try {
    result = await getCheckoutStatus(parsed.data.token);
  } catch (error) {
    if (isExpiredCheckoutTokenError(error)) {
      return NextResponse.json(
        {
          status: "expired",
          message: "This checkout confirmation link has expired. If payment was completed, use the ticket link from your email."
        },
        { headers: responseHeaders() }
      );
    }
    throw error;
  }
  if (
    (result.status === "paid" || result.paymentAttemptStatus === "paid") &&
    result.bookingIntentId &&
    result.paymentAttemptId &&
    await claimCheckoutStatusSideEffect({
      bookingIntentId: result.bookingIntentId,
      action: "checkout_status_inline_fulfillment",
      maxRequests: 1,
      windowSeconds: 20
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
      if (
        ["fulfilled", "already_fulfilled"].includes(fulfilled.outcome) &&
        fulfilled.attendees.length > 0
      ) {
        waitUntil(
          runEmailWorker().catch((emailError) => {
            console.error("[checkout/status] background ticket email failed", emailError);
          })
        );
        result = await buildFulfilledCheckoutStatusForBooking({
          bookingIntentId: fulfilled.bookingIntentId,
          paymentAttemptId: result.paymentAttemptId,
          attendees: fulfilled.attendees
        });
      } else {
        result = await getCheckoutStatus(parsed.data.token);
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
