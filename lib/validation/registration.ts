import { z } from "zod";

export const registrationStartSchema = z.object({
  eventId: z.string().uuid(),
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(255),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  company: z.string().trim().max(120).optional().or(z.literal("")),
  emergencyContactName: z.string().trim().max(120).optional().or(z.literal("")),
  emergencyContactPhone: z.string().trim().max(40).optional().or(z.literal("")),
  declarationAccepted: z.literal(true),
  website: z.string().max(0).optional().or(z.literal(""))
});

export const registrationConfirmSchema = z.object({
  token: z.string().trim().min(24).max(256)
});

export const resendVerificationSchema = registrationStartSchema;
