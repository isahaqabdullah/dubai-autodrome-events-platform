import { NextResponse } from "next/server";
import { getAuthenticatedAppUser } from "@/lib/auth";
import { manualCheckinSchema } from "@/lib/validation/checkin";
import { manualCheckin } from "@/services/checkin";

export async function POST(request: Request) {
  const user = await getAuthenticatedAppUser();

  if (!user || (user.role !== "staff" && user.role !== "admin")) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const payload = await request.json().catch(() => null);
  const parsed = manualCheckinSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ message: "Invalid manual check-in request." }, { status: 400 });
  }

  const result = await manualCheckin({
    ...parsed.data,
    staffUserId: user.id
  });

  return NextResponse.json({
    ok: true,
    result: result?.result,
    message: result?.message ?? "Manual check-in completed."
  });
}
