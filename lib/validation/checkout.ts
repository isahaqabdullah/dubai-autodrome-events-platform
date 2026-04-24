import { z } from "zod";
import { isValidPhoneNumber, PHONE_NUMBER_VALIDATION_MESSAGE } from "@/lib/utils";

const optionalAddonIdSchema = z.string().trim().max(80).optional().or(z.literal(""));

export const checkoutAttendeeStartSchema = z.object({
  firstName: z.string().trim().max(120).optional().or(z.literal("")),
  lastName: z.string().trim().max(120).optional().or(z.literal("")),
  email: z.string().trim().email().max(255).optional().or(z.literal("")),
  age: z.coerce.number().int().min(1).max(120).optional(),
  categoryId: z.string().trim().min(1).max(80),
  addonId: optionalAddonIdSchema
});

export const checkoutStartSchema = z.object({
  eventId: z.string().uuid(),
  categoryId: z.string().trim().min(1).max(80),
  addonId: optionalAddonIdSchema,
  firstName: z.string().trim().min(1).max(120),
  lastName: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(255),
  phone: z
    .string()
    .trim()
    .max(40)
    .refine((value) => value === "" || isValidPhoneNumber(value), PHONE_NUMBER_VALIDATION_MESSAGE)
    .optional(),
  age: z.coerce.number().int().min(1).max(120).optional(),
  uaeResident: z.boolean().optional(),
  declarationAccepted: z.boolean().optional(),
  website: z.string().max(0).optional().or(z.literal("")),
  attendees: z.array(checkoutAttendeeStartSchema).min(1).max(5).optional()
});

export const checkoutVerifyOtpSchema = z.object({
  checkoutToken: z.string().min(10),
  otp: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code.")
});

export const checkoutCreatePaymentSchema = z.object({
  checkoutToken: z.string().min(10),
  declarationAccepted: z.literal(true)
});

export const checkoutStatusSchema = z.object({
  token: z.string().min(10)
});

export const paymentAdminActionSchema = z.object({
  paymentAttemptId: z.string().uuid().optional(),
  bookingIntentId: z.string().uuid().optional(),
  action: z.enum(["refresh", "retry_fulfillment", "mark_reviewed", "cancel_expired"])
});

export type CheckoutStartInput = z.infer<typeof checkoutStartSchema>;
export type CheckoutVerifyOtpInput = z.infer<typeof checkoutVerifyOtpSchema>;
export type CheckoutCreatePaymentInput = z.infer<typeof checkoutCreatePaymentSchema>;
