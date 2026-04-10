import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_ROLES, STAFF_ROLES } from "@/lib/constants";
import { isDemoMode } from "@/lib/demo-mode";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { AppUserRole } from "@/lib/types";

export interface AuthenticatedAppUser {
  id: string;
  email: string | null;
  role: AppUserRole;
}

function hasSupabaseAuthCookie(cookieNames: string[]) {
  return cookieNames.some((name) => name.includes("auth-token"));
}

function getRoleFromUser(user: { app_metadata?: Record<string, unknown> }): AppUserRole | null {
  const role = user.app_metadata?.role;

  if (role === "admin" || role === "staff") {
    return role;
  }

  return null;
}

export async function getAuthenticatedAppUser() {
  if (isDemoMode()) {
    return {
      id: "00000000-0000-0000-0000-000000000001",
      email: "demo-admin@local.test",
      role: "admin"
    } satisfies AuthenticatedAppUser;
  }

  const cookieStore = cookies();

  if (!hasSupabaseAuthCookie(cookieStore.getAll().map((cookie) => cookie.name))) {
    return null;
  }

  const supabase = createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const role = getRoleFromUser(user);

  if (!role) {
    return null;
  }

  return {
    id: user.id,
    email: user.email ?? null,
    role
  } satisfies AuthenticatedAppUser;
}

export async function requireAuthenticatedUser(scope: "staff" | "admin" = "staff") {
  const user = await getAuthenticatedAppUser();

  if (!user) {
    redirect("/login");
  }

  const allowedRoles = scope === "admin" ? ADMIN_ROLES : STAFF_ROLES;

  if (!allowedRoles.includes(user.role)) {
    redirect("/login?error=insufficient_role");
  }

  return user;
}
