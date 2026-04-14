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
  MAIL_FROM_EMAIL: z.string().email().default("info@example.com"),
  MAIL_REPLY_TO_EMAIL: z.string().email().default("info@example.com"),
  APP_URL: z.string().url(),
  CRON_SECRET: z.string().optional()
});

const rawServerEnv = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  MAIL_FROM_EMAIL: process.env.MAIL_FROM_EMAIL ?? "info@example.com",
  MAIL_REPLY_TO_EMAIL: process.env.MAIL_REPLY_TO_EMAIL ?? "info@example.com",
  APP_URL: process.env.APP_URL,
  CRON_SECRET: process.env.CRON_SECRET
};

export const env = serverEnvSchema.parse(rawServerEnv);

export const resendConfigured = Boolean(env.RESEND_API_KEY);
