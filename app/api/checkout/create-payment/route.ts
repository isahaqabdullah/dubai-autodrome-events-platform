import { NextResponse } from "next/server";
import { checkoutCreatePaymentSchema } from "@/lib/validation/checkout";
import { createCheckoutPayment } from "@/services/checkout";

export const maxDuration = 30;

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const parsed = checkoutCreatePaymentSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      { message: parsed.error.issues[0]?.message ?? "Invalid payment request." },
      { status: 400 }
    );
  }

  const result = await createCheckoutPayment(parsed.data.checkoutToken);

  return NextResponse.json(result, {
    status:
      result.outcome === "redirect" || result.outcome === "fulfilled"
        ? 200
        : result.outcome === "payment_pending"
          ? 202
        : result.outcome === "capacity_exceeded"
          ? 409
          : result.outcome === "attempt_limit_exceeded" || result.outcome === "rate_limited"
            ? 429
            : 400
  });
}
