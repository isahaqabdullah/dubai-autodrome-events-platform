import type { EventTicketOption } from "@/lib/types";

export const EVENT_FORM_TEMPLATE_STORAGE_KEY = "event-form-templates-v1";

export const EVENT_FORM_TEMPLATE_TEXT_FIELDS = [
  "venue",
  "timezone",
  "mapLink",
  "introLine",
  "descriptionText",
  "emailIntroLine",
  "emailDescriptionText",
  "disclaimerHeading",
  "declarationText",
  "categoriesLabel",
  "ticketOptionsLabel",
  "declarationVersion",
  "submitLabel"
] as const;

export type EventFormTemplateTextField = typeof EVENT_FORM_TEMPLATE_TEXT_FIELDS[number];

export type EventFormTemplateValues = Record<EventFormTemplateTextField, string> & {
  posterImage: string;
  disclaimerPdfUrl: string;
  categories: EventTicketOption[];
  ticketOptions: EventTicketOption[];
};

export interface EventFormTemplate {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  values: EventFormTemplateValues;
}

export interface SaveEventFormTemplateInput {
  name: string;
  values: EventFormTemplateValues;
}

export type EventFormTemplateSaveResult =
  | { ok: true; template: EventFormTemplate }
  | { ok: false; error: string };

export type EventFormTemplateDeleteResult =
  | { ok: true; templateId: string }
  | { ok: false; error: string };

export type EventFormTemplateImportResult =
  | { ok: true; templates: EventFormTemplate[]; importedCount: number }
  | { ok: false; error: string };

const EMPTY_TEMPLATE_VALUES: EventFormTemplateValues = {
  venue: "",
  timezone: "",
  mapLink: "",
  introLine: "",
  descriptionText: "",
  emailIntroLine: "",
  emailDescriptionText: "",
  disclaimerHeading: "",
  declarationText: "",
  categoriesLabel: "",
  ticketOptionsLabel: "",
  declarationVersion: "",
  submitLabel: "",
  posterImage: "",
  disclaimerPdfUrl: "",
  categories: [],
  ticketOptions: []
};

function formString(formData: FormData, name: string) {
  return String(formData.get(name) ?? "");
}

function normalizeOption(option: unknown): EventTicketOption | null {
  if (!option || typeof option !== "object" || Array.isArray(option)) {
    return null;
  }

  const row = option as Record<string, unknown>;
  const id = typeof row.id === "string" ? row.id.trim() : "";
  const title = typeof row.title === "string" ? row.title.trim() : "";

  if (!id || !title) {
    return null;
  }

  return {
    id,
    title,
    description: typeof row.description === "string" ? row.description : "",
    note: typeof row.note === "string" ? row.note : "",
    badge: typeof row.badge === "string" ? row.badge : "",
    capacity: typeof row.capacity === "number" && Number.isFinite(row.capacity) ? row.capacity : null,
    soldOut: row.soldOut === true,
    priceMinor: typeof row.priceMinor === "number" && Number.isFinite(row.priceMinor) ? row.priceMinor : 0,
    currencyCode: typeof row.currencyCode === "string" && row.currencyCode.trim() ? row.currencyCode : "AED"
  };
}

function parseOptions(value: FormDataEntryValue | null) {
  try {
    const parsed = JSON.parse(String(value ?? "[]"));
    return Array.isArray(parsed) ? parsed.map(normalizeOption).filter((option): option is EventTicketOption => Boolean(option)) : [];
  } catch {
    return [];
  }
}

export function normalizeEventFormTemplateValues(rawValues: unknown): EventFormTemplateValues {
  const values = rawValues && typeof rawValues === "object" && !Array.isArray(rawValues)
    ? rawValues as Partial<EventFormTemplateValues>
    : {};

  return {
    ...EMPTY_TEMPLATE_VALUES,
    ...Object.fromEntries(
      EVENT_FORM_TEMPLATE_TEXT_FIELDS.map((field) => [
        field,
        typeof values[field] === "string" ? values[field] : ""
      ])
    ),
    posterImage: typeof values.posterImage === "string" ? values.posterImage : "",
    disclaimerPdfUrl: typeof values.disclaimerPdfUrl === "string" ? values.disclaimerPdfUrl : "",
    categories: Array.isArray(values.categories)
      ? values.categories.map(normalizeOption).filter((option): option is EventTicketOption => Boolean(option))
      : [],
    ticketOptions: Array.isArray(values.ticketOptions)
      ? values.ticketOptions.map(normalizeOption).filter((option): option is EventTicketOption => Boolean(option))
      : []
  };
}

export function extractEventFormTemplateValues(
  formData: FormData,
  assets: { posterImage: string; disclaimerPdfUrl: string }
): EventFormTemplateValues {
  return {
    ...EMPTY_TEMPLATE_VALUES,
    ...Object.fromEntries(EVENT_FORM_TEMPLATE_TEXT_FIELDS.map((field) => [field, formString(formData, field)])),
    posterImage: assets.posterImage,
    disclaimerPdfUrl: assets.disclaimerPdfUrl,
    categories: parseOptions(formData.get("categoriesJson")),
    ticketOptions: parseOptions(formData.get("ticketOptionsJson"))
  };
}

export function createEventFormTemplate(
  name: string,
  values: EventFormTemplateValues,
  now = new Date()
): EventFormTemplate {
  const timestamp = now.toISOString();
  const id = `template-${timestamp}-${Math.random().toString(36).slice(2, 10)}`;

  return {
    id,
    name: name.trim() || "Event template",
    createdAt: timestamp,
    updatedAt: timestamp,
    values
  };
}

function normalizeTemplate(raw: unknown): EventFormTemplate | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }

  const row = raw as Record<string, unknown>;
  const values = normalizeEventFormTemplateValues(row.values);

  return {
    id: typeof row.id === "string" && row.id.trim() ? row.id : `template-${Math.random().toString(36).slice(2, 10)}`,
    name: typeof row.name === "string" && row.name.trim() ? row.name : "Event template",
    createdAt: typeof row.createdAt === "string" ? row.createdAt : "",
    updatedAt: typeof row.updatedAt === "string" ? row.updatedAt : "",
    values
  };
}

export function parseStoredEventFormTemplates(raw: string | null): EventFormTemplate[] {
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    const templates = Array.isArray(parsed) ? parsed : [];
    return templates.map(normalizeTemplate).filter((template): template is EventFormTemplate => Boolean(template));
  } catch {
    return [];
  }
}
