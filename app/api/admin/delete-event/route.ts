import { NextResponse } from "next/server";
import { getAuthenticatedAppUser } from "@/lib/auth";
import { deleteEventSchema } from "@/lib/validation/admin";
import { deleteEvent } from "@/services/admin";

export async function POST(request: Request) {
  const user = await getAuthenticatedAppUser();

  if (!user || user.role !== "admin") {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const payload = await request.json().catch(() => null);
  const parsed = deleteEventSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ message: "Invalid request." }, { status: 400 });
  }

  try {
    await deleteEvent(parsed.data.eventId, user);
    return NextResponse.json({ ok: true, message: "Event deleted." });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete event.";
    return NextResponse.json({ message }, { status: 400 });
  }
}
