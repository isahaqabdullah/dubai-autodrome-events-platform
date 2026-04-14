import { NextResponse } from "next/server";
import { verifyOtpSchema } from "@/lib/validation/registration";
import { verifyOtp } from "@/services/registration";

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const parsed = verifyOtpSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      { valid: false, message: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 }
    );
  }

  const result = await verifyOtp(parsed.data);

  return NextResponse.json(result, { status: result.valid ? 200 : 400 });
}
