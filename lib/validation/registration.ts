import { z } from "zod";

export const registrationStartSchema = z.object({
  eventId: z.string().uuid(),
  selectedTicketId: z.string().trim().min(1).max(80),
  selectedTicketTitle: z.string().trim().min(1).max(120),
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(255),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  age: z.number().int().min(1).max(120).optional(),
  uaeResident: z.boolean().optional(),
  website: z.string().max(0).optional().or(z.literal(""))
});

export const registrationCompleteSchema = registrationStartSchema.extend({
  phone: z.string().trim().min(1).max(40),
  age: z.number().int().min(1).max(120),
  uaeResident: z.boolean(),
  declarationAccepted: z.literal(true),
  otp: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code.")
});

export const verifyOtpSchema = z.object({
  eventId: z.string().uuid(),
  email: z.string().trim().email().max(255),
  otp: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code.")
});

export const resendVerificationSchema = registrationStartSchema;
