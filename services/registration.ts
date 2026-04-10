import "server-only";
import { RATE_LIMIT_MAX_REQUESTS, RATE_LIMIT_WINDOW_SECONDS, VERIFICATION_TOKEN_TTL_MINUTES } from "@/lib/constants";
import { demoEvents } from "@/lib/demo-data";
import { isDemoMode } from "@/lib/demo-mode";
import { env } from "@/lib/env";
import { buildQrEmailAttachment, buildQrEmailCid } from "@/lib/qr";
import { checkRateLimit } from "@/lib/rate-limit";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { generateOpaqueToken, hashOpaqueToken } from "@/lib/tokens";
import type { EventRecord } from "@/lib/types";
import { blankToNull, buildAbsoluteUrl, getRegistrationWindowState, normalizeEmail, normalizePhone } from "@/lib/utils";
import { registrationConfirmSchema, registrationStartSchema } from "@/lib/validation/registration";
import { buildConfirmationEmail, buildVerificationEmail } from "@/services/email-templates";
import { executeEmailJob } from "@/services/email-jobs";
import { getEventById, getRegistrationCountForEvent } from "@/services/events";
import { sendMail } from "@/services/mailer";
import type { z } from "zod";

type RegistrationStartInput = z.infer<typeof registrationStartSchema>;
type RegistrationConfirmInput = z.infer<typeof registrationConfirmSchema>;

export interface RegistrationRequestMetadata {
  ipAddress: string | null;
  userAgent: string | null;
}

export interface RegistrationStartResult {
  outcome: "pending_verification" | "already_registered" | "rate_limited" | "registration_closed";
  message: string;
}

export interface RegistrationConfirmResult {
  outcome: "confirmed" | "invalid" | "expired" | "already_registered" | "already_verified";
  message: string;
  registrationId?: string;
  eventId?: string;
}

function buildVerificationUrl(token: string) {
  return buildAbsoluteUrl(env.APP_URL, `/verify?token=${encodeURIComponent(token)}`);
}

function ensureRegistrationOpen(event: EventRecord, registrationCount: number) {
  const windowState = getRegistrationWindowState(event);

  if (windowState.state !== "open") {
    return {
      allowed: false,
      message: windowState.label
    };
  }

  if (event.capacity && registrationCount >= event.capacity) {
    return {
      allowed: false,
      message: "Registration capacity reached"
    };
  }

  return {
    allowed: true,
    message: "Registration open"
  };
}

export async function startRegistrationAttempt(
  input: RegistrationStartInput,
  metadata: RegistrationRequestMetadata
): Promise<RegistrationStartResult> {
  if (isDemoMode()) {
    return {
      outcome: "pending_verification",
      message: "Demo mode: verification email sending is simulated. Open /verify?token=demo to preview confirmation."
    };
  }

  if (input.website) {
    return {
      outcome: "pending_verification",
      message: "Check your inbox to verify your email and finish registering."
    };
  }

  const rateLimitKey = `${metadata.ipAddress ?? "unknown"}:${input.eventId}:register`;
  const rateLimit = checkRateLimit(rateLimitKey, RATE_LIMIT_WINDOW_SECONDS, RATE_LIMIT_MAX_REQUESTS);

  if (!rateLimit.allowed) {
    return {
      outcome: "rate_limited",
      message: "Too many attempts. Please wait a minute before trying again."
    };
  }

  const event = await getEventById(input.eventId);

  if (!event) {
    throw new Error("Event not found.");
  }

  const registrationCount = await getRegistrationCountForEvent(event.id);
  const registrationState = ensureRegistrationOpen(event, registrationCount);

  if (!registrationState.allowed) {
    return {
      outcome: "registration_closed",
      message: registrationState.message
    };
  }

  const emailNormalized = normalizeEmail(input.email);
  const supabase = createAdminSupabaseClient();

  const { data: existingRegistration, error: existingError } = await supabase
    .from("registrations")
    .select("id")
    .eq("event_id", input.eventId)
    .eq("email_normalized", emailNormalized)
    .maybeSingle();

  if (existingError) {
    throw existingError;
  }

  if (existingRegistration) {
    return {
      outcome: "already_registered",
      message: "This email is already registered for this event edition."
    };
  }

  const verificationToken = generateOpaqueToken();
  const verificationTokenHash = hashOpaqueToken(verificationToken);
  const verificationExpiresAt = new Date(Date.now() + VERIFICATION_TOKEN_TTL_MINUTES * 60 * 1000).toISOString();

  const { error: insertError } = await supabase.from("pending_registrations").insert({
    event_id: event.id,
    full_name: input.fullName.trim(),
    email_raw: input.email.trim(),
    email_normalized: emailNormalized,
    phone: normalizePhone(input.phone),
    company: blankToNull(input.company),
    emergency_contact_name: blankToNull(input.emergencyContactName),
    emergency_contact_phone: normalizePhone(input.emergencyContactPhone),
    declaration_version: event.declaration_version,
    declaration_accepted: true,
    verification_token_hash: verificationTokenHash,
    verification_expires_at: verificationExpiresAt,
    source_ip: metadata.ipAddress,
    user_agent: metadata.userAgent
  });

  if (insertError) {
    throw insertError;
  }

  const verifyUrl = buildVerificationUrl(verificationToken);

  await executeEmailJob(
    "verify_email",
    {
      eventId: event.id,
      email: input.email.trim(),
      fullName: input.fullName.trim()
    },
    async () => {
      const mail = buildVerificationEmail({
        fullName: input.fullName.trim(),
        eventTitle: event.title,
        verifyUrl
      });

      await sendMail({
        to: input.email.trim(),
        subject: mail.subject,
        html: mail.html,
        text: mail.text
      });
    }
  );

  return {
    outcome: "pending_verification",
    message: "Check your inbox to verify your email and finish registering."
  };
}

export async function resendVerificationAttempt(
  input: RegistrationStartInput,
  metadata: RegistrationRequestMetadata
) {
  return startRegistrationAttempt(input, metadata);
}

export async function confirmRegistrationFromToken(
  input: RegistrationConfirmInput
): Promise<RegistrationConfirmResult> {
  if (isDemoMode()) {
    return {
      outcome: input.token === "demo" ? "confirmed" : "invalid",
      message:
        input.token === "demo"
          ? "Demo mode: registration confirmed and QR delivery simulated."
          : "Demo mode: use /verify?token=demo to preview a successful confirmation.",
      eventId: demoEvents[0]?.id,
      registrationId: "demo-registration"
    };
  }

  const supabase = createAdminSupabaseClient();
  const verificationTokenHash = hashOpaqueToken(input.token);
  const qrToken = generateOpaqueToken();
  const qrTokenHash = hashOpaqueToken(qrToken);

  const { data, error } = await supabase.rpc("confirm_pending_registration", {
    p_verification_token_hash: verificationTokenHash,
    p_qr_token_hash: qrTokenHash
  });

  if (error) {
    throw error;
  }

  const result = Array.isArray(data) ? data[0] : null;

  if (!result) {
    return {
      outcome: "invalid",
      message: "The verification link is invalid."
    };
  }

  if (result.outcome !== "confirmed") {
    return {
      outcome: result.outcome,
      message:
        result.outcome === "expired"
          ? "This verification link has expired. Start registration again to receive a new email."
          : result.outcome === "already_registered"
            ? "This email is already registered for this event edition."
            : result.outcome === "already_verified"
              ? "This verification link has already been used."
              : "The verification link is invalid."
    };
  }

  const event = await getEventById(result.event_id);

  if (!event) {
    throw new Error("Event not found after confirmation.");
  }

  const qrAttachment = await buildQrEmailAttachment(qrToken);

  await executeEmailJob(
    "registration_confirmed",
    {
      eventId: result.event_id,
      registrationId: result.registration_id,
      email: result.email_raw
    },
    async () => {
      const mail = buildConfirmationEmail({
        fullName: result.full_name,
        eventTitle: event.title,
        eventStartAt: event.start_at,
        eventEndAt: event.end_at,
        eventTimezone: event.timezone,
        venue: event.venue,
        qrImageSrc: buildQrEmailCid(qrAttachment.contentId)
      });

      await sendMail({
        to: result.email_raw,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        attachments: [qrAttachment]
      });
    }
  );

  await supabase
    .from("registrations")
    .update({
      confirmation_email_sent_at: new Date().toISOString()
    })
    .eq("id", result.registration_id);

  return {
    outcome: "confirmed",
    message: "Registration confirmed. Your QR code has been sent by email.",
    registrationId: result.registration_id,
    eventId: result.event_id
  };
}
