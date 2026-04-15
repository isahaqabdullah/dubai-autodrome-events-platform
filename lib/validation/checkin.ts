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

export const manualCheckinByEmailSchema = z.object({
  eventId: z.string().uuid(),
  email: z.string().trim().email().max(320)
});
