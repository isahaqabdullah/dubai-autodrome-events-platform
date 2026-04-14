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
import { buildAbsoluteUrl, getRegistrationWindowState, normalizeEmail, normalizePhone } from "@/lib/utils";
import { registrationCompleteSchema, registrationStartSchema } from "@/lib/validation/registration";
import { buildConfirmationEmail, buildVerificationEmail } from "@/services/email-templates";
import { executeEmailJob } from "@/services/email-jobs";
import { getEventById, getRegistrationCountForEvent } from "@/services/events";
import { sendMail } from "@/services/mailer";
import type { z } from "zod";

type RegistrationStartInput = z.infer<typeof registrationStartSchema>;
type RegistrationCompleteInput = z.infer<typeof registrationCompleteSchema>;

export interface RegistrationRequestMetadata {
  ipAddress: string | null;
  userAgent: string | null;
}

export interface RegistrationStartResult {
  outcome: "pending_verification" | "already_registered" | "rate_limited" | "registration_closed" | "invalid_ticket";
  message: string;
}

export interface VerifyOtpResult {
  valid: boolean;
  message: string;
}

export interface RegistrationConfirmResult {
  outcome: "confirmed" | "invalid" | "expired" | "already_registered" | "already_verified";
  message: string;
  registrationId?: string;
  eventId?: string;
  qrToken?: string;
  email?: string;
  ticketTitle?: string;
}

function buildPosterImageUrl() {
  return buildAbsoluteUrl(env.APP_URL, "/train-with-dubai-police-cover.png");
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

function resolveTicketSelection(event: EventRecord, input: RegistrationStartInput) {
  if (input.selectedTicketId === "general-admission") {
    return {
      id: "general-admission",
      title: "General Admission",
      soldOut: false
    };
  }

  const configuredTicket = event.form_config?.ticketOptions?.find((ticket) => ticket.id === input.selectedTicketId);

  if (!configuredTicket || !input.selectedTicketTitle.includes(configuredTicket.title)) {
    return null;
  }

  return configuredTicket;
}

function generateVerificationCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function queueConfirmationEmail(input: {
  event: EventRecord;
  registrationId: string;
  eventId: string;
  email: string;
  fullName: string;
  qrToken: string;
  ticketTitle: string;
}) {
  await executeEmailJob(
    "registration_confirmed",
    {
      eventId: input.eventId,
      registrationId: input.registrationId,
      email: input.email
    },
    async () => {
      const qrAttachment = await buildQrEmailAttachment(input.qrToken);
      const mail = buildConfirmationEmail({
        fullName: input.fullName,
        eventTitle: input.event.title,
        eventStartAt: input.event.start_at,
        eventEndAt: input.event.end_at,
        eventTimezone: input.event.timezone,
        venue: input.event.venue,
        mapLink: input.event.form_config?.mapLink,
        ticketTitle: input.ticketTitle,
        posterImageUrl: buildPosterImageUrl(),
        qrImageSrc: buildQrEmailCid(qrAttachment.contentId)
      });

      await sendMail({
        to: input.email,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        attachments: [qrAttachment]
      });

      const { error } = await createAdminSupabaseClient()
        .from("registrations")
        .update({
          confirmation_email_sent_at: new Date().toISOString()
        })
        .eq("id", input.registrationId);

      if (error) {
        console.error("[registration_confirmed] failed to mark confirmation email as sent", {
          registrationId: input.registrationId,
          error: error.message
        });
      }
    }
  );
}

export async function startRegistrationAttempt(
  input: RegistrationStartInput,
  metadata: RegistrationRequestMetadata
): Promise<RegistrationStartResult> {
  if (isDemoMode()) {
    return {
      outcome: "pending_verification",
      message: "Demo mode: verification OTP sending is simulated. Use 123456 to complete registration."
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

  const emailNormalized = normalizeEmail(input.email);
  const supabase = createAdminSupabaseClient();
  const existingRegistrationPromise = supabase
    .from("registrations")
    .select("id")
    .eq("event_id", input.eventId)
    .eq("email_normalized", emailNormalized)
    .maybeSingle();
  const [event, registrationCount, existingRegistrationResult] = await Promise.all([
    getEventById(input.eventId),
    getRegistrationCountForEvent(input.eventId),
    existingRegistrationPromise
  ]);

  if (!event) {
    throw new Error("Event not found.");
  }

  if (existingRegistrationResult.error) {
    throw existingRegistrationResult.error;
  }

  if (existingRegistrationResult.data) {
    return {
      outcome: "already_registered",
      message: "This email is already registered for this event edition."
    };
  }

  const registrationState = ensureRegistrationOpen(event, registrationCount);

  if (!registrationState.allowed) {
    return {
      outcome: "registration_closed",
      message: registrationState.message
    };
  }

  const selectedTicket = resolveTicketSelection(event, input);

  if (!selectedTicket || selectedTicket.soldOut) {
    return {
      outcome: "invalid_ticket",
      message: "The selected admission is not available."
    };
  }

  const verificationCode = generateVerificationCode();
  const verificationTokenHash = hashOpaqueToken(verificationCode);
  const verificationExpiresAt = new Date(Date.now() + VERIFICATION_TOKEN_TTL_MINUTES * 60 * 1000).toISOString();

  const { error: insertError } = await supabase.from("pending_registrations").insert({
    event_id: event.id,
    full_name: input.fullName.trim(),
    email_raw: input.email.trim(),
    email_normalized: emailNormalized,
    phone: input.phone ? normalizePhone(input.phone) : null,
    age: input.age ?? null,
    uae_resident: input.uaeResident ?? false,
    ticket_option_id: selectedTicket.id,
    ticket_option_title: selectedTicket.title,
    declaration_version: event.declaration_version,
    declaration_accepted: false,
    verification_token_hash: verificationTokenHash,
    verification_expires_at: verificationExpiresAt,
    source_ip: metadata.ipAddress,
    user_agent: metadata.userAgent
  });

  if (insertError) {
    throw insertError;
  }

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
        otpCode: verificationCode
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
    message: "Verification code sent. Enter the 6-digit OTP to complete registration."
  };
}

export async function resendVerificationAttempt(
  input: RegistrationStartInput,
  metadata: RegistrationRequestMetadata
) {
  return startRegistrationAttempt(input, metadata);
}

export async function verifyOtp(
  input: { eventId: string; email: string; otp: string }
): Promise<VerifyOtpResult> {
  if (isDemoMode()) {
    return {
      valid: input.otp === "123456",
      message: input.otp === "123456"
        ? "Email verified."
        : "Invalid verification code. In demo mode, use 123456."
    };
  }

  const emailNormalized = normalizeEmail(input.email);
  const verificationTokenHash = hashOpaqueToken(input.otp);
  const supabase = createAdminSupabaseClient();

  const { data: pendingRegistration, error } = await supabase
    .from("pending_registrations")
    .select("id, verification_expires_at, verified_at")
    .eq("event_id", input.eventId)
    .eq("email_normalized", emailNormalized)
    .eq("verification_token_hash", verificationTokenHash)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!pendingRegistration) {
    return { valid: false, message: "The verification code is invalid." };
  }

  if (pendingRegistration.verified_at) {
    return { valid: false, message: "This verification code has already been used." };
  }

  if (new Date(pendingRegistration.verification_expires_at).getTime() < Date.now()) {
    return { valid: false, message: "This verification code has expired. Request a new one." };
  }

  return { valid: true, message: "Email verified." };
}

export async function confirmRegistrationFromToken(
  input: { token: string }
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

  await queueConfirmationEmail({
    event,
    registrationId: result.registration_id,
    eventId: result.event_id,
    email: result.email_raw,
    fullName: result.full_name,
    qrToken,
    ticketTitle: "General Admission"
  });

  return {
    outcome: "confirmed",
    message: "Registration confirmed. Your QR code has been sent by email.",
    registrationId: result.registration_id,
    eventId: result.event_id
  };
}

export async function confirmRegistrationFromOtp(
  input: RegistrationCompleteInput,
  metadata: RegistrationRequestMetadata
): Promise<RegistrationConfirmResult> {
  if (isDemoMode()) {
    return {
      outcome: input.otp === "123456" ? "confirmed" : "invalid",
      message:
        input.otp === "123456"
          ? "Demo mode: registration confirmed and QR delivery simulated."
          : "Demo mode: use OTP 123456 to preview a successful confirmation.",
      eventId: demoEvents[0]?.id,
      registrationId: "demo-registration",
      qrToken: "demo",
      email: input.email,
      ticketTitle: input.selectedTicketTitle
    };
  }

  const emailNormalized = normalizeEmail(input.email);
  const verificationTokenHash = hashOpaqueToken(input.otp);
  const supabase = createAdminSupabaseClient();
  const pendingRegistrationPromise = supabase
    .from("pending_registrations")
    .select("id, verification_expires_at, verified_at")
    .eq("event_id", input.eventId)
    .eq("email_normalized", emailNormalized)
    .eq("verification_token_hash", verificationTokenHash)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const [event, pendingRegistrationResult] = await Promise.all([getEventById(input.eventId), pendingRegistrationPromise]);

  if (!event) {
    throw new Error("Event not found.");
  }

  const selectedTicket = resolveTicketSelection(event, input);

  if (!selectedTicket || selectedTicket.soldOut) {
    return {
      outcome: "invalid",
      message: "The selected admission is not available."
    };
  }

  if (pendingRegistrationResult.error) {
    throw pendingRegistrationResult.error;
  }

  const pendingRegistration = pendingRegistrationResult.data;

  if (!pendingRegistration) {
    return {
      outcome: "invalid",
      message: "The verification code is invalid."
    };
  }

  if (pendingRegistration.verified_at) {
    return {
      outcome: "already_verified",
      message: "This verification code has already been used."
    };
  }

  if (new Date(pendingRegistration.verification_expires_at).getTime() < Date.now()) {
    return {
      outcome: "expired",
      message: "This verification code has expired. Request a new one to continue."
    };
  }

  const { error: updatePendingError } = await supabase
    .from("pending_registrations")
    .update({
      full_name: input.fullName.trim(),
      email_raw: input.email.trim(),
      email_normalized: emailNormalized,
      phone: normalizePhone(input.phone),
      age: input.age,
      uae_resident: input.uaeResident,
      ticket_option_id: selectedTicket.id,
      ticket_option_title: selectedTicket.title,
      declaration_version: event.declaration_version,
      declaration_accepted: true,
      source_ip: metadata.ipAddress,
      user_agent: metadata.userAgent
    })
    .eq("id", pendingRegistration.id);

  if (updatePendingError) {
    throw updatePendingError;
  }

  const qrToken = generateOpaqueToken();
  const qrTokenHash = hashOpaqueToken(qrToken);

  const { data, error } = await supabase.rpc("confirm_pending_registration_by_otp", {
    p_event_id: input.eventId,
    p_email_normalized: emailNormalized,
    p_verification_code_hash: verificationTokenHash,
    p_qr_token_hash: qrTokenHash
  });

  if (error) {
    throw error;
  }

  const result = Array.isArray(data) ? data[0] : null;

  if (!result) {
    return {
      outcome: "invalid",
      message: "The verification code is invalid."
    };
  }

  if (result.outcome !== "confirmed") {
    return {
      outcome: result.outcome,
      message:
        result.outcome === "expired"
          ? "This verification code has expired. Request a new one to continue."
          : result.outcome === "already_registered"
            ? "This email is already registered for this event edition."
            : result.outcome === "already_verified"
              ? "This verification code has already been used."
              : "The verification code is invalid."
    };
  }

  const ticketTitle = selectedTicket.title;

  await queueConfirmationEmail({
    event,
    registrationId: result.registration_id,
    eventId: result.event_id,
    email: result.email_raw,
    fullName: result.full_name,
    qrToken,
    ticketTitle
  });

  return {
    outcome: "confirmed",
    message: "Registration confirmed. Your ticket QR code has been sent by email.",
    registrationId: result.registration_id,
    eventId: result.event_id,
    qrToken,
    email: result.email_raw,
    ticketTitle
  };
}
