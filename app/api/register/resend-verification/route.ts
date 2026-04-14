import { NextResponse } from "next/server";
import { getClientIp } from "@/lib/request";
import { resendVerificationSchema } from "@/lib/validation/registration";
import { resendVerificationAttempt } from "@/services/registration";

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const parsed = resendVerificationSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ message: "Invalid resend payload." }, { status: 400 });
  }

  const result = await resendVerificationAttempt(parsed.data, {
    ipAddress: getClientIp(request.headers),
    userAgent: request.headers.get("user-agent")
  });

  return NextResponse.json(result, {
    status:
      result.outcome === "pending_verification"
        ? 200
        : result.outcome === "rate_limited"
          ? 429
          : result.outcome === "already_registered"
            ? 409
            : 400
  });
}
