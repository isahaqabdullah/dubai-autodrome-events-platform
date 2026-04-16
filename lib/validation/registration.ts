import { z } from "zod";
import { isValidPhoneNumber, PHONE_NUMBER_VALIDATION_MESSAGE } from "@/lib/utils";

const optionalOtpSchema = z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code.").optional()
);

const optionalPhoneSchema = z
  .string()
  .trim()
  .max(40)
  .refine((value) => value === "" || isValidPhoneNumber(value), PHONE_NUMBER_VALIDATION_MESSAGE)
  .optional();

const requiredPhoneSchema = z
  .string()
  .trim()
  .min(1, "Phone number is required.")
  .max(40)
  .refine(isValidPhoneNumber, PHONE_NUMBER_VALIDATION_MESSAGE);

// Relaxed attendee schema for the start/OTP step (names not yet required)
const attendeeStartSchema = z.object({
  firstName: z.string().trim().max(120).optional().or(z.literal("")),
  lastName: z.string().trim().max(120).optional().or(z.literal("")),
  age: z.number().int().min(1).max(120).optional(),
  categoryId: z.string().trim().min(1).max(80),
  categoryTitle: z.string().trim().min(1).max(120),
  ticketOptionId: z.string().trim().max(80).optional().or(z.literal("")),
  ticketOptionTitle: z.string().trim().max(120).optional().or(z.literal("")),
  email: z.string().trim().email().max(255).optional().or(z.literal(""))
});

// Strict attendee schema for the complete/confirm step
export const attendeeSchema = z.object({
  firstName: z.string().trim().min(2).max(120),
  lastName: z.string().trim().min(2).max(120),
  age: z.number().int().min(1).max(120),
  categoryId: z.string().trim().min(1).max(80),
  categoryTitle: z.string().trim().min(1).max(120),
  ticketOptionId: z.string().trim().max(80).optional().or(z.literal("")),
  ticketOptionTitle: z.string().trim().max(120).optional().or(z.literal("")),
  email: z.string().trim().email().max(255).optional().or(z.literal(""))
});

export type AttendeeInput = z.infer<typeof attendeeSchema>;

export const registrationStartSchema = z.object({
  eventId: z.string().uuid(),
  selectedTicketId: z.string().trim().min(1).max(80),
  selectedTicketTitle: z.string().trim().min(1).max(120),
  categoryId: z.string().trim().min(1).max(80),
  categoryTitle: z.string().trim().min(1).max(120),
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(255),
  phone: optionalPhoneSchema,
  age: z.number().int().min(1).max(120).optional(),
  uaeResident: z.boolean().optional(),
  website: z.string().max(0).optional().or(z.literal("")),
  attendees: z.array(attendeeStartSchema).min(1).max(5).optional()
});

export const registrationCompleteSchema = registrationStartSchema.extend({
  fullName: z.string().trim().min(2).max(120),
  phone: requiredPhoneSchema,
  age: z.number().int().min(1).max(120),
  uaeResident: z.boolean(),
  declarationAccepted: z.literal(true),
  otp: optionalOtpSchema,
  attendees: z.array(attendeeSchema).min(1).max(5).optional()
});

export const verifyOtpSchema = z.object({
  eventId: z.string().uuid(),
  email: z.string().trim().email().max(255),
  otp: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code.")
});

export const resendVerificationSchema = registrationStartSchema;
