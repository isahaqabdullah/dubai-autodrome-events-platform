import { adminEventSchema } from "@/lib/validation/admin";

export function parseAdminEventFormData(formData: FormData) {
  const rawTicketOptions = String(formData.get("ticketOptionsJson") ?? "[]");
  let ticketOptions: unknown = [];

  try {
    ticketOptions = rawTicketOptions ? JSON.parse(rawTicketOptions) : [];
  } catch {
    ticketOptions = [];
  }

  return adminEventSchema.parse({
    id: String(formData.get("id") ?? "") || undefined,
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
    ticketOptions
  });
}
