import { NextResponse } from "next/server";
import { getAuthenticatedAppUser } from "@/lib/auth";
import { searchRegistrationsSchema } from "@/lib/validation/checkin";
import { searchRegistrationsForEvent } from "@/services/checkin";

export async function GET(request: Request) {
  const user = await getAuthenticatedAppUser();

  if (!user || (user.role !== "staff" && user.role !== "admin")) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const parsed = searchRegistrationsSchema.safeParse({
    eventId: searchParams.get("eventId"),
    query: searchParams.get("q")
  });

  if (!parsed.success) {
    return NextResponse.json({ message: "Enter at least 4 characters to search attendees." }, { status: 400 });
  }

  const rows = await searchRegistrationsForEvent(parsed.data.eventId, parsed.data.query);

  return NextResponse.json({
    rows
  });
}
