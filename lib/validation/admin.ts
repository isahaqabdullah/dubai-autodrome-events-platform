import { z } from "zod";

const eventTicketOptionSchema = z.object({
  id: z.string().trim().min(1).max(80),
  title: z.string().trim().min(2).max(120),
  description: z.string().trim().max(1000).default(""),
  note: z.string().trim().max(240).optional().or(z.literal("")),
  badge: z.string().trim().max(40).optional().or(z.literal("")),
  capacity: z.coerce.number().int().positive().nullable().optional(),
  soldOut: z.coerce.boolean().default(false)
});

export const adminEventSchema = z
  .object({
    id: z.string().uuid().optional(),
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
    ticketOptions: z.array(eventTicketOptionSchema).default([])
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

export const deleteEventSchema = z.object({
  eventId: z.string().uuid()
});

export const exportQuerySchema = z.object({
  eventId: z.string().uuid()
});
