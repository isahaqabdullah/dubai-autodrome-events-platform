import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { checkoutStatusSchema } from "@/lib/validation/checkout";
import { fulfillPaidBookingFromWorker, getCheckoutStatus } from "@/services/checkout";
import { runEmailWorker } from "@/services/email-worker";
import { runPaymentWorker } from "@/services/payment-worker";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function runtimeDiagnosticsHeaders() {
  const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
    ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
    : "missing";

  return {
    "Cache-Control": "no-store",
    "X-App-Commit": process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ?? "local",
    "X-App-Branch": process.env.VERCEL_GIT_COMMIT_REF ?? "local",
    "X-Supabase-Host": supabaseHost
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = checkoutStatusSchema.safeParse({ token: url.searchParams.get("token") ?? "" });

  if (!parsed.success) {
    return NextResponse.json({ message: "Invalid checkout status request." }, { status: 400 });
  }

  let result = await getCheckoutStatus(parsed.data.token);
  if (result.status === "paid" && result.bookingIntentId && result.paymentAttemptId) {
    try {
      console.info("[checkout/status] fulfilling verified paid checkout", {
        bookingIntentId: result.bookingIntentId,
        paymentAttemptId: result.paymentAttemptId
      });
      await fulfillPaidBookingFromWorker({
        bookingIntentId: result.bookingIntentId,
        paymentAttemptId: result.paymentAttemptId
      });
      await runEmailWorker();
      result = await getCheckoutStatus(parsed.data.token);
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
    headers: runtimeDiagnosticsHeaders()
  });
}
