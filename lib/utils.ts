import { clsx } from "clsx";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import type { EventFormConfig, EventRecord, RegistrationWindowState } from "@/lib/types";
import { DEFAULT_CATEGORY, DEFAULT_FORM_CONFIG, SYNTHETIC_EMAIL_DOMAIN } from "@/lib/constants";
import type { EventTicketOption } from "@/lib/types";

export function cn(...values: Array<string | undefined | false | null>) {
  return clsx(values);
}

export function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function normalizePhone(phone?: string | null) {
  if (!phone) {
    return null;
  }

  const trimmed = phone.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export const PHONE_NUMBER_VALIDATION_MESSAGE =
  "Use 8-15 digits. Spaces, dashes, parentheses, and an optional leading + are allowed.";

export function isValidPhoneNumber(phone: string) {
  const trimmed = phone.trim();

  if (!trimmed || !/^\+?[\d\s\-()]+$/.test(trimmed)) {
    return false;
  }

  const digitsOnly = trimmed.replace(/\D/g, "");
  return digitsOnly.length >= 8 && digitsOnly.length <= 15;
}

export function blankToNull(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function mergeFormConfig(config: EventFormConfig | null | undefined): EventFormConfig {
  return {
    ...DEFAULT_FORM_CONFIG,
    ...(config ?? {})
  };
}

export function getRegistrationWindowState(event: Pick<
  EventRecord,
  "status" | "registration_opens_at" | "registration_closes_at"
>): RegistrationWindowState {
  const now = Date.now();
  const opensAt = event.registration_opens_at ? new Date(event.registration_opens_at).getTime() : null;
  const closesAt = event.registration_closes_at ? new Date(event.registration_closes_at).getTime() : null;

  if (event.status === "draft" || event.status === "archived" || event.status === "closed") {
    return { state: "closed", label: "Registration closed" };
  }

  if (opensAt && now < opensAt) {
    return { state: "not_open_yet", label: "Registration not open yet" };
  }

  if (closesAt && now > closesAt) {
    return { state: "closed", label: "Registration closed" };
  }

  return { state: "open", label: "Registration open" };
}

export function formatEventDateRange(startAt: string, endAt: string, timeZone: string) {
  const start = new Date(startAt);
  const end = new Date(endAt);
  const dateFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "long",
    day: "numeric",
    year: "numeric"
  });
  const timeFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit"
  });

  return `${dateFormatter.format(start)} · ${timeFormatter.format(start)} - ${timeFormatter.format(end)} (${timeZone})`;
}

export function formatShortDateTime(value: string, timeZone = "UTC") {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

export function formatInputDateTimeInZone(value: string | null, timeZone: string) {
  if (!value) {
    return "";
  }

  const zoned = toZonedTime(value, timeZone);
  const pad = (input: number) => input.toString().padStart(2, "0");

  return `${zoned.getFullYear()}-${pad(zoned.getMonth() + 1)}-${pad(zoned.getDate())}T${pad(
    zoned.getHours()
  )}:${pad(zoned.getMinutes())}`;
}

export function zonedInputToUtcIso(value: string, timeZone: string) {
  return fromZonedTime(value, timeZone).toISOString();
}

export function buildAbsoluteUrl(baseUrl: string, path: string) {
  return new URL(path, baseUrl).toString();
}

export function isSyntheticEmail(email: string) {
  return email.endsWith(`@${SYNTHETIC_EMAIL_DOMAIN}`);
}

export function resolveCategories(config: EventFormConfig | null | undefined): EventTicketOption[] {
  const categories = config?.categories;
  if (categories && categories.length > 0) {
    return categories;
  }
  return [{ id: DEFAULT_CATEGORY.id, title: DEFAULT_CATEGORY.title, description: DEFAULT_CATEGORY.description }];
}
