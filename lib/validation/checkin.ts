import { z } from "zod";

export const checkinScanSchema = z.object({
  eventId: z.string().uuid(),
  token: z.string().trim().min(16).max(256),
  gateName: z.string().trim().max(100).optional().or(z.literal("")),
  deviceId: z.string().trim().max(100).optional().or(z.literal(""))
});

export const manualCheckinSchema = z.object({
  eventId: z.string().uuid(),
  registrationId: z.string().uuid(),
  gateName: z.string().trim().max(100).optional().or(z.literal("")),
  deviceId: z.string().trim().max(100).optional().or(z.literal(""))
});

export const manualCheckinByCodeSchema = z.object({
  eventId: z.string().uuid(),
  manualCheckinCode: z
    .string()
    .trim()
    .regex(/^[A-HJ-NP-Za-hj-np-z2-9]{4}$/, "Enter the 4-character manual code.")
    .transform((value) => value.toUpperCase())
});

export const searchRegistrationsSchema = z.object({
  eventId: z.string().uuid(),
  query: z.string().trim().min(4).max(100)
});
