import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

let adminSupabaseClient: SupabaseClient | null = null;
let uncachedAdminSupabaseClient: SupabaseClient | null = null;

function createSupabaseClient(noStore: boolean) {
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    },
    ...(noStore
      ? {
          global: {
            fetch: (input, init) => fetch(input, { ...init, cache: "no-store" })
          }
        }
      : {})
  });
}

export function createAdminSupabaseClient(options: { noStore?: boolean } = {}) {
  if (options.noStore) {
    if (!uncachedAdminSupabaseClient) {
      uncachedAdminSupabaseClient = createSupabaseClient(true);
    }
    return uncachedAdminSupabaseClient;
  }

  if (!adminSupabaseClient) {
    adminSupabaseClient = createSupabaseClient(false);
  }

  return adminSupabaseClient;
}
