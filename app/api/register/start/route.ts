import { NextResponse } from "next/server";
import { getClientIp } from "@/lib/request";
import { registrationStartSchema } from "@/lib/validation/registration";
import { startRegistrationAttempt } from "@/services/registration";

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const parsed = registrationStartSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      {
        message: parsed.error.issues[0]?.message ?? "Invalid registration payload."
      },
      { status: 400 }
    );
  }

  const result = await startRegistrationAttempt(parsed.data, {
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
