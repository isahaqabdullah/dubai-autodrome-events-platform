import "server-only";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { EmailJobKind } from "@/lib/types";

export async function executeEmailJob<TPayload extends Record<string, unknown>>(
  kind: EmailJobKind,
  payload: TPayload,
  handler: () => Promise<void>
) {
  const supabase = createAdminSupabaseClient();

  const { data: job, error: insertError } = await supabase
    .from("email_jobs")
    .insert({
      kind,
      payload,
      status: "processing",
      attempts: 1
    })
    .select("id")
    .single();

  if (insertError || !job) {
    throw insertError ?? new Error("Unable to create email job.");
  }

  try {
    await handler();
    await supabase
      .from("email_jobs")
      .update({ status: "sent", last_error: null })
      .eq("id", job.id);
  } catch (error) {
    await supabase
      .from("email_jobs")
      .update({
        status: "failed",
        last_error: error instanceof Error ? error.message : "Unknown email failure"
      })
      .eq("id", job.id);
  }
}
