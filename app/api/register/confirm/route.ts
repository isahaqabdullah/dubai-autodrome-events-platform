import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { getClientIp } from "@/lib/request";
import { registrationCompleteSchema } from "@/lib/validation/registration";
import { runEmailWorker } from "@/services/email-worker";
import { confirmRegistrationFromOtp } from "@/services/registration";

export const maxDuration = 30;

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const parsed = registrationCompleteSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Invalid confirmation payload." }, { status: 400 });
  }

  const result = await confirmRegistrationFromOtp(parsed.data, {
    ipAddress: getClientIp(request.headers),
    userAgent: request.headers.get("user-agent")
  });

  if (result.outcome === "confirmed") {
    waitUntil(
      runEmailWorker().catch((error) => {
        console.error("[confirm] background email worker failed", error);
      })
    );
  }

  return NextResponse.json(result, {
    status:
      result.outcome === "confirmed"
        ? 200
        : result.outcome === "expired"
          ? 410
          : result.outcome === "already_verified"
            ? 409
            : 400
  });
}
