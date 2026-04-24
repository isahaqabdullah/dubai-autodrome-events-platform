import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth";
import { paymentAdminActionSchema } from "@/lib/validation/checkout";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { runPaymentReconcile } from "@/services/payment-worker";
import { fulfillPaidBookingFromWorker } from "@/services/checkout";

export async function POST(request: Request) {
  await requireAuthenticatedUser("admin");
  const payload = await request.json().catch(() => null);
  const parsed = paymentAdminActionSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Invalid payment action." }, { status: 400 });
  }

  const supabase = createAdminSupabaseClient();

  if (parsed.data.action === "refresh") {
    const result = await runPaymentReconcile();
    return NextResponse.json({ ok: true, ...result });
  }

  if (parsed.data.action === "mark_reviewed") {
    if (!parsed.data.bookingIntentId) {
      return NextResponse.json({ message: "bookingIntentId is required." }, { status: 400 });
    }
    await supabase
      .from("booking_intents")
      .update({ reviewed_at: new Date().toISOString() })
      .eq("id", parsed.data.bookingIntentId);
    return NextResponse.json({ ok: true });
  }

  if (parsed.data.action === "cancel_expired") {
    if (!parsed.data.bookingIntentId) {
      return NextResponse.json({ message: "bookingIntentId is required." }, { status: 400 });
    }
    await supabase
      .from("booking_intents")
      .update({ status: "cancelled" })
      .eq("id", parsed.data.bookingIntentId)
      .in("status", ["expired", "payment_failed", "email_verified"]);
    return NextResponse.json({ ok: true });
  }

  if (parsed.data.action === "retry_fulfillment") {
    if (!parsed.data.paymentAttemptId || !parsed.data.bookingIntentId) {
      return NextResponse.json({ message: "paymentAttemptId and bookingIntentId are required." }, { status: 400 });
    }
    const result = await fulfillPaidBookingFromWorker({
      bookingIntentId: parsed.data.bookingIntentId,
      paymentAttemptId: parsed.data.paymentAttemptId
    });
    return NextResponse.json({ ok: true, ...result });
  }

  return NextResponse.json({ message: "Unsupported action." }, { status: 400 });
}
