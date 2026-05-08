import { z } from "zod";
import { isValidPhoneNumber, PHONE_NUMBER_VALIDATION_MESSAGE } from "@/lib/utils";

const activityCategoryIdSchema = z.string().trim().min(1).max(80);
const optionalActivityCategoryIdSchema = z.string().trim().max(80).optional().or(z.literal(""));
const optionalAgeSchema = z.preprocess(
  (value) => value === "" || value === null ? undefined : value,
  z.coerce.number().int().min(1).max(120).optional()
);
const requiredAgeSchema = z.coerce.number().int().min(1).max(120);

export const checkoutAttendeeStartSchema = z.object({
  firstName: z.string().trim().max(120).optional().or(z.literal("")),
  lastName: z.string().trim().max(120).optional().or(z.literal("")),
  email: z.string().trim().email().max(255).optional().or(z.literal("")),
  age: optionalAgeSchema,
  categoryId: z.string().trim().min(1).max(80),
  addonId: optionalActivityCategoryIdSchema
});

export const checkoutAttendeePaymentSchema = z.object({
  firstName: z.string().trim().min(1).max(120),
  lastName: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(255).optional().or(z.literal("")),
  age: requiredAgeSchema,
  categoryId: z.string().trim().min(1).max(80),
  addonId: activityCategoryIdSchema
});

export const checkoutStartSchema = z.object({
  eventId: z.string().uuid(),
  categoryId: z.string().trim().min(1).max(80),
  addonId: optionalActivityCategoryIdSchema,
  firstName: z.string().trim().max(120).optional().or(z.literal("")),
  lastName: z.string().trim().max(120).optional().or(z.literal("")),
  email: z.string().trim().email().max(255),
  phone: z
    .string()
    .trim()
    .max(40)
    .refine((value) => value === "" || isValidPhoneNumber(value), PHONE_NUMBER_VALIDATION_MESSAGE)
    .optional(),
  age: optionalAgeSchema,
  uaeResident: z.boolean().optional(),
  marketingOptIn: z.boolean().optional().default(false),
  declarationAccepted: z.boolean().optional(),
  website: z.string().max(0).optional().or(z.literal("")),
  attendees: z.array(checkoutAttendeeStartSchema).min(1).max(5).optional()
});

export const checkoutVerifyOtpSchema = z.object({
  checkoutToken: z.string().min(10),
  otp: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code.")
});

export const checkoutResendOtpSchema = z.object({
  checkoutToken: z.string().min(10)
});

export const checkoutCreatePaymentSchema = z.object({
  checkoutToken: z.string().min(10),
  declarationAccepted: z.literal(true),
  phone: z
    .string()
    .trim()
    .min(1, "Enter your phone number.")
    .max(40)
    .refine(isValidPhoneNumber, PHONE_NUMBER_VALIDATION_MESSAGE),
  uaeResident: z.boolean(),
  marketingOptIn: z.boolean().optional().default(false),
  attendees: z.array(checkoutAttendeePaymentSchema).min(1).max(5).optional()
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
export type CheckoutResendOtpInput = z.infer<typeof checkoutResendOtpSchema>;
export type CheckoutVerifyOtpInput = z.infer<typeof checkoutVerifyOtpSchema>;
export type CheckoutCreatePaymentInput = z.infer<typeof checkoutCreatePaymentSchema>;
