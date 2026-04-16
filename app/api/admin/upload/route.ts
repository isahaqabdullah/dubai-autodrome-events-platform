import { NextResponse } from "next/server";
import { getAuthenticatedAppUser } from "@/lib/auth";
import { uploadEventAsset } from "@/services/storage";

export const maxDuration = 30;

export async function POST(request: Request) {
  const user = await getAuthenticatedAppUser();

  if (!user || user.role !== "admin") {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData().catch(() => null);

  if (!formData) {
    return NextResponse.json({ message: "Invalid form data." }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  const eventId = formData.get("eventId") as string | null;
  const kind = formData.get("kind") as string | null;

  if (!file || !eventId || !kind) {
    return NextResponse.json({ message: "Missing file, eventId, or kind." }, { status: 400 });
  }

  if (kind !== "poster" && kind !== "disclaimer") {
    return NextResponse.json({ message: "Invalid upload kind. Must be 'poster' or 'disclaimer'." }, { status: 400 });
  }

  try {
    const result = await uploadEventAsset(eventId, file, kind);
    return NextResponse.json({ ok: true, publicUrl: result.publicUrl, path: result.path });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed.";
    return NextResponse.json({ message }, { status: 400 });
  }
}
