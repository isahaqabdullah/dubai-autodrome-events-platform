import { NextResponse } from "next/server";
import { getAuthenticatedAppUser } from "@/lib/auth";
import { checkinScanSchema } from "@/lib/validation/checkin";
import { getRecentCheckins, performCheckinScan } from "@/services/checkin";

export async function POST(request: Request) {
  const user = await getAuthenticatedAppUser();

  if (!user || (user.role !== "staff" && user.role !== "admin")) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const payload = await request.json().catch(() => null);
  const parsed = checkinScanSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ message: "Invalid scan payload." }, { status: 400 });
  }

  const scan = await performCheckinScan({
    ...parsed.data,
    gateName: user.gateName,
    staffUserId: user.id
  });

  const recent = await getRecentCheckins(parsed.data.eventId, 1, user.gateName);

  return NextResponse.json({
    result: scan?.result ?? "invalid_token",
    message: scan?.message ?? "Unable to resolve scan.",
    fullName: scan?.full_name ?? null,
    recentScan: recent[0] ?? null
  });
}
