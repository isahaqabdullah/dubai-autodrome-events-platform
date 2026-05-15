import { z } from "zod";

const eventTicketOptionSchema = z.object({
  id: z.string().trim().min(1).max(80),
  title: z.string().trim().min(2).max(120),
  description: z.string().trim().max(1000).default(""),
  note: z.string().trim().max(240).optional().or(z.literal("")).or(z.null()),
  badge: z.string().trim().max(40).optional().or(z.literal("")).or(z.null()),
  capacity: z.coerce.number().int().positive().nullable().optional(),
  priceMinor: z.coerce.number().int().min(0).default(0).optional(),
  currencyCode: z.string().trim().regex(/^[A-Z]{3}$/).default("AED").optional(),
  soldOut: z.coerce.boolean().default(false)
});

function hasAvailableOption(options: Array<z.infer<typeof eventTicketOptionSchema>>) {
  return options.some((option) => !option.soldOut);
}

export const adminEventSchema = z
  .object({
    id: z.string().uuid().optional(),
    eventGroupId: z.string().uuid("Choose an event category."),
    slug: z.string().trim().min(2).max(80),
    title: z.string().trim().min(2).max(160),
    venue: z.string().trim().max(255).optional().or(z.literal("")),
    timezone: z.string().trim().min(2).max(60),
    startAt: z.string().trim().min(1),
    endAt: z.string().trim().min(1),
    registrationOpensAt: z.string().trim().optional().or(z.literal("")),
    registrationClosesAt: z.string().trim().optional().or(z.literal("")),
    status: z.enum(["draft", "open", "closed", "live", "archived"]),
    capacity: z
      .string()
      .trim()
      .refine((value) => value === "" || (!Number.isNaN(Number(value)) && Number(value) > 0), {
        message: "Capacity must be a positive number."
      })
      .optional()
      .or(z.literal("")),
    declarationVersion: z.coerce.number().int().positive(),
    declarationText: z.string().trim().min(10).max(10000),
    submitLabel: z.string().trim().max(80).optional().or(z.literal("")),
    mapLink: z.string().trim().url().max(2048).optional().or(z.literal("")),
    categoriesLabel: z.string().trim().max(80).optional().or(z.literal("")),
    ticketOptionsLabel: z.string().trim().max(80).optional().or(z.literal("")),
    categories: z.array(eventTicketOptionSchema).default([]),
    ticketOptions: z.array(eventTicketOptionSchema).default([]),
    posterImage: z.string().trim().max(2048).optional().or(z.literal("")),
    introLine: z.string().trim().max(500).optional().or(z.literal("")),
    descriptionText: z.string().trim().max(5000).optional().or(z.literal("")),
    emailIntroLine: z.string().trim().max(500).optional().or(z.literal("")),
    emailDescriptionText: z.string().trim().max(5000).optional().or(z.literal("")),
    disclaimerPdfUrl: z.string().trim().max(2048).optional().or(z.literal("")),
    disclaimerHeading: z.string().trim().max(200).optional().or(z.literal(""))
  })
  .refine((input) => new Date(input.endAt).getTime() > new Date(input.startAt).getTime(), {
    path: ["endAt"],
    message: "End time must be after the start time."
  })
  .refine((input) => !["open", "live"].includes(input.status) || hasAvailableOption(input.categories), {
    path: ["categories"],
    message: "Add at least one available ticket type before opening registration."
  })
  .refine((input) => !["open", "live"].includes(input.status) || hasAvailableOption(input.ticketOptions), {
    path: ["ticketOptions"],
    message: "Add at least one available activity category before opening registration."
  });

export const adminEventGroupSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2).max(120),
  slug: z.string().trim().min(2).max(80),
  description: z.string().trim().max(500).optional().or(z.literal("")),
  sortOrder: z.coerce.number().int().min(0).default(0),
  active: z.coerce.boolean().default(true)
});

export const resendQrSchema = z.object({
  registrationId: z.string().uuid()
});

export const revokeRegistrationSchema = z.object({
  registrationId: z.string().uuid(),
  reason: z.string().trim().max(240).optional().or(z.literal(""))
});

export const deleteEventSchema = z.object({
  eventId: z.string().uuid()
});

export const exportQuerySchema = z.object({
  eventId: z.string().uuid()
});

const salesReportDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date in YYYY-MM-DD format.")
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, "Use a valid calendar date.");

export const salesReportQuerySchema = z.object({
  date: salesReportDateSchema,
  eventId: z.string().uuid().optional()
});
