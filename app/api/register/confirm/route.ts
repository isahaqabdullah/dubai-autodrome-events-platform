import { NextResponse } from "next/server";
import { registrationConfirmSchema } from "@/lib/validation/registration";
import { confirmRegistrationFromToken } from "@/services/registration";

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const parsed = registrationConfirmSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ message: "Invalid confirmation token." }, { status: 400 });
  }

  const result = await confirmRegistrationFromToken(parsed.data);
  return NextResponse.json(result);
}
