import "server-only";
import { DEFAULT_CATEGORY, RATE_LIMIT_MAX_REQUESTS, RATE_LIMIT_WINDOW_SECONDS, VERIFICATION_TOKEN_TTL_MINUTES } from "@/lib/constants";
import { demoEvents } from "@/lib/demo-data";
import { isDemoMode } from "@/lib/demo-mode";
import { checkRateLimit } from "@/lib/rate-limit";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { generateOpaqueToken, hashOpaqueToken } from "@/lib/tokens";
import type { EventRecord, EventTicketOption } from "@/lib/types";
import { getRegistrationWindowState, isSyntheticEmail, normalizeEmail, normalizePhone, resolveCategories } from "@/lib/utils";
import type { AttendeeInput } from "@/lib/validation/registration";
import { registrationCompleteSchema, registrationStartSchema } from "@/lib/validation/registration";
import { buildVerificationEmail } from "@/services/email-templates";
import { enqueueEmailJob, executeEmailJob } from "@/services/email-jobs";
import { getEventById, getRegistrationSummaryForEvent } from "@/services/events";
import { sendMail } from "@/services/mailer";
import type { z } from "zod";

type RegistrationStartInput = z.infer<typeof registrationStartSchema>;
type RegistrationCompleteInput = z.infer<typeof registrationCompleteSchema>;

export interface RegistrationRequestMetadata {
  ipAddress: string | null;
  userAgent: string | null;
}

export interface RegistrationStartResult {
  outcome: "pending_verification" | "already_verified" | "rate_limited" | "registration_closed" | "invalid_ticket" | "capacity_exceeded";
  message: string;
  warning?: string;
}

export interface VerifyOtpResult {
  valid: boolean;
  message: string;
}

export interface ConfirmedAttendee {
  registrationId: string;
  fullName: string;
  qrToken: string;
  manualCheckinCode: string;
  categoryTitle: string;
  ticketTitle: string | null;
  email?: string;
}

export interface RegistrationConfirmResult {
  outcome: "confirmed" | "invalid" | "expired" | "already_verified" | "capacity_exceeded";
  message: string;
  registrationId?: string;
  eventId?: string;
  qrToken?: string;
  manualCheckinCode?: string;
  email?: string;
  ticketTitle?: string;
  bookingId?: string;
  attendees?: ConfirmedAttendee[];
}

type InvalidSelectionOutcome = "invalid" | "invalid_ticket";

type SingleSelectionValidationResult<TInvalid extends InvalidSelectionOutcome> =
  | {
      ok: true;
      category: EventTicketOption;
      additionalTicket: EventTicketOption | null;
    }
  | {
      ok: false;
      outcome: TInvalid | "capacity_exceeded";
      message: string;
    };

type PendingRegistrationLookup = {
  id: string;
  verification_expires_at: string;
  verified_at: string | null;
  email_verified_at: string | null;
};

function ensureRegistrationOpen(event: EventRecord, registrationCount: number, attendeeCount = 1) {
  const windowState = getRegistrationWindowState(event);

  if (windowState.state !== "open") {
    return {
      allowed: false,
      message: windowState.label
    };
  }

  if (event.capacity && registrationCount + attendeeCount > event.capacity) {
    return {
      allowed: false,
      message: `Not enough capacity. ${Math.max(event.capacity - registrationCount, 0)} spots remaining.`
    };
  }

  return {
    allowed: true,
    message: "Registration open"
  };
}

function resolveAdditionalTicketSelection(event: EventRecord, input: Pick<RegistrationStartInput, "selectedTicketId" | "selectedTicketTitle">) {
  if (input.selectedTicketId === "general-admission") {
    return null;
  }

  const configuredTicket = event.form_config?.ticketOptions?.find((ticket) => ticket.id === input.selectedTicketId);

  if (!configuredTicket || !input.selectedTicketTitle.includes(configuredTicket.title)) {
    return null;
  }

  return configuredTicket;
}

function validateSingleAttendeeSelection<TInvalid extends InvalidSelectionOutcome>(input: {
  event: EventRecord;
  categoryId: string;
  categoryTitle: string;
  selectedTicketId: string;
  selectedTicketTitle: string;
  categoryCounts?: Record<string, number>;
  ticketCounts?: Record<string, number>;
  registrationCount?: number;
  invalidOutcome: TInvalid;
}): SingleSelectionValidationResult<TInvalid> {
  const categories = resolveCategories(input.event.form_config);
  const category = categories.find((item) => item.id === input.categoryId);

  if (!category || category.title !== input.categoryTitle) {
    return {
      ok: false,
      outcome: input.invalidOutcome,
      message: "The selected category is not available."
    };
  }

  if (category.soldOut) {
    return {
      ok: false,
      outcome: input.invalidOutcome,
      message: `"${category.title}" is no longer available.`
    };
  }

  const shouldCheckCapacity =
    input.registrationCount !== undefined &&
    input.categoryCounts !== undefined &&
    input.ticketCounts !== undefined;

  if (shouldCheckCapacity) {
    const categoryCounts = input.categoryCounts!;
    const ticketCounts = input.ticketCounts!;
    const registrationCount = input.registrationCount!;

    if (category.capacity) {
      const existingCount = categoryCounts[category.id] ?? 0;
      if (existingCount >= category.capacity) {
        return {
          ok: false,
          outcome: "capacity_exceeded",
          message: `Not enough spots for "${category.title}". ${Math.max(category.capacity - existingCount, 0)} remaining.`
        };
      }
    }

    if (input.event.capacity && registrationCount >= input.event.capacity) {
      return {
        ok: false,
        outcome: "capacity_exceeded",
        message: `Not enough capacity. ${Math.max(input.event.capacity - registrationCount, 0)} spots remaining.`
      };
    }
  }

  const additionalTicket = resolveAdditionalTicketSelection(input.event, {
    selectedTicketId: input.selectedTicketId,
    selectedTicketTitle: input.selectedTicketTitle
  });

  if (input.selectedTicketId !== "general-admission" && !additionalTicket) {
    return {
      ok: false,
      outcome: input.invalidOutcome,
      message: "The selected additional category is not available."
    };
  }

  if (additionalTicket?.soldOut) {
    return {
      ok: false,
      outcome: input.invalidOutcome,
      message: `"${additionalTicket.title}" is no longer available.`
    };
  }

  if (shouldCheckCapacity && additionalTicket?.capacity) {
    const existingCount = input.ticketCounts![additionalTicket.id] ?? 0;
    if (existingCount >= additionalTicket.capacity) {
      return {
        ok: false,
        outcome: "capacity_exceeded",
        message: `Not enough spots for "${additionalTicket.title}". ${Math.max(additionalTicket.capacity - existingCount, 0)} remaining.`
      };
    }
  }

  return {
    ok: true,
    category,
    additionalTicket
  };
}

function generateVerificationCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function buildPendingRegistrationsInsertPayload(input: {
  event: EventRecord;
  registrationInput: RegistrationStartInput;
  metadata: RegistrationRequestMetadata;
  fullName: string;
  emailNormalized: string;
  verificationTokenHash: string;
  verificationExpiresAt: string;
  emailVerifiedAt?: string | null;
}) {
  const attendeesJson = input.registrationInput.attendees && input.registrationInput.attendees.length > 0
    ? input.registrationInput.attendees.map((attendee) => ({
        fullName: `${attendee.firstName} ${attendee.lastName}`.trim(),
        age: attendee.age,
        categoryId: attendee.categoryId,
        categoryTitle: attendee.categoryTitle,
        ticketOptionId: attendee.ticketOptionId || null,
        ticketOptionTitle: attendee.ticketOptionTitle || null,
        email: attendee.email || null
      }))
    : null;

  return {
    event_id: input.event.id,
    full_name: input.fullName,
    email_raw: input.registrationInput.email.trim(),
    email_normalized: input.emailNormalized,
    phone: input.registrationInput.phone ? normalizePhone(input.registrationInput.phone) : null,
    age: input.registrationInput.age ?? null,
    uae_resident: input.registrationInput.uaeResident ?? false,
    category_id: input.registrationInput.categoryId,
    category_title: input.registrationInput.categoryTitle,
    ticket_option_id: input.registrationInput.selectedTicketId === "general-admission" ? null : input.registrationInput.selectedTicketId,
    ticket_option_title: input.registrationInput.selectedTicketId === "general-admission" ? null : input.registrationInput.selectedTicketTitle,
    declaration_version: input.event.declaration_version,
    declaration_accepted: false,
    verification_token_hash: input.verificationTokenHash,
    verification_expires_at: input.verificationExpiresAt,
    email_verified_at: input.emailVerifiedAt ?? null,
    source_ip: input.metadata.ipAddress,
    user_agent: input.metadata.userAgent,
    attendees: attendeesJson
  };
}

function buildAttendeeTicketTitle(attendee: AttendeeInput) {
  const categoryTitle = attendee.categoryTitle || DEFAULT_CATEGORY.title;
  const bootcampTitle = attendee.ticketOptionTitle?.trim();
  if (bootcampTitle) {
    return `${categoryTitle} + ${bootcampTitle}`;
  }
  return categoryTitle;
}

async function queueConfirmationEmail(input: {
  registrationId: string;
  eventId: string;
  email: string;
  fullName: string;
  qrToken: string;
  manualCheckinCode: string;
  ticketTitle: string;
  bookingId?: string;
  attendees?: Array<{
    registrationId: string;
    fullName: string;
    qrToken: string;
    manualCheckinCode: string;
    categoryTitle: string;
    ticketTitle: string | null;
    email?: string;
  }>;
}) {
  await enqueueEmailJob("registration_confirmed", {
    registrationId: input.registrationId,
    eventId: input.eventId,
    email: input.email,
    fullName: input.fullName,
    qrToken: input.qrToken,
    manualCheckinCode: input.manualCheckinCode,
    ticketTitle: input.ticketTitle,
    bookingId: input.bookingId,
    attendees: input.attendees
  });
}

async function queueAttendeeConfirmationEmails(input: {
  eventId: string;
  primaryFullName: string;
  attendees: ConfirmedAttendee[];
}) {
  await Promise.all(
    input.attendees.flatMap((attendee) => {
      if (!attendee.email || isSyntheticEmail(attendee.email)) {
        return [];
      }

      return enqueueEmailJob("registration_confirmed", {
        registrationId: attendee.registrationId,
        eventId: input.eventId,
        email: attendee.email,
        fullName: attendee.fullName,
        qrToken: attendee.qrToken,
        manualCheckinCode: attendee.manualCheckinCode,
        ticketTitle: attendee.ticketTitle
          ? `${attendee.categoryTitle} + ${attendee.ticketTitle}`
          : attendee.categoryTitle,
        bookedBy: input.primaryFullName
      });
    })
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

  const fullName = input.fullName?.trim() || "";
  const attendeeCount = input.attendees?.length ?? 1;
  const emailNormalized = normalizeEmail(input.email);
  const supabase = createAdminSupabaseClient();

  // Soft dedup check — warn but don't block
  const existingRegistrationPromise = supabase
    .from("registrations")
    .select("id")
    .eq("event_id", input.eventId)
    .eq("email_normalized", emailNormalized)
    .limit(1)
    .maybeSingle();
  const reusableVerifiedPendingPromise = supabase
    .from("pending_registrations")
    .select("id, verification_expires_at, verified_at, email_verified_at")
    .eq("event_id", input.eventId)
    .eq("email_normalized", emailNormalized)
    .is("verified_at", null)
    .not("email_verified_at", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const [event, { count: registrationCount, ticketCounts, categoryCounts }, existingRegistrationResult, reusableVerifiedPendingResult] = await Promise.all([
    getEventById(input.eventId),
    getRegistrationSummaryForEvent(input.eventId),
    existingRegistrationPromise,
    reusableVerifiedPendingPromise
  ]);

  if (!event) {
    throw new Error("Event not found.");
  }

  if (existingRegistrationResult.error) {
    throw existingRegistrationResult.error;
  }

  if (reusableVerifiedPendingResult.error) {
    throw reusableVerifiedPendingResult.error;
  }

  let warning: string | undefined;
  if (existingRegistrationResult.data) {
    warning = "This email already has a registration for this event. You can still continue with a new booking.";
  }

  const registrationState = ensureRegistrationOpen(event, registrationCount, attendeeCount);

  if (!registrationState.allowed) {
    return {
      outcome: "registration_closed",
      message: registrationState.message
    };
  }

  // Per-bootcamp capacity check for the group
  if (input.attendees && input.attendees.length > 0) {
    const bootcampCounts: Record<string, number> = {};
    for (const attendee of input.attendees) {
      const tid = attendee.ticketOptionId?.trim();
      if (tid) {
        bootcampCounts[tid] = (bootcampCounts[tid] ?? 0) + 1;
      }
    }

    for (const [ticketId, requestedCount] of Object.entries(bootcampCounts)) {
      const ticketConfig = event.form_config?.ticketOptions?.find((t) => t.id === ticketId);
      if (ticketConfig?.capacity) {
        const existingCount = ticketCounts[ticketId] ?? 0;
        if (existingCount + requestedCount > ticketConfig.capacity) {
          return {
            outcome: "capacity_exceeded",
            message: `Not enough spots for "${ticketConfig.title}". ${Math.max(ticketConfig.capacity - existingCount, 0)} remaining.`
          };
        }
      }
      if (ticketConfig?.soldOut) {
        return {
          outcome: "invalid_ticket",
          message: `"${ticketConfig.title}" is no longer available.`
        };
      }
    }
  } else {
    const selection = validateSingleAttendeeSelection({
      event,
      categoryId: input.categoryId,
      categoryTitle: input.categoryTitle,
      selectedTicketId: input.selectedTicketId,
      selectedTicketTitle: input.selectedTicketTitle,
      categoryCounts,
      ticketCounts,
      registrationCount,
      invalidOutcome: "invalid_ticket"
    });

    if (!selection.ok) {
      return {
        outcome: selection.outcome,
        message: selection.message
      };
    }
  }

  if (reusableVerifiedPendingResult.data || existingRegistrationResult.data) {
    if (!reusableVerifiedPendingResult.data) {
      const emailVerifiedAt = new Date().toISOString();
      const verificationCode = generateVerificationCode();
      const verificationTokenHash = hashOpaqueToken(verificationCode);
      const verificationExpiresAt = new Date(Date.now() + VERIFICATION_TOKEN_TTL_MINUTES * 60 * 1000).toISOString();
      const { error: insertError } = await supabase.from("pending_registrations").insert(
        buildPendingRegistrationsInsertPayload({
          event,
          registrationInput: input,
          metadata,
          fullName,
          emailNormalized,
          verificationTokenHash,
          verificationExpiresAt,
          emailVerifiedAt
        })
      );

      if (insertError) {
        throw insertError;
      }
    }

    return {
      outcome: "already_verified",
      message: "Email already verified for this event.",
      warning
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

  const verificationCode = generateVerificationCode();
  const verificationTokenHash = hashOpaqueToken(verificationCode);
  const verificationExpiresAt = new Date(Date.now() + VERIFICATION_TOKEN_TTL_MINUTES * 60 * 1000).toISOString();

  const { error: insertError } = await supabase.from("pending_registrations").insert(
    buildPendingRegistrationsInsertPayload({
      event,
      registrationInput: input,
      metadata,
      fullName,
      emailNormalized,
      verificationTokenHash,
      verificationExpiresAt
    })
  );

  if (insertError) {
    throw insertError;
  }

  await executeEmailJob(
    "verify_email",
    {
      eventId: event.id,
      email: input.email.trim(),
      fullName
    },
    async (job) => {
      const mail = buildVerificationEmail({
        fullName,
        eventTitle: event.title,
        otpCode: verificationCode
      });

      await sendMail({
        to: input.email.trim(),
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        idempotencyKey: job.id
      });
    }
  );

  return {
    outcome: "pending_verification",
    message: "Verification code sent. Enter the 6-digit OTP to complete registration.",
    warning
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
    .select("id, verification_expires_at, verified_at, email_verified_at")
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

  if (pendingRegistration.email_verified_at) {
    return { valid: true, message: "Email already verified for this event." };
  }

  if (new Date(pendingRegistration.verification_expires_at).getTime() < Date.now()) {
    return { valid: false, message: "This verification code has expired. Request a new one." };
  }

  const { error: updateError } = await supabase
    .from("pending_registrations")
    .update({ email_verified_at: new Date().toISOString() })
    .eq("id", pendingRegistration.id);

  if (updateError) {
    throw updateError;
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
          : result.outcome === "already_verified"
            ? "This verification link has already been used."
            : "The verification link is invalid."
    };
  }

  await queueConfirmationEmail({
    registrationId: result.registration_id,
    eventId: result.event_id,
    email: result.email_raw,
    fullName: result.full_name,
    qrToken,
    manualCheckinCode: result.manual_checkin_code,
    ticketTitle: "General Admission"
  });

  return {
    outcome: "confirmed",
    message: "Registration confirmed. Your QR code has been sent by email.",
    registrationId: result.registration_id,
    eventId: result.event_id,
    manualCheckinCode: result.manual_checkin_code
  };
}

export async function confirmRegistrationFromOtp(
  input: RegistrationCompleteInput,
  metadata: RegistrationRequestMetadata
): Promise<RegistrationConfirmResult> {
  if (isDemoMode()) {
    const demoCodeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const demoAttendees: ConfirmedAttendee[] = (input.attendees ?? [{ firstName: "Demo", lastName: "User", age: 25, categoryId: DEFAULT_CATEGORY.id, categoryTitle: DEFAULT_CATEGORY.title }]).map((a, i) => ({
      registrationId: `demo-registration-${i}`,
      fullName: `${a.firstName} ${a.lastName}`.trim(),
      qrToken: `demo-${i}`,
      manualCheckinCode: [
        demoCodeAlphabet[i % demoCodeAlphabet.length],
        demoCodeAlphabet[(i + 5) % demoCodeAlphabet.length],
        demoCodeAlphabet[(i + 10) % demoCodeAlphabet.length],
        demoCodeAlphabet[(i + 15) % demoCodeAlphabet.length]
      ].join(""),
      categoryTitle: a.categoryTitle,
      ticketTitle: a.ticketOptionTitle || null,
      email: a.email || undefined
    }));

    return {
      outcome: input.otp === "123456" ? "confirmed" : "invalid",
      message:
        input.otp === "123456"
          ? "Demo mode: registration confirmed and QR delivery simulated."
          : "Demo mode: use OTP 123456 to preview a successful confirmation.",
      eventId: demoEvents[0]?.id,
      registrationId: "demo-registration-0",
      qrToken: "demo-0",
      manualCheckinCode: demoAttendees[0]?.manualCheckinCode,
      email: input.email,
      ticketTitle: input.selectedTicketTitle,
      bookingId: "demo-booking",
      attendees: input.otp === "123456" ? demoAttendees : undefined
    };
  }

  const emailNormalized = normalizeEmail(input.email);
  const supabase = createAdminSupabaseClient();
  const otp = input.otp?.trim();
  const verificationTokenHash = otp ? hashOpaqueToken(otp) : null;
  const pendingRegistrationPromise = otp
    ? supabase
      .from("pending_registrations")
      .select("id, verification_expires_at, verified_at, email_verified_at")
      .eq("event_id", input.eventId)
      .eq("email_normalized", emailNormalized)
      .eq("verification_token_hash", verificationTokenHash)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    : supabase
      .from("pending_registrations")
      .select("id, verification_expires_at, verified_at, email_verified_at")
      .eq("event_id", input.eventId)
      .eq("email_normalized", emailNormalized)
      .is("verified_at", null)
      .not("email_verified_at", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
  const [event, pendingRegistrationResult] = await Promise.all([getEventById(input.eventId), pendingRegistrationPromise]);

  if (!event) {
    throw new Error("Event not found.");
  }

  if (pendingRegistrationResult.error) {
    throw pendingRegistrationResult.error;
  }

  const pendingRegistration = pendingRegistrationResult.data;

  if (!pendingRegistration) {
    return {
      outcome: "invalid",
      message: otp
        ? "The verification code is invalid."
        : "Verify your email before completing registration."
    };
  }

  if (pendingRegistration.verified_at) {
    return {
      outcome: "already_verified",
      message: "This verification code has already been used."
    };
  }

  if (otp && new Date(pendingRegistration.verification_expires_at).getTime() < Date.now()) {
    return {
      outcome: "expired",
      message: "This verification code has expired. Request a new one to continue."
    };
  }

  const isGroupBooking = input.attendees && input.attendees.length > 1;

  if (isGroupBooking) {
    if (!verificationTokenHash) {
      return {
        outcome: "invalid",
        message: "Verify your email with the current code before completing a group booking."
      };
    }
    return confirmGroupRegistration(input, event, pendingRegistration.id, emailNormalized, verificationTokenHash, metadata, supabase);
  }

  return confirmSingleRegistration(input, event, pendingRegistration.id, emailNormalized, verificationTokenHash, metadata, supabase);
}

async function confirmSingleRegistration(
  input: RegistrationCompleteInput,
  event: EventRecord,
  pendingId: string,
  emailNormalized: string,
  verificationTokenHash: string | null,
  metadata: RegistrationRequestMetadata,
  supabase: ReturnType<typeof createAdminSupabaseClient>
): Promise<RegistrationConfirmResult> {
  const selection = validateSingleAttendeeSelection({
    event,
    categoryId: input.categoryId,
    categoryTitle: input.categoryTitle,
    selectedTicketId: input.selectedTicketId,
    selectedTicketTitle: input.selectedTicketTitle,
    invalidOutcome: "invalid"
  });

  if (!selection.ok) {
    return {
      outcome: selection.outcome,
      message: selection.message
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
      category_id: selection.category.id,
      category_title: selection.category.title,
      ticket_option_id: selection.additionalTicket?.id ?? null,
      ticket_option_title: selection.additionalTicket?.title ?? null,
      declaration_version: event.declaration_version,
      declaration_accepted: true,
      source_ip: metadata.ipAddress,
      user_agent: metadata.userAgent
    })
    .eq("id", pendingId);

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
          : result.outcome === "already_verified"
            ? "This verification code has already been used."
            : result.outcome === "capacity_exceeded"
              ? "The selected category or additional category is no longer available. Go back and choose again."
            : "The verification code is invalid."
    };
  }

  const ticketTitle = selection.additionalTicket
    ? `${selection.category.title} + ${selection.additionalTicket.title}`
    : selection.category.title;

  await queueConfirmationEmail({
    registrationId: result.registration_id,
    eventId: result.event_id,
    email: result.email_raw,
    fullName: result.full_name,
    qrToken,
    manualCheckinCode: result.manual_checkin_code,
    ticketTitle
  });

  return {
    outcome: "confirmed",
    message: "Registration confirmed. Your ticket QR code has been sent by email.",
    registrationId: result.registration_id,
    eventId: result.event_id,
    qrToken,
    manualCheckinCode: result.manual_checkin_code,
    email: result.email_raw,
    ticketTitle,
    attendees: [{
      registrationId: result.registration_id,
      fullName: result.full_name,
      qrToken,
      manualCheckinCode: result.manual_checkin_code,
      categoryTitle: selection.category.title,
      ticketTitle: selection.additionalTicket?.title ?? null,
      email: result.email_raw
    }]
  };
}

async function confirmGroupRegistration(
  input: RegistrationCompleteInput,
  event: EventRecord,
  pendingId: string,
  emailNormalized: string,
  verificationTokenHash: string,
  metadata: RegistrationRequestMetadata,
  supabase: ReturnType<typeof createAdminSupabaseClient>
): Promise<RegistrationConfirmResult> {
  const attendees = input.attendees!;

  // Build attendees JSONB with primary at index 0
  const attendeesJson = attendees.map((a, i) => ({
    fullName: i === 0 ? input.fullName.trim() : `${a.firstName} ${a.lastName}`.trim(),
    age: i === 0 ? input.age : a.age,
    categoryId: a.categoryId,
    categoryTitle: a.categoryTitle,
    ticketOptionId: a.ticketOptionId || null,
    ticketOptionTitle: a.ticketOptionTitle || null,
    email: i === 0 ? input.email.trim() : (a.email || null)
  }));

  // Update pending with final data
  const { error: updatePendingError } = await supabase
    .from("pending_registrations")
    .update({
      full_name: input.fullName.trim(),
      email_raw: input.email.trim(),
      email_normalized: emailNormalized,
      phone: normalizePhone(input.phone),
      age: input.age,
      uae_resident: input.uaeResident,
      category_id: attendees[0].categoryId,
      category_title: attendees[0].categoryTitle,
      ticket_option_id: attendees[0].ticketOptionId || null,
      ticket_option_title: attendees[0].ticketOptionTitle || null,
      declaration_version: event.declaration_version,
      declaration_accepted: true,
      source_ip: metadata.ipAddress,
      user_agent: metadata.userAgent,
      attendees: attendeesJson
    })
    .eq("id", pendingId);

  if (updatePendingError) {
    throw updatePendingError;
  }

  // Generate QR tokens for each attendee
  const qrTokens = attendees.map(() => generateOpaqueToken());
  const qrTokenHashes = qrTokens.map(hashOpaqueToken);

  const { data, error } = await supabase.rpc("confirm_pending_registration_group_by_otp", {
    p_event_id: input.eventId,
    p_email_normalized: emailNormalized,
    p_verification_code_hash: verificationTokenHash,
    p_qr_token_hashes: qrTokenHashes,
    p_attendees: attendeesJson
  });

  if (error) {
    throw error;
  }

  const results = Array.isArray(data) ? data : [];

  if (results.length === 0) {
    return {
      outcome: "invalid",
      message: "The verification code is invalid."
    };
  }

  // Check first row for non-confirmed outcomes
  const firstResult = results[0];
  if (firstResult.outcome !== "confirmed") {
    return {
      outcome: firstResult.outcome,
      message:
        firstResult.outcome === "expired"
          ? "This verification code has expired. Request a new one to continue."
          : firstResult.outcome === "already_verified"
            ? "This verification code has already been used."
            : firstResult.outcome === "capacity_exceeded"
              ? "Not enough capacity for this group size. Please reduce the number of attendees."
              : "The verification code is invalid."
    };
  }

  // Map results to confirmed attendees
  const confirmedAttendees: ConfirmedAttendee[] = results.map((row: Record<string, unknown>, i: number) => ({
    registrationId: row.registration_id as string,
    fullName: row.full_name as string,
    qrToken: qrTokens[i],
    manualCheckinCode: row.manual_checkin_code as string,
    categoryTitle: (row.category_title as string) ?? DEFAULT_CATEGORY.title,
    ticketTitle: (row.ticket_option_title as string) ?? null,
    email: isSyntheticEmail(row.email_raw as string) ? undefined : (row.email_raw as string)
  }));

  const primaryAttendee = confirmedAttendees[0];
  const primaryTicketTitle = primaryAttendee.ticketTitle
    ? `${primaryAttendee.categoryTitle} + ${primaryAttendee.ticketTitle}`
    : primaryAttendee.categoryTitle;

  // Queue primary's email with all attendees' tickets
  const additionalAttendees = confirmedAttendees.slice(1);
  const queueJobs: Array<Promise<unknown>> = [
    queueConfirmationEmail({
      registrationId: primaryAttendee.registrationId,
      eventId: input.eventId,
      email: input.email.trim(),
      fullName: input.fullName.trim(),
      qrToken: qrTokens[0],
      manualCheckinCode: primaryAttendee.manualCheckinCode,
      ticketTitle: primaryTicketTitle,
      bookingId: firstResult.booking_id as string,
      attendees: confirmedAttendees
    })
  ];

  if (additionalAttendees.length > 0) {
    queueJobs.push(
      queueAttendeeConfirmationEmails({
        eventId: input.eventId,
        primaryFullName: input.fullName.trim(),
        attendees: additionalAttendees
      })
    );
  }

  await Promise.all(queueJobs);

  return {
    outcome: "confirmed",
    message: `Registration confirmed for ${confirmedAttendees.length} attendees. Tickets have been sent by email.`,
    registrationId: primaryAttendee.registrationId,
    eventId: input.eventId,
    qrToken: qrTokens[0],
    manualCheckinCode: primaryAttendee.manualCheckinCode,
    email: input.email.trim(),
    ticketTitle: primaryTicketTitle,
    bookingId: firstResult.booking_id as string,
    attendees: confirmedAttendees
  };
}
