import "server-only";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { env } from "@/lib/env";

const BUCKET = "event-assets";
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];
const ALLOWED_PDF_TYPES = ["application/pdf"];

export interface UploadResult {
  publicUrl: string;
  path: string;
}

function getPublicUrl(path: string): string {
  return `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
}

export async function uploadEventAsset(
  eventId: string,
  file: File,
  kind: "poster" | "disclaimer"
): Promise<UploadResult> {
  if (file.size > MAX_FILE_SIZE) {
    throw new Error("File size exceeds 10 MB limit.");
  }

  const allowedTypes = kind === "poster" ? ALLOWED_IMAGE_TYPES : ALLOWED_PDF_TYPES;
  if (!allowedTypes.includes(file.type)) {
    const expected = kind === "poster" ? "PNG, JPEG, or WebP image" : "PDF";
    throw new Error(`Invalid file type. Expected ${expected}.`);
  }

  const ext = file.name.split(".").pop()?.toLowerCase() ?? (kind === "poster" ? "png" : "pdf");
  const timestamp = Date.now();
  const path = `${eventId}/${kind}-${timestamp}.${ext}`;

  const supabase = createAdminSupabaseClient();

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, {
      contentType: file.type,
      upsert: false
    });

  if (error) {
    throw new Error(`Upload failed: ${error.message}`);
  }

  return {
    publicUrl: getPublicUrl(path),
    path
  };
}

export async function deleteEventAsset(path: string): Promise<void> {
  if (!path) return;

  const supabase = createAdminSupabaseClient();
  await supabase.storage.from(BUCKET).remove([path]);
}
