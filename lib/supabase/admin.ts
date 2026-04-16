import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

let adminSupabaseClient: SupabaseClient | null = null;

export function createAdminSupabaseClient() {
  if (!adminSupabaseClient) {
    adminSupabaseClient = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
  }

  return adminSupabaseClient;
}
