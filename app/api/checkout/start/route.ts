import { NextResponse } from "next/server";
import { getClientIp } from "@/lib/request";
import { checkoutStartSchema } from "@/lib/validation/checkout";
import { startCheckout } from "@/services/checkout";

export const maxDuration = 30;

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const parsed = checkoutStartSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      { message: parsed.error.issues[0]?.message ?? "Invalid checkout payload." },
      { status: 400 }
    );
  }

  const result = await startCheckout(parsed.data, {
    ipAddress: getClientIp(request.headers),
    userAgent: request.headers.get("user-agent")
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
