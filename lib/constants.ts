import type { AppUserRole, EventFormConfig } from "@/lib/types";

export const DEFAULT_FORM_CONFIG: EventFormConfig = {
  submitLabel: "Reserve my spot",
  ticketOptions: []
};

export const STAFF_ROLES: AppUserRole[] = ["staff", "admin"];
export const ADMIN_ROLES: AppUserRole[] = ["admin"];

export const VERIFICATION_TOKEN_TTL_MINUTES = 30;
export const RATE_LIMIT_WINDOW_SECONDS = 60;
export const RATE_LIMIT_MAX_REQUESTS = 6;
