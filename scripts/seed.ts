import { addDays, addHours } from "date-fns";
import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

loadEnvConfig(process.cwd());

const seedEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SEED_ADMIN_EMAIL: z.string().email().optional(),
  SEED_ADMIN_PASSWORD: z.string().min(8).optional(),
  SEED_STAFF_EMAIL: z.string().email().optional(),
  SEED_STAFF_PASSWORD: z.string().min(8).optional()
});

const env = seedEnvSchema.parse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  SEED_ADMIN_EMAIL: process.env.SEED_ADMIN_EMAIL,
  SEED_ADMIN_PASSWORD: process.env.SEED_ADMIN_PASSWORD,
  SEED_STAFF_EMAIL: process.env.SEED_STAFF_EMAIL,
  SEED_STAFF_PASSWORD: process.env.SEED_STAFF_PASSWORD
});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function ensureUser(email: string | undefined, password: string | undefined, role: "admin" | "staff") {
  if (!email || !password) {
    return;
  }

  const { data, error } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000
  });

  if (error) {
    throw error;
  }

  const existing = data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());

  if (existing) {
    await supabase.auth.admin.updateUserById(existing.id, {
      password,
      app_metadata: {
        role
      },
      email_confirm: true
    });

    console.log(`Updated ${role} user: ${email}`);
    return;
  }

  const { error: createError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: {
      role
    }
  });

  if (createError) {
    throw createError;
  }

  console.log(`Created ${role} user: ${email}`);
}

async function seedEvents() {
  const now = new Date();

  const editions = [
    {
      slug: "dubai-autodrome-safety-orientation-may-2026",
      title: "Dubai Autodrome Safety Orientation · May 2026",
      description:
        "Recurring site safety orientation with the reusable registration, verification, and QR-based check-in workflow.",
      venue: "Dubai Autodrome Training Hall, Dubai",
      timezone: "Asia/Dubai",
      start_at: addDays(now, 14).toISOString(),
      end_at: addHours(addDays(now, 14), 3).toISOString(),
      registration_opens_at: now.toISOString(),
      registration_closes_at: addDays(now, 13).toISOString(),
      status: "open",
      capacity: 120,
      declaration_version: 1,
      declaration_text:
        "I confirm that the details I submit are accurate, that I will follow event safety instructions, and that my QR code is unique to this event edition.",
      form_config: {
        submitLabel: "Confirm attendance"
      }
    },
    {
      slug: "dubai-autodrome-safety-orientation-june-2026",
      title: "Dubai Autodrome Safety Orientation · June 2026",
      description:
        "Next recurring edition using the same reusable event schema. The email uniqueness boundary resets because this is a different event record.",
      venue: "Dubai Autodrome Training Hall, Dubai",
      timezone: "Asia/Dubai",
      start_at: addDays(now, 44).toISOString(),
      end_at: addHours(addDays(now, 44), 3).toISOString(),
      registration_opens_at: addDays(now, 7).toISOString(),
      registration_closes_at: addDays(now, 43).toISOString(),
      status: "draft",
      capacity: 120,
      declaration_version: 2,
      declaration_text:
        "I confirm that the details I submit are accurate, that I will follow event safety instructions, and that the declaration applies to this event edition only.",
      form_config: {
        submitLabel: "Reserve my spot"
      }
    }
  ];

  const { error } = await supabase.from("events").upsert(editions, {
    onConflict: "slug"
  });

  if (error) {
    throw error;
  }

  console.log(`Seeded ${editions.length} event editions`);
}

async function main() {
  await seedEvents();
  await ensureUser(env.SEED_ADMIN_EMAIL, env.SEED_ADMIN_PASSWORD, "admin");
  await ensureUser(env.SEED_STAFF_EMAIL, env.SEED_STAFF_PASSWORD, "staff");

  console.log("Seed complete");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
