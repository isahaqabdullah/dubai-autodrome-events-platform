import { NextResponse } from "next/server";
import { getAuthenticatedAppUser } from "@/lib/auth";
import { resendQrSchema } from "@/lib/validation/admin";
import { rotateQrAndResend } from "@/services/admin";

export const maxDuration = 30;

export async function POST(request: Request) {
  const user = await getAuthenticatedAppUser();

  if (!user || user.role !== "admin") {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const payload = await request.json().catch(() => null);
  const parsed = resendQrSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ message: "Invalid resend request." }, { status: 400 });
  }

  await rotateQrAndResend(parsed.data.registrationId, user);
  return NextResponse.json({ ok: true, message: "QR code resent." });
}
