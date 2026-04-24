import { NextResponse } from "next/server";
import { checkoutVerifyOtpSchema } from "@/lib/validation/checkout";
import { verifyCheckoutOtp } from "@/services/checkout";

export const maxDuration = 30;

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const parsed = checkoutVerifyOtpSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      { message: parsed.error.issues[0]?.message ?? "Invalid verification request." },
      { status: 400 }
    );
  }

  const result = await verifyCheckoutOtp({
    checkoutToken: parsed.data.checkoutToken,
    otp: parsed.data.otp
  });

  return NextResponse.json(result, {
    status:
      result.outcome === "email_verified" || result.outcome === "fulfilled"
        ? 200
        : result.outcome === "expired"
          ? 410
          : result.outcome === "capacity_exceeded"
            ? 409
            : 400
  });
}
