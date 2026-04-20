import type { AppUserRole, EventFormConfig } from "@/lib/types";

export const DEFAULT_FORM_CONFIG: EventFormConfig = {
  submitLabel: "Reserve my spot",
  categories: [],
  ticketOptions: []
};

export const DEFAULT_GATE_NAME = "Main gate";

export const DEFAULT_CATEGORY = {
  id: "general-admission",
  title: "General Admission",
  description: "Free general admission"
} as const;

export const SYNTHETIC_EMAIL_DOMAIN = "placeholder.internal";

export const MAX_ATTENDEES = 5;

export const STAFF_ROLES: AppUserRole[] = ["staff", "admin"];
export const ADMIN_ROLES: AppUserRole[] = ["admin"];

export const VERIFICATION_TOKEN_TTL_MINUTES = 30;
export const RATE_LIMIT_WINDOW_SECONDS = 60;
export const RATE_LIMIT_MAX_REQUESTS = 6;
