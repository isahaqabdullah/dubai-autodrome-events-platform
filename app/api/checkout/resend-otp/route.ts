import { NextResponse } from "next/server";
import { getClientIp } from "@/lib/request";
import { checkoutResendOtpSchema } from "@/lib/validation/checkout";
import { resendCheckoutOtp } from "@/services/checkout";

export const maxDuration = 30;

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const parsed = checkoutResendOtpSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      { message: parsed.error.issues[0]?.message ?? "Invalid resend request." },
      { status: 400 }
    );
  }

  const result = await resendCheckoutOtp({
    checkoutToken: parsed.data.checkoutToken,
    metadata: {
      ipAddress: getClientIp(request.headers),
      userAgent: request.headers.get("user-agent")
    }
  });

  return NextResponse.json(result, {
    status:
      result.outcome === "otp_sent"
        ? 200
        : result.outcome === "rate_limited"
          ? 429
          : result.outcome === "capacity_exceeded"
            ? 409
            : 400
  });
}
