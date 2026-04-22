import { NextResponse } from "next/server";
import { getAuthenticatedAppUser } from "@/lib/auth";
import { revokeRegistrationSchema } from "@/lib/validation/admin";
import { revokeRegistration } from "@/services/admin";

export async function POST(request: Request) {
  const user = await getAuthenticatedAppUser();

  if (!user || user.role !== "admin") {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const payload = await request.json().catch(() => null);
  const parsed = revokeRegistrationSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ message: "Invalid revoke request." }, { status: 400 });
  }

  await revokeRegistration(parsed.data.registrationId, user, parsed.data.reason);
  return NextResponse.json({ ok: true, message: "Registration deleted." });
}
