import { adminEventGroupSchema, adminEventSchema } from "@/lib/validation/admin";

export function parseAdminEventFormData(formData: FormData) {
  const rawTicketOptions = String(formData.get("ticketOptionsJson") ?? "[]");
  let ticketOptions: unknown = [];
  try {
    ticketOptions = rawTicketOptions ? JSON.parse(rawTicketOptions) : [];
  } catch {
    ticketOptions = [];
  }

  const rawCategories = String(formData.get("categoriesJson") ?? "[]");
  let categories: unknown = [];
  try {
    categories = rawCategories ? JSON.parse(rawCategories) : [];
  } catch {
    categories = [];
  }

  return adminEventSchema.parse({
    id: String(formData.get("id") ?? "") || undefined,
    eventGroupId: String(formData.get("eventGroupId") ?? ""),
    slug: String(formData.get("slug") ?? ""),
    title: String(formData.get("title") ?? ""),
    venue: String(formData.get("venue") ?? ""),
    timezone: String(formData.get("timezone") ?? ""),
    startAt: String(formData.get("startAt") ?? ""),
    endAt: String(formData.get("endAt") ?? ""),
    registrationOpensAt: String(formData.get("registrationOpensAt") ?? ""),
    registrationClosesAt: String(formData.get("registrationClosesAt") ?? ""),
    status: String(formData.get("status") ?? ""),
    capacity: String(formData.get("capacity") ?? ""),
    declarationVersion: Number(formData.get("declarationVersion") ?? 1),
    declarationText: String(formData.get("declarationText") ?? ""),
    submitLabel: String(formData.get("submitLabel") ?? ""),
    mapLink: String(formData.get("mapLink") ?? ""),
    categoriesLabel: String(formData.get("categoriesLabel") ?? ""),
    ticketOptionsLabel: String(formData.get("ticketOptionsLabel") ?? ""),
    ticketOptions,
    categories,
    posterImage: String(formData.get("posterImage") ?? ""),
    introLine: String(formData.get("introLine") ?? ""),
    descriptionText: String(formData.get("descriptionText") ?? ""),
    emailIntroLine: String(formData.get("emailIntroLine") ?? ""),
    emailDescriptionText: String(formData.get("emailDescriptionText") ?? ""),
    disclaimerPdfUrl: String(formData.get("disclaimerPdfUrl") ?? ""),
    disclaimerHeading: String(formData.get("disclaimerHeading") ?? "")
  });
}

export function parseAdminEventGroupFormData(formData: FormData) {
  return adminEventGroupSchema.parse({
    id: String(formData.get("id") ?? "") || undefined,
    name: String(formData.get("name") ?? ""),
    slug: String(formData.get("slug") ?? ""),
    description: String(formData.get("description") ?? ""),
    sortOrder: Number(formData.get("sortOrder") ?? 0),
    active: formData.get("active") !== "false"
  });
}
