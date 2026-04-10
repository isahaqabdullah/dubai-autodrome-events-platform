import { z } from "zod";

export const adminEventSchema = z
  .object({
    id: z.string().uuid().optional(),
    slug: z.string().trim().min(2).max(80),
    title: z.string().trim().min(2).max(160),
    description: z.string().trim().max(5000).optional().or(z.literal("")),
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
    introNote: z.string().trim().max(280).optional().or(z.literal("")),
    successMessage: z.string().trim().max(280).optional().or(z.literal("")),
    showCompanyField: z.coerce.boolean().default(false),
    showEmergencyFields: z.coerce.boolean().default(false)
  })
  .refine((input) => new Date(input.endAt).getTime() > new Date(input.startAt).getTime(), {
    path: ["endAt"],
    message: "End time must be after the start time."
  });

export const resendQrSchema = z.object({
  registrationId: z.string().uuid()
});

export const revokeRegistrationSchema = z.object({
  registrationId: z.string().uuid(),
  reason: z.string().trim().max(240).optional().or(z.literal(""))
});

export const exportQuerySchema = z.object({
  eventId: z.string().uuid()
});
