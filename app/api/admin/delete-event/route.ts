import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
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
    const result = await deleteEvent(parsed.data.eventId, user);
    revalidatePath("/admin");
    revalidatePath("/admin/registrations");
    revalidatePath("/events");
    revalidatePath(`/events/${result.slug}`);
    revalidatePath(`/check-in/${result.slug}`);
    return NextResponse.json({ ok: true, message: "Event deleted." });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete event.";
    return NextResponse.json({ message }, { status: 400 });
  }
}
