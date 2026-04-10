import { createServerClient } from "@supabase/ssr";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { publicEnv } from "@/lib/public-env";

type CookieMutation = {
  name: string;
  value: string;
  options?: Record<string, unknown>;
};

function hasSupabaseAuthCookie(cookieNames: string[]) {
  return cookieNames.some((name) => name.includes("auth-token"));
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({
    request
  });

  if (!hasSupabaseAuthCookie(request.cookies.getAll().map((cookie) => cookie.name))) {
    return response;
  }

  const supabase = createServerClient(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieMutation[]) {
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value));
          response = NextResponse.next({
            request
          });
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        }
      }
    }
  );

  await supabase.auth.getUser();
  return response;
}
