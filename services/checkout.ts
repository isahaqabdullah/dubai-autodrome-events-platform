import "server-only";
import { RATE_LIMIT_MAX_REQUESTS, RATE_LIMIT_WINDOW_SECONDS, VERIFICATION_TOKEN_TTL_MINUTES } from "@/lib/constants";
import { isDemoMode } from "@/lib/demo-mode";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import {
  deriveCheckoutQrToken,
  generateOpaqueToken,
  hashOpaqueToken,
  signCheckoutToken,
  verifyCheckoutToken
} from "@/lib/tokens";
import type {
  CheckoutPaymentResult,
  CheckoutSignedTokenPayload,
  CheckoutStartResult,
  CheckoutStatusResult,
  CheckoutOtpResult,
  ConfirmedCheckoutAttendee,
  EventCatalogOption
} from "@/lib/types";
import { normalizeEmail, normalizePhone, getRegistrationWindowState, isSyntheticEmail } from "@/lib/utils";
import type { CheckoutStartInput } from "@/lib/validation/checkout";
import { buildVerificationEmail } from "@/services/email-templates";
import { executeEmailJob } from "@/services/email-jobs";
import { getEventById } from "@/services/events";
import { sendMail } from "@/services/mailer";
import { getEventCatalog } from "@/services/catalog";
import {
  buildTicketAccessToken,
  buildTicketUrl,
  ensureAutomaticTicketDelivery,
  loadFulfilledTicketAttendees
} from "@/services/tickets";
import {
  createNgeniusOrder,
  getNgeniusOrder,
  getNgeniusOrderAmount,
  interpretNgeniusOrder
} from "@/services/ngenius";

const CHECKOUT_HOLD_MINUTES = 25;
const MAX_PAYMENT_ATTEMPTS = 5;
export const HOLD_EXPIRED_AFTER_PAYMENT_REASON = "Payment succeeded after the capacity hold expired.";

export interface CheckoutRequestMetadata {
  ipAddress: string | null;
  userAgent: string | null;
}

type Supabase = ReturnType<typeof createAdminSupabaseClient>;

type BookingRow = {
  id: string;
  event_id: string;
  public_reference: string;
  status: string;
  payer_email_raw: string;
  payer_email_normalized: string;
  payer_full_name: string;
  payer_phone: string | null;
  total_minor: number;
  currency_code: string;
  attempt_count: number;
  verification_token_hash: string | null;
  verification_expires_at: string | null;
  email_verified_at: string | null;
  manual_action_reason: string | null;
  ticket_access_nonce: string;
};

type AttendeeDraft = {
  firstName: string;
  lastName: string;
  fullName: string;
  email: string | null;
  emailNormalized: string | null;
  age: number | null;
  category: EventCatalogOption;
  addon: EventCatalogOption | null;
  isPrimary: boolean;
};

type CheckoutRateLimitResult = {
  allowed: boolean;
  request_count: number;
  retry_after_seconds: number;
};

type PreparedPaymentAttempt = {
  outcome: string;
  payment_attempt_id: string | null;
  attempt_number: number | null;
  merchant_order_reference: string | null;
  payment_href: string | null;
  held_until: string | null;
  message: string | null;
};

type CheckoutStatusPaymentAttempt = {
  id: string;
  booking_intent_id: string;
  status: string;
  ni_order_reference: string | null;
  amount_minor: number;
  currency_code: string;
};

function generateVerificationCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function buildPublicReference() {
  return `BI-${generateOpaqueToken(12).replace(/_/g, "-")}`;
}

function splitName(fullName: string) {
  const parts = fullName.trim().split(/\s+/);
  const firstName = parts[0] ?? fullName;
  const lastName = parts.length > 1 ? parts.slice(1).join(" ") : firstName;
  return { firstName, lastName };
}

function signForBooking(booking: Pick<BookingRow, "id" | "payer_email_normalized">) {
  return signCheckoutToken({
    bookingIntentId: booking.id,
    expiresInSeconds: 60 * 60
  });
}

function validateToken(token: string): CheckoutSignedTokenPayload {
  const payload = verifyCheckoutToken(token);
  if (!payload) {
    throw new Error("Invalid or expired checkout token.");
  }
  return payload;
}

async function checkCheckoutRateLimit(input: {
  supabase: Supabase;
  key: string;
  action: string;
  maxRequests?: number;
  windowSeconds?: number;
}) {
  const { data, error } = await input.supabase.rpc("check_checkout_rate_limit", {
    p_throttle_key: input.key,
    p_action: input.action,
    p_window_seconds: input.windowSeconds ?? RATE_LIMIT_WINDOW_SECONDS,
    p_max_requests: input.maxRequests ?? RATE_LIMIT_MAX_REQUESTS
  });

  if (error) {
    throw error;
  }

  const result = Array.isArray(data) ? data[0] : null;
  return result as CheckoutRateLimitResult | null;
}

function findCatalogOption(options: EventCatalogOption[], publicId: string) {
  return options.find((option) => option.publicId === publicId && option.active && !option.soldOut) ?? null;
}

function normalizeAttendeeDrafts(input: CheckoutStartInput, categories: EventCatalogOption[], addons: EventCatalogOption[]) {
  const primaryFullName = `${input.firstName} ${input.lastName}`.trim();
  const sourceAttendees = input.attendees?.length
    ? input.attendees
    : [{
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      age: input.age,
      categoryId: input.categoryId,
      addonId: input.addonId
    }];

  const attendees: AttendeeDraft[] = [];

  for (let index = 0; index < sourceAttendees.length; index++) {
    const attendee = sourceAttendees[index];
    const category = findCatalogOption(categories, attendee.categoryId);
    const addonId = attendee.addonId?.trim();
    const addon = addonId ? findCatalogOption(addons, addonId) : null;

    if (!category || (addonId && !addon)) {
      throw new Error("The selected category or add-on is no longer available.");
    }

    const isPrimary = index === 0;
    const firstName = isPrimary ? input.firstName : attendee.firstName || "";
    const lastName = isPrimary ? input.lastName : attendee.lastName || "";
    const fullName = isPrimary ? primaryFullName : `${firstName} ${lastName}`.trim();
    const email = isPrimary ? input.email : attendee.email?.trim() || null;

    attendees.push({
      firstName,
      lastName,
      fullName: fullName || primaryFullName,
      email,
      emailNormalized: email ? normalizeEmail(email) : null,
      age: isPrimary ? input.age ?? null : attendee.age ?? null,
      category,
      addon,
      isPrimary
    });
  }

  return attendees;
}

async function insertBooking(input: {
  supabase: Supabase;
  checkoutInput: CheckoutStartInput;
  attendees: AttendeeDraft[];
  event: { id: string; declaration_version: number };
  verificationCode: string;
  metadata: CheckoutRequestMetadata;
}) {
  const verificationExpiresAt = new Date(Date.now() + VERIFICATION_TOKEN_TTL_MINUTES * 60 * 1000).toISOString();
  const totalMinor = input.attendees.reduce((sum, attendee) => {
    return sum + attendee.category.priceMinor + (attendee.addon?.priceMinor ?? 0);
  }, 0);
  const currencyCode = input.attendees.find((attendee) => attendee.category.currencyCode)?.category.currencyCode ?? "AED";
  const primary = input.attendees[0];

  const { data: booking, error: bookingError } = await input.supabase
    .from("booking_intents")
    .insert({
      event_id: input.event.id,
      public_reference: buildPublicReference(),
      status: "otp_sent",
      payer_email_raw: input.checkoutInput.email.trim(),
      payer_email_normalized: normalizeEmail(input.checkoutInput.email),
      payer_full_name: primary.fullName,
      payer_phone: normalizePhone(input.checkoutInput.phone),
      payer_age: input.checkoutInput.age ?? null,
      payer_uae_resident: input.checkoutInput.uaeResident ?? false,
      declaration_version: input.event.declaration_version,
      verification_token_hash: hashOpaqueToken(input.verificationCode),
      verification_expires_at: verificationExpiresAt,
      total_minor: totalMinor,
      currency_code: currencyCode,
      source_ip: input.metadata.ipAddress,
      user_agent: input.metadata.userAgent
    })
    .select("*")
    .single();

  if (bookingError || !booking) {
    throw bookingError ?? new Error("Unable to create booking intent.");
  }

  const attendeeRows = input.attendees.map((attendee, index) => ({
    booking_intent_id: booking.id,
    attendee_index: index,
    full_name: attendee.fullName,
    email_raw: attendee.email,
    email_normalized: attendee.emailNormalized,
    phone: index === 0 ? normalizePhone(input.checkoutInput.phone) : null,
    age: attendee.age,
    uae_resident: index === 0 ? input.checkoutInput.uaeResident ?? false : false,
    is_primary: attendee.isPrimary
  }));

  const { data: insertedAttendees, error: attendeeError } = await input.supabase
    .from("booking_attendees")
    .insert(attendeeRows)
    .select("*")
    .order("attendee_index", { ascending: true });

  if (attendeeError || !insertedAttendees) {
    throw attendeeError ?? new Error("Unable to create booking attendees.");
  }

  const itemRows = input.attendees.flatMap((attendee, index) => {
    const attendeeId = insertedAttendees[index].id as string;
    const rows = [{
      booking_intent_id: booking.id,
      attendee_id: attendeeId,
      item_type: "category",
      event_category_id: attendee.category.id,
      public_id: attendee.category.publicId,
      title: attendee.category.title,
      description: attendee.category.description,
      quantity: 1,
      unit_price_minor: attendee.category.priceMinor,
      total_price_minor: attendee.category.priceMinor,
      currency_code: attendee.category.currencyCode,
      sort_order: index * 2
    }];

    if (attendee.addon) {
      rows.push({
        booking_intent_id: booking.id,
        attendee_id: attendeeId,
        item_type: "addon",
        event_addon_id: attendee.addon.id,
        public_id: attendee.addon.publicId,
        title: attendee.addon.title,
        description: attendee.addon.description,
        quantity: 1,
        unit_price_minor: attendee.addon.priceMinor,
        total_price_minor: attendee.addon.priceMinor,
        currency_code: attendee.addon.currencyCode,
        sort_order: index * 2 + 1
      } as typeof rows[number] & { event_addon_id: string });
    }

    return rows;
  });

  const { error: itemError } = await input.supabase.from("booking_intent_items").insert(itemRows);
  if (itemError) {
    throw itemError;
  }

  return booking as BookingRow;
}

export async function startCheckout(
  input: CheckoutStartInput,
  metadata: CheckoutRequestMetadata
): Promise<CheckoutStartResult> {
  if (isDemoMode() || input.website) {
    return {
      outcome: "otp_sent",
      message: "Verification code sent. Enter the 6-digit OTP to continue.",
      totalMinor: 0,
      currencyCode: "AED"
    };
  }

  const supabase = createAdminSupabaseClient();
  const rateLimit = await checkCheckoutRateLimit({
    supabase,
    key: `${metadata.ipAddress ?? "unknown"}:${input.eventId}`,
    action: "checkout_start"
  });
  if (!rateLimit?.allowed) {
    return {
      outcome: "rate_limited",
      message: `Too many attempts. Please wait ${rateLimit?.retry_after_seconds ?? 60} seconds before trying again.`
    };
  }

  const event = await getEventById(input.eventId);
  if (!event) {
    throw new Error("Event not found.");
  }

  const windowState = getRegistrationWindowState(event);
  if (windowState.state !== "open") {
    return { outcome: "registration_closed", message: windowState.label };
  }

  const catalog = await getEventCatalog(event);
  let attendees: AttendeeDraft[];
  try {
    attendees = normalizeAttendeeDrafts(input, catalog.categories, catalog.addons);
  } catch (error) {
    return {
      outcome: "invalid_selection",
      message: error instanceof Error ? error.message : "The selected category or add-on is no longer available."
    };
  }

  const verificationCode = generateVerificationCode();
  const booking = await insertBooking({ supabase, checkoutInput: input, attendees, event, verificationCode, metadata });

  await executeEmailJob("verify_email", {
    bookingIntentId: booking.id,
    eventId: event.id,
    email: input.email.trim(),
    fullName: booking.payer_full_name
  }, async (job) => {
    const mail = buildVerificationEmail({
      fullName: booking.payer_full_name,
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
  });

  return {
    outcome: "otp_sent",
    message: "Verification code sent. Enter the 6-digit OTP to continue.",
    bookingIntentId: booking.id,
    checkoutToken: signForBooking(booking),
    totalMinor: booking.total_minor,
    currencyCode: booking.currency_code
  };
}

async function getBookingByToken(supabase: Supabase, token: string) {
  const payload = validateToken(token);
  let query = supabase
    .from("booking_intents")
    .select("*")
    .eq("id", payload.bookingIntentId);

  if (payload.email) {
    query = query.eq("payer_email_normalized", payload.email);
  }

  const { data, error } = await query.single();

  if (error || !data) {
    throw error ?? new Error("Booking not found.");
  }

  return data as BookingRow;
}

async function reserveCapacity(supabase: Supabase, bookingIntentId: string) {
  const { data, error } = await supabase.rpc("reserve_booking_capacity", {
    p_booking_intent_id: bookingIntentId,
    p_hold_minutes: CHECKOUT_HOLD_MINUTES
  });

  if (error) {
    throw error;
  }

  const result = Array.isArray(data) ? data[0] : null;
  return result as { outcome: string; held_until: string | null; message: string } | null;
}

async function preparePaymentAttempt(supabase: Supabase, bookingIntentId: string) {
  const { data, error } = await supabase.rpc("prepare_checkout_payment_attempt", {
    p_booking_intent_id: bookingIntentId,
    p_hold_minutes: CHECKOUT_HOLD_MINUTES,
    p_max_attempts: MAX_PAYMENT_ATTEMPTS
  });

  if (error) {
    throw error;
  }

  const result = Array.isArray(data) ? data[0] : null;
  return result as PreparedPaymentAttempt | null;
}

async function loadBookingAttendees(supabase: Supabase, bookingIntentId: string) {
  const { data, error } = await supabase
    .from("booking_attendees")
    .select("*")
    .eq("booking_intent_id", bookingIntentId)
    .order("attendee_index", { ascending: true });

  if (error) {
    throw error;
  }

  return data ?? [];
}

async function fulfillBooking(input: {
  supabase: Supabase;
  booking: BookingRow;
  paymentAttemptId: string | null;
}): Promise<{ outcome: string; attendees: ConfirmedCheckoutAttendee[]; message: string }> {
  const attendeeRows = await loadBookingAttendees(input.supabase, input.booking.id);
  const qrTokens = attendeeRows.map((row) => deriveCheckoutQrToken({
    bookingIntentId: input.booking.id,
    paymentAttemptId: input.paymentAttemptId,
    attendeeIndex: row.attendee_index as number
  }));
  const qrTokenHashes = qrTokens.map(hashOpaqueToken);

  const { data, error } = await input.supabase.rpc("fulfill_booking_intent", {
    p_booking_intent_id: input.booking.id,
    p_payment_attempt_id: input.paymentAttemptId,
    p_qr_token_hashes: qrTokenHashes
  });

  if (error) {
    throw error;
  }

  const rows = Array.isArray(data) ? data : [];
  const firstOutcome = (rows[0]?.outcome as string | undefined) ?? "invalid";

  if (!["fulfilled", "already_fulfilled", "manual_action_required"].includes(firstOutcome)) {
    throw new Error(`Unable to fulfill booking: ${firstOutcome}`);
  }

  if (firstOutcome === "manual_action_required") {
    return {
      outcome: firstOutcome,
      attendees: [],
      message: "Payment was received, but the tickets need manual review before issuance."
    };
  }

  if (firstOutcome === "already_fulfilled") {
    const attendees = await loadFulfilledTicketAttendees(input.supabase, input.booking);
    if (attendees.length > 0) {
      await ensureAutomaticTicketDelivery(input.supabase, input.booking.id);
    }
    return {
      outcome: firstOutcome,
      attendees,
      message: "Registration confirmed. Your tickets are ready and we are emailing a copy."
    };
  }

  const attendees: ConfirmedCheckoutAttendee[] = rows
    .filter((row: Record<string, unknown>) => row.registration_id)
    .map((row: Record<string, unknown>) => {
      const attendeeIndex = row.attendee_index as number;
      return {
        registrationId: row.registration_id as string,
        fullName: row.full_name as string,
        qrToken: qrTokens[attendeeIndex] ?? deriveCheckoutQrToken({
          bookingIntentId: input.booking.id,
          paymentAttemptId: input.paymentAttemptId,
          attendeeIndex
        }),
        manualCheckinCode: row.manual_checkin_code as string,
        categoryTitle: row.category_title as string,
        ticketTitle: (row.ticket_option_title as string | null) ?? null,
        email: isSyntheticEmail(row.email_raw as string) ? undefined : row.email_raw as string
      };
    });

  if (["fulfilled", "already_fulfilled"].includes(firstOutcome) && attendees.length > 0) {
    await ensureAutomaticTicketDelivery(input.supabase, input.booking.id);
  }

  return {
    outcome: firstOutcome,
    attendees,
    message: "Registration confirmed. Your tickets are ready and we are emailing a copy."
  };
}

function ticketLinkForBooking(booking: Pick<BookingRow, "id"> & { ticket_access_nonce?: string | null }) {
  const nonce = booking.ticket_access_nonce;
  if (!nonce) {
    return {};
  }
  const ticketToken = buildTicketAccessToken({ id: booking.id, ticket_access_nonce: nonce });
  return {
    ticketToken,
    ticketUrl: buildTicketUrl(ticketToken)
  };
}

export async function verifyCheckoutOtp(input: {
  checkoutToken: string;
  otp: string;
  metadata?: CheckoutRequestMetadata;
}): Promise<CheckoutOtpResult> {
  if (isDemoMode()) {
    return {
      outcome: input.otp === "123456" ? "email_verified" : "invalid",
      message: input.otp === "123456" ? "Email verified." : "Invalid verification code."
    };
  }

  const supabase = createAdminSupabaseClient();
  const booking = await getBookingByToken(supabase, input.checkoutToken);

  if (booking.status === "fulfilled") {
    const status = await getCheckoutStatus(input.checkoutToken);
    return {
      outcome: "fulfilled",
      message: status.message,
      attendees: status.attendees,
      bookingIntentId: booking.id,
      checkoutToken: signForBooking(booking),
      ticketToken: status.ticketToken,
      ticketUrl: status.ticketUrl,
      totalMinor: booking.total_minor,
      currencyCode: booking.currency_code
    };
  }

  const bookingAttemptLimit = await checkCheckoutRateLimit({
    supabase,
    key: booking.id,
    action: "checkout_verify_otp_booking",
    maxRequests: 10,
    windowSeconds: VERIFICATION_TOKEN_TTL_MINUTES * 60
  });
  const ipAttemptLimit = await checkCheckoutRateLimit({
    supabase,
    key: `${input.metadata?.ipAddress ?? "unknown"}:${booking.id}`,
    action: "checkout_verify_otp_ip",
    maxRequests: 6,
    windowSeconds: RATE_LIMIT_WINDOW_SECONDS
  });

  if (!bookingAttemptLimit?.allowed || !ipAttemptLimit?.allowed) {
    return {
      outcome: "rate_limited",
      message: `Too many verification attempts. Please wait ${Math.max(
        bookingAttemptLimit?.retry_after_seconds ?? 0,
        ipAttemptLimit?.retry_after_seconds ?? 0,
        60
      )} seconds before trying again.`
    };
  }

  if (!booking.verification_token_hash || hashOpaqueToken(input.otp) !== booking.verification_token_hash) {
    return { outcome: "invalid", message: "The verification code is invalid." };
  }

  if (booking.verification_expires_at && new Date(booking.verification_expires_at).getTime() < Date.now()) {
    return { outcome: "expired", message: "This verification code has expired. Start again to receive a new one." };
  }

  const { error: updateError } = await supabase
    .from("booking_intents")
    .update({
      status: "email_verified",
      email_verified_at: new Date().toISOString()
    })
    .eq("id", booking.id);

  if (updateError) {
    throw updateError;
  }

  return {
    outcome: "email_verified",
    message: booking.total_minor > 0 ? "Email verified. Continue to secure payment." : "Email verified. Complete your registration.",
    bookingIntentId: booking.id,
    checkoutToken: signForBooking(booking),
    totalMinor: booking.total_minor,
    currencyCode: booking.currency_code
  };
}

export async function createCheckoutPayment(checkoutToken: string): Promise<CheckoutPaymentResult> {
  const supabase = createAdminSupabaseClient();
  const booking = await getBookingByToken(supabase, checkoutToken);
  const event = await getEventById(booking.event_id);

  if (!event) {
    throw new Error("Event not found.");
  }

  const windowState = getRegistrationWindowState(event);
  if (windowState.state !== "open") {
    return { outcome: "invalid", message: windowState.label };
  }

  if (booking.status === "fulfilled") {
    const status = await getCheckoutStatus(checkoutToken);
    return {
      outcome: "fulfilled",
      message: status.message,
      attendees: status.attendees,
      bookingIntentId: booking.id,
      checkoutToken: signForBooking(booking),
      ticketToken: status.ticketToken,
      ticketUrl: status.ticketUrl
    };
  }

  if (booking.status === "paid") {
    const { data: latestAttempt, error: attemptError } = await supabase
      .from("payment_attempts")
      .select("id, status")
      .eq("booking_intent_id", booking.id)
      .order("attempt_number", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (attemptError) {
      throw attemptError;
    }

    if (!latestAttempt?.id) {
      return {
        outcome: "payment_pending",
        message: "Payment is confirmed. We are preparing your tickets.",
        bookingIntentId: booking.id,
        checkoutToken: signForBooking(booking)
      };
    }

    const fulfilled = await fulfillPaidBookingFromWorker({
      bookingIntentId: booking.id,
      paymentAttemptId: latestAttempt.id as string
    });

    return {
      outcome: fulfilled.outcome === "manual_action_required" ? "manual_action_required" : "fulfilled",
      message: fulfilled.message,
      attendees: fulfilled.attendees,
      bookingIntentId: booking.id,
      paymentAttemptId: latestAttempt.id as string,
      checkoutToken: signForBooking(booking),
      ...(fulfilled.attendees.length > 0 ? ticketLinkForBooking(booking) : {})
    };
  }

  const rateLimit = await checkCheckoutRateLimit({
    supabase,
    key: booking.id,
    action: "checkout_create_payment",
    maxRequests: 10
  });

  if (!rateLimit?.allowed) {
    return {
      outcome: "rate_limited",
      message: `Too many payment requests. Please wait ${rateLimit?.retry_after_seconds ?? 60} seconds before trying again.`
    };
  }

  if (!["email_verified", "payment_failed", "payment_pending"].includes(booking.status)) {
    return { outcome: "invalid", message: "This booking is not ready for payment." };
  }

  if (booking.total_minor === 0) {
    await supabase.from("booking_intents").update({
      declaration_accepted_at: new Date().toISOString()
    }).eq("id", booking.id);
    const reservation = await reserveCapacity(supabase, booking.id);
    if (!reservation || reservation.outcome !== "reserved") {
      return {
        outcome: reservation?.outcome === "capacity_exceeded" ? "capacity_exceeded" : "manual_action_required",
        message: reservation?.message ?? "Unable to reserve capacity."
      };
    }
    const fulfilled = await fulfillBooking({ supabase, booking, paymentAttemptId: null });
    return {
      outcome: "fulfilled",
      message: fulfilled.message,
      attendees: fulfilled.attendees,
      bookingIntentId: booking.id,
      checkoutToken: signForBooking(booking),
      ...ticketLinkForBooking(booking)
    };
  }

  const preparedAttempt = await preparePaymentAttempt(supabase, booking.id);
  if (!preparedAttempt) {
    return { outcome: "manual_action_required", message: "Unable to prepare payment attempt." };
  }

  if (preparedAttempt.outcome === "existing_payment" && preparedAttempt.payment_attempt_id && preparedAttempt.payment_href) {
    return {
      outcome: "redirect",
      message: "Redirecting to secure payment.",
      bookingIntentId: booking.id,
      paymentAttemptId: preparedAttempt.payment_attempt_id,
      paymentUrl: preparedAttempt.payment_href,
      checkoutToken: signForBooking(booking)
    };
  }

  if (preparedAttempt.outcome === "order_create_pending") {
    return {
      outcome: "payment_pending",
      message: preparedAttempt.message ?? "Payment is being prepared. Try again in a moment.",
      bookingIntentId: booking.id,
      paymentAttemptId: preparedAttempt.payment_attempt_id ?? undefined,
      checkoutToken: signForBooking(booking)
    };
  }

  if (preparedAttempt.outcome !== "prepared") {
    return {
      outcome:
        preparedAttempt.outcome === "capacity_exceeded"
          ? "capacity_exceeded"
          : preparedAttempt.outcome === "attempt_limit_exceeded"
            ? "attempt_limit_exceeded"
            : "manual_action_required",
      message: preparedAttempt.message ?? "Unable to reserve capacity."
    };
  }

  if (!preparedAttempt.payment_attempt_id || !preparedAttempt.merchant_order_reference) {
    return { outcome: "manual_action_required", message: "Payment attempt was not prepared correctly." };
  }

  const { data: itemRows, error: itemError } = await supabase
    .from("booking_intent_items")
    .select("title, quantity, total_price_minor")
    .eq("booking_intent_id", booking.id)
    .order("sort_order", { ascending: true });

  if (itemError) {
    throw itemError;
  }

  const { firstName, lastName } = splitName(booking.payer_full_name);

  try {
    const order = await createNgeniusOrder({
      bookingIntentId: booking.id,
      paymentAttemptId: preparedAttempt.payment_attempt_id,
      eventId: booking.event_id,
      merchantOrderReference: preparedAttempt.merchant_order_reference,
      amountMinor: booking.total_minor,
      currencyCode: booking.currency_code,
      emailAddress: booking.payer_email_raw,
      firstName,
      lastName,
      checkoutToken,
      items: (itemRows ?? []).map((item: Record<string, unknown>) => ({
        name: item.title as string,
        quantity: item.quantity as number,
        amountMinor: item.total_price_minor as number
      }))
    });

    const { error: updateAttemptError } = await supabase.from("payment_attempts").update({
      status: "payment_pending",
      ni_order_reference: order.orderReference,
      payment_href: order.paymentHref,
      raw_order_response: order.raw
    }).eq("id", preparedAttempt.payment_attempt_id);

    if (updateAttemptError) {
      throw updateAttemptError;
    }

    return {
      outcome: "redirect",
      message: "Redirecting to secure payment.",
      bookingIntentId: booking.id,
      paymentAttemptId: preparedAttempt.payment_attempt_id,
      paymentUrl: order.paymentHref,
      checkoutToken: signForBooking(booking)
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create N-Genius order.";
    await supabase.from("payment_attempts").update({
      status: "manual_action_required",
      last_error: message
    }).eq("id", preparedAttempt.payment_attempt_id);
    await supabase.from("booking_intents").update({
      status: "manual_action_required",
      manual_action_reason: message
    }).eq("id", booking.id);
    return { outcome: "configuration_error", message };
  }
}

export async function getCheckoutStatus(checkoutToken: string): Promise<CheckoutStatusResult> {
  const supabase = createAdminSupabaseClient();
  const booking = await getBookingByToken(supabase, checkoutToken);
  const { data: attempt } = await supabase
    .from("payment_attempts")
    .select("id, booking_intent_id, status, ni_order_reference, amount_minor, currency_code")
    .eq("booking_intent_id", booking.id)
    .order("attempt_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  const statusReconcileLimit = await checkCheckoutRateLimit({
    supabase,
    key: booking.id,
    action: "checkout_status_reconcile",
    maxRequests: 15,
    windowSeconds: RATE_LIMIT_WINDOW_SECONDS
  });

  const refreshed = statusReconcileLimit?.allowed
    ? await reconcileCheckoutReturnAttempt({
        supabase,
        booking,
        attempt: attempt as CheckoutStatusPaymentAttempt | null
      })
    : {
        booking,
        attempt: attempt as CheckoutStatusPaymentAttempt | null
      };
  const currentBooking = refreshed.booking;
  const currentAttempt = refreshed.attempt;

  if (currentBooking.status === "fulfilled") {
    await ensureAutomaticTicketDelivery(supabase, currentBooking.id);
    return buildFulfilledCheckoutStatus(supabase, currentBooking, currentAttempt);
  }

  const canRecoverIssuedTickets =
    currentBooking.status === "paid" ||
    currentAttempt?.status === "paid" ||
    (currentBooking.status === "manual_action_required" &&
      currentBooking.manual_action_reason === HOLD_EXPIRED_AFTER_PAYMENT_REASON);

  if (canRecoverIssuedTickets) {
    const attendees = await loadFulfilledTicketAttendees(supabase, currentBooking);
    if (attendees.length > 0) {
      await markBookingFulfilledAfterTicketIssue({
        supabase,
        bookingIntentId: currentBooking.id,
        paymentAttemptId: currentAttempt?.id,
        recoverManualHoldExpired: currentBooking.status === "manual_action_required"
      });
      await ensureAutomaticTicketDelivery(supabase, currentBooking.id);
      return buildFulfilledCheckoutStatus(supabase, { ...currentBooking, status: "fulfilled" }, currentAttempt, attendees);
    }
  }

  if (currentAttempt?.status === "paid" && currentBooking.total_minor > 0) {
    await ensurePaymentFulfillmentJob({
      supabase,
      bookingIntentId: currentBooking.id,
      paymentAttemptId: currentAttempt.id
    });
    return {
      status: "paid",
      message: "Payment is confirmed. We are preparing your tickets.",
      bookingIntentId: currentBooking.id,
      paymentAttemptId: currentAttempt.id,
      paymentAttemptStatus: currentAttempt.status as CheckoutStatusResult["paymentAttemptStatus"]
    };
  }

  return {
    status: currentBooking.status as CheckoutStatusResult["status"],
    message:
      currentBooking.status === "manual_action_required"
        ? "Payment needs manual review before ticket issuance."
        : currentBooking.status === "payment_failed"
          ? "Payment failed. You can try again."
          : "Payment is still processing.",
    bookingIntentId: currentBooking.id,
    paymentAttemptId: currentAttempt?.id,
    paymentAttemptStatus: currentAttempt?.status as CheckoutStatusResult["paymentAttemptStatus"]
  };
}

async function buildFulfilledCheckoutStatus(
  supabase: Supabase,
  booking: BookingRow,
  attempt: CheckoutStatusPaymentAttempt | null,
  knownAttendees?: ConfirmedCheckoutAttendee[]
): Promise<CheckoutStatusResult> {
  const [attendees, event] = await Promise.all([
    knownAttendees ? Promise.resolve(knownAttendees) : loadFulfilledTicketAttendees(supabase, booking),
    getEventById(booking.event_id)
  ]);

  return {
    status: "fulfilled",
    message: "Registration confirmed.",
    bookingIntentId: booking.id,
    paymentAttemptId: attempt?.id,
    paymentAttemptStatus: attempt?.status as CheckoutStatusResult["paymentAttemptStatus"],
    event: event
      ? {
          title: event.title,
          venue: event.venue,
          start_at: event.start_at,
          end_at: event.end_at,
          timezone: event.timezone,
          form_config: event.form_config
        }
      : undefined,
    attendees,
    ...ticketLinkForBooking(booking)
  };
}

export async function buildFulfilledCheckoutStatusForBooking(input: {
  bookingIntentId: string;
  paymentAttemptId?: string | null;
  attendees: ConfirmedCheckoutAttendee[];
}): Promise<CheckoutStatusResult> {
  const supabase = createAdminSupabaseClient();
  const [{ data: booking, error: bookingError }, { data: attempt, error: attemptError }] = await Promise.all([
    supabase.from("booking_intents").select("*").eq("id", input.bookingIntentId).single(),
    input.paymentAttemptId
      ? supabase
          .from("payment_attempts")
          .select("id, booking_intent_id, status, ni_order_reference, amount_minor, currency_code")
          .eq("id", input.paymentAttemptId)
          .single()
      : Promise.resolve({ data: null, error: null })
  ]);

  if (bookingError || !booking) {
    throw bookingError ?? new Error("Booking not found.");
  }

  if (attemptError) {
    throw attemptError;
  }

  return buildFulfilledCheckoutStatus(
    supabase,
    { ...(booking as BookingRow), status: "fulfilled" },
    attempt as CheckoutStatusPaymentAttempt | null,
    input.attendees
  );
}

export async function claimCheckoutStatusSideEffect(input: {
  bookingIntentId: string;
  action: string;
  maxRequests?: number;
  windowSeconds?: number;
}) {
  const supabase = createAdminSupabaseClient();
  const result = await checkCheckoutRateLimit({
    supabase,
    key: input.bookingIntentId,
    action: input.action,
    maxRequests: input.maxRequests ?? 5,
    windowSeconds: input.windowSeconds ?? RATE_LIMIT_WINDOW_SECONDS
  });
  return Boolean(result?.allowed);
}

async function markPaymentJobsDone(
  supabase: Supabase,
  paymentAttemptId: string | null | undefined
) {
  if (!paymentAttemptId) {
    return;
  }

  await supabase
    .from("payment_jobs")
    .update({ status: "done", locked_at: null, last_error: null })
    .eq("payment_attempt_id", paymentAttemptId)
    .in("status", ["queued", "processing"]);
}

async function markBookingFulfilledAfterTicketIssue(input: {
  supabase: Supabase;
  bookingIntentId: string;
  paymentAttemptId?: string | null;
  recoverManualHoldExpired?: boolean;
}) {
  if (input.recoverManualHoldExpired) {
    const { error: manualBookingError } = await input.supabase
      .from("booking_intents")
      .update({ status: "fulfilled", manual_action_reason: null })
      .eq("id", input.bookingIntentId)
      .eq("status", "manual_action_required")
      .eq("manual_action_reason", HOLD_EXPIRED_AFTER_PAYMENT_REASON);

    if (manualBookingError) {
      throw manualBookingError;
    }

    if (input.paymentAttemptId) {
      const { error: manualAttemptError } = await input.supabase
        .from("payment_attempts")
        .update({ status: "paid", last_error: null })
        .eq("id", input.paymentAttemptId)
        .eq("status", "manual_action_required")
        .eq("last_error", HOLD_EXPIRED_AFTER_PAYMENT_REASON);

      if (manualAttemptError) {
        throw manualAttemptError;
      }
    }
  }

  const { error: bookingError } = await input.supabase
    .from("booking_intents")
    .update({ status: "fulfilled", manual_action_reason: null })
    .eq("id", input.bookingIntentId)
    .in("status", ["paid", "fulfilled"]);

  if (bookingError) {
    throw bookingError;
  }

  await markPaymentJobsDone(input.supabase, input.paymentAttemptId);
}

async function reconcileCheckoutReturnAttempt(input: {
  supabase: Supabase;
  booking: BookingRow;
  attempt: CheckoutStatusPaymentAttempt | null;
}): Promise<{ booking: BookingRow; attempt: CheckoutStatusPaymentAttempt | null }> {
  if (
    input.booking.total_minor <= 0 ||
    input.booking.status === "fulfilled" ||
    !input.attempt?.ni_order_reference ||
    !["order_create_pending", "payment_pending", "paid", "manual_action_required"].includes(input.attempt.status)
  ) {
    return { booking: input.booking, attempt: input.attempt };
  }

  if (input.booking.status === "paid" && input.attempt.status === "paid") {
    await ensurePaymentFulfillmentJob({
      supabase: input.supabase,
      bookingIntentId: input.booking.id,
      paymentAttemptId: input.attempt.id
    });
    return { booking: input.booking, attempt: input.attempt };
  }

  try {
    const order = await getNgeniusOrder(input.attempt.ni_order_reference);
    const state = interpretNgeniusOrder(order);
    const amount = getNgeniusOrderAmount(order);

    await input.supabase
      .from("payment_attempts")
      .update({ last_order_status: order })
      .eq("id", input.attempt.id);

    if (amount.value !== input.attempt.amount_minor || amount.currencyCode !== input.attempt.currency_code) {
      const reason = "N-Genius amount or currency did not match the local booking.";
      await input.supabase.from("payment_attempts").update({
        status: "manual_action_required",
        last_error: reason
      }).eq("id", input.attempt.id);
      await input.supabase.from("booking_intents").update({
        status: "manual_action_required",
        manual_action_reason: reason
      }).eq("id", input.booking.id);
    } else if (state.kind === "paid") {
      const expiredHold = await markExpiredHoldAsManualAction({
        supabase: input.supabase,
        bookingIntentId: input.booking.id,
        paymentAttemptId: input.attempt.id
      });
      if (expiredHold) {
        return reloadCheckoutStatusRows(input.supabase, input.booking, input.attempt);
      }

      await input.supabase.from("payment_attempts").update({
        status: "paid",
        last_error: null
      }).eq("id", input.attempt.id);
      await input.supabase.from("booking_intents").update({
        status: "paid",
        manual_action_reason: null
      }).eq("id", input.booking.id);
      await ensurePaymentFulfillmentJob({
        supabase: input.supabase,
        bookingIntentId: input.booking.id,
        paymentAttemptId: input.attempt.id
      });
    } else if (state.kind === "failed" || state.kind === "cancelled") {
      await input.supabase.from("payment_attempts").update({
        status: state.kind === "cancelled" ? "cancelled" : "failed",
        last_error: state.state ? `N-Genius state: ${state.state}` : null
      }).eq("id", input.attempt.id);
      await input.supabase.from("booking_intents").update({
        status: "payment_failed"
      }).eq("id", input.booking.id);
    } else if (state.kind === "manual_review") {
      const reason = state.state ? `N-Genius manual review state: ${state.state}` : "N-Genius state requires manual review.";
      await input.supabase.from("payment_attempts").update({
        status: "manual_action_required",
        last_error: reason
      }).eq("id", input.attempt.id);
      await input.supabase.from("booking_intents").update({
        status: "manual_action_required",
        manual_action_reason: reason
      }).eq("id", input.booking.id);
    }
  } catch (error) {
    console.error("[checkout/status] on-demand reconcile failed", error);
  }

  return reloadCheckoutStatusRows(input.supabase, input.booking, input.attempt);
}

async function ensurePaymentFulfillmentJob(input: {
  supabase: Supabase;
  bookingIntentId: string;
  paymentAttemptId: string;
}) {
  const { data, error } = await input.supabase
    .from("payment_jobs")
    .select("id")
    .eq("payment_attempt_id", input.paymentAttemptId)
    .in("status", ["queued", "processing", "done"])
    .limit(1);

  if (error) {
    throw error;
  }

  if (data?.length) {
    return;
  }

  const { error: insertError } = await input.supabase.from("payment_jobs").insert({
    kind: "checkout_return",
    payment_attempt_id: input.paymentAttemptId,
    booking_intent_id: input.bookingIntentId
  });

  if (insertError) {
    throw insertError;
  }
}

async function markExpiredHoldAsManualAction(input: {
  supabase: Supabase;
  bookingIntentId: string;
  paymentAttemptId: string;
}) {
  const { count: issuedCount, error: issuedError } = await input.supabase
    .from("registrations")
    .select("id", { count: "exact", head: true })
    .eq("booking_intent_id", input.bookingIntentId)
    .eq("payment_attempt_id", input.paymentAttemptId);

  if (issuedError) {
    throw issuedError;
  }

  if ((issuedCount ?? 0) > 0) {
    return false;
  }

  const { data, error } = await input.supabase
    .from("booking_capacity_holds")
    .select("id")
    .eq("booking_intent_id", input.bookingIntentId)
    .lte("held_until", new Date().toISOString())
    .limit(1);

  if (error) {
    throw error;
  }

  if (!data?.length) {
    return false;
  }

  await input.supabase.from("payment_attempts").update({
    status: "manual_action_required",
    last_error: HOLD_EXPIRED_AFTER_PAYMENT_REASON
  }).eq("id", input.paymentAttemptId);
  await input.supabase.from("booking_intents").update({
    status: "manual_action_required",
    manual_action_reason: HOLD_EXPIRED_AFTER_PAYMENT_REASON
  }).eq("id", input.bookingIntentId);

  return true;
}

async function reloadCheckoutStatusRows(
  supabase: Supabase,
  fallbackBooking: BookingRow,
  fallbackAttempt: CheckoutStatusPaymentAttempt
) {
  const [{ data: booking }, { data: attempt }] = await Promise.all([
    supabase.from("booking_intents").select("*").eq("id", fallbackBooking.id).single(),
    supabase
      .from("payment_attempts")
      .select("id, booking_intent_id, status, ni_order_reference, amount_minor, currency_code")
      .eq("id", fallbackAttempt.id)
      .single()
  ]);

  return {
    booking: (booking as BookingRow | null) ?? fallbackBooking,
    attempt: (attempt as CheckoutStatusPaymentAttempt | null) ?? fallbackAttempt
  };
}

export async function fulfillPaidBookingFromWorker(input: {
  bookingIntentId: string;
  paymentAttemptId: string;
}) {
  const supabase = createAdminSupabaseClient();
  const { data: booking, error } = await supabase
    .from("booking_intents")
    .select("*")
    .eq("id", input.bookingIntentId)
    .single();

  if (error || !booking) {
    throw error ?? new Error("Booking not found.");
  }

  const existingAttendees = await loadFulfilledTicketAttendees(supabase, booking as BookingRow);
  if (existingAttendees.length > 0) {
    await ensureAutomaticTicketDelivery(supabase, input.bookingIntentId);
    await markBookingFulfilledAfterTicketIssue({
      supabase,
      bookingIntentId: input.bookingIntentId,
      paymentAttemptId: input.paymentAttemptId,
      recoverManualHoldExpired:
        (booking as BookingRow).status === "manual_action_required" &&
        (booking as BookingRow).manual_action_reason === HOLD_EXPIRED_AFTER_PAYMENT_REASON
    });
    return {
      outcome: "already_fulfilled",
      attendees: existingAttendees,
      message: "Registration confirmed. Your tickets are ready and we are emailing a copy.",
      bookingIntentId: input.bookingIntentId,
      ...ticketLinkForBooking(booking as BookingRow)
    };
  }

  const result = await fulfillBooking({ supabase, booking: booking as BookingRow, paymentAttemptId: input.paymentAttemptId });
  if (["fulfilled", "already_fulfilled"].includes(result.outcome)) {
    await markBookingFulfilledAfterTicketIssue({
      supabase,
      bookingIntentId: input.bookingIntentId,
      paymentAttemptId: input.paymentAttemptId
    });
  }
  return { ...result, bookingIntentId: input.bookingIntentId, ...ticketLinkForBooking(booking as BookingRow) };
}
