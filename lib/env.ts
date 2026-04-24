import "server-only";
import { z } from "zod";

// Zod only validates and normalizes values. The actual secrets come from process.env.
const serverEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z
    .string()
    .min(1)
    .refine((value) => !value.startsWith("sb_secret_"), {
      message:
        "NEXT_PUBLIC_SUPABASE_ANON_KEY must be a Supabase publishable key or legacy anon key, never an sb_secret_ key."
    }),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  RESEND_API_KEY: z.string().optional(),
  MAIL_FROM_NAME: z.preprocess(
    (value) => (typeof value === "string" ? value.trim() || undefined : value),
    z.string().max(120).optional()
  ),
  MAIL_FROM_EMAIL: z.string().email().default("info@example.com"),
  MAIL_REPLY_TO_EMAIL: z.string().email().default("info@example.com"),
  APP_URL: z.string().url(),
  CRON_SECRET: z.string().optional(),
  CHECKOUT_HMAC_SECRET: z.string().optional(),
  NGENIUS_ENVIRONMENT: z.string().optional(),
  NGENIUS_API_BASE_URL: z.string().url().optional(),
  NGENIUS_API_KEY: z.string().optional(),
  NGENIUS_OUTLET_REF: z.string().optional(),
  NGENIUS_WEBHOOK_HEADER_NAME: z.string().optional(),
  NGENIUS_WEBHOOK_HEADER_VALUE: z.string().optional(),
  NGENIUS_WEBHOOK_ENCRYPTION_KEY: z.string().optional(),
  NGENIUS_WEBHOOK_ALLOWED_IPS: z.string().optional()
});

const rawServerEnv = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  MAIL_FROM_NAME: process.env.MAIL_FROM_NAME,
  MAIL_FROM_EMAIL: process.env.MAIL_FROM_EMAIL ?? "info@example.com",
  MAIL_REPLY_TO_EMAIL: process.env.MAIL_REPLY_TO_EMAIL ?? "info@example.com",
  APP_URL: process.env.APP_URL,
  CRON_SECRET: process.env.CRON_SECRET,
  CHECKOUT_HMAC_SECRET: process.env.CHECKOUT_HMAC_SECRET,
  NGENIUS_ENVIRONMENT: process.env.NGENIUS_ENVIRONMENT,
  NGENIUS_API_BASE_URL: process.env.NGENIUS_API_BASE_URL,
  NGENIUS_API_KEY: process.env.NGENIUS_API_KEY,
  NGENIUS_OUTLET_REF: process.env.NGENIUS_OUTLET_REF,
  NGENIUS_WEBHOOK_HEADER_NAME: process.env.NGENIUS_WEBHOOK_HEADER_NAME,
  NGENIUS_WEBHOOK_HEADER_VALUE: process.env.NGENIUS_WEBHOOK_HEADER_VALUE,
  NGENIUS_WEBHOOK_ENCRYPTION_KEY: process.env.NGENIUS_WEBHOOK_ENCRYPTION_KEY,
  NGENIUS_WEBHOOK_ALLOWED_IPS: process.env.NGENIUS_WEBHOOK_ALLOWED_IPS
};

export const env = serverEnvSchema.parse(rawServerEnv);

export const resendConfigured = Boolean(env.RESEND_API_KEY);

export function requireCheckoutSecret() {
  if (!env.CHECKOUT_HMAC_SECRET) {
    throw new Error("CHECKOUT_HMAC_SECRET is required for checkout tokens and deterministic QR generation.");
  }
  return env.CHECKOUT_HMAC_SECRET;
}

export function getNgeniusConfig() {
  const missing = [
    ["NGENIUS_ENVIRONMENT", env.NGENIUS_ENVIRONMENT],
    ["NGENIUS_API_BASE_URL", env.NGENIUS_API_BASE_URL],
    ["NGENIUS_API_KEY", env.NGENIUS_API_KEY],
    ["NGENIUS_OUTLET_REF", env.NGENIUS_OUTLET_REF]
  ].filter(([, value]) => !value).map(([name]) => name);

  if (missing.length > 0) {
    throw new Error(`N-Genius configuration is incomplete: ${missing.join(", ")}`);
  }

  return {
    environment: env.NGENIUS_ENVIRONMENT!,
    apiBaseUrl: env.NGENIUS_API_BASE_URL!,
    apiKey: env.NGENIUS_API_KEY!,
    outletRef: env.NGENIUS_OUTLET_REF!,
    webhookHeaderName: env.NGENIUS_WEBHOOK_HEADER_NAME,
    webhookHeaderValue: env.NGENIUS_WEBHOOK_HEADER_VALUE,
    webhookEncryptionKey: env.NGENIUS_WEBHOOK_ENCRYPTION_KEY,
    webhookAllowedIps: env.NGENIUS_WEBHOOK_ALLOWED_IPS
  };
}
