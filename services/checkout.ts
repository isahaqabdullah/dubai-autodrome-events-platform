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
import type { CheckoutCreatePaymentInput, CheckoutStartInput } from "@/lib/validation/checkout";
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
  interpretNgeniusOrder,
  NgeniusApiError,
  prefetchNgeniusAccessToken
} from "@/services/ngenius";
import type { NgeniusOrderItem } from "@/services/ngenius";

const CHECKOUT_HOLD_MINUTES = 25;
const MAX_PAYMENT_ATTEMPTS = 5;
export const HOLD_EXPIRED_AFTER_PAYMENT_REASON = "Payment succeeded after the capacity hold expired.";
const NGENIUS_RECONCILE_AUTH_REASON = "N-Genius authorization failed during payment status reconciliation.";

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
  payer_uae_resident: boolean;
  total_minor: number;
  currency_code: string;
  attempt_count: number;
  verification_token_hash: string | null;
  verification_expires_at: string | null;
  email_verified_at: string | null;
  held_until: string | null;
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

function checkoutTimingEnabled() {
  return process.env.CHECKOUT_TIMING_LOGS === "1" || process.env.CHECKOUT_TIMING_LOGS === "true";
}

function createCheckoutTimer(label: string) {
  const enabled = checkoutTimingEnabled();
  const startedAt = Date.now();
  let previousAt = startedAt;

  return function mark(step: string, metadata: Record<string, unknown> = {}) {
    if (!enabled) return;

    const now = Date.now();
    console.info("[checkout-timing]", {
      label,
      step,
      stepMs: now - previousAt,
      totalMs: now - startedAt,
      ...metadata
    });
    previousAt = now;
  };
}

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

function displayNameForVerification(fullName: string) {
  return /^Attendee \d+$/.test(fullName.trim()) ? "there" : fullName;
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

function normalizeAttendeeDrafts(input: CheckoutStartInput, categories: EventCatalogOption[]) {
  const primaryInputFirstName = input.firstName?.trim() ?? "";
  const primaryInputLastName = input.lastName?.trim() ?? "";
  const primaryFullName = `${primaryInputFirstName} ${primaryInputLastName}`.trim();
  const sourceAttendees = input.attendees?.length
    ? input.attendees
    : [{
      firstName: primaryInputFirstName,
      lastName: primaryInputLastName,
      email: input.email,
      age: input.age,
      categoryId: input.categoryId,
      addonId: input.addonId
    }];

  const attendees: AttendeeDraft[] = [];

  for (let index = 0; index < sourceAttendees.length; index++) {
    const attendee = sourceAttendees[index];
    const category = findCatalogOption(categories, attendee.categoryId);

    if (!category) {
      throw new Error("The selected ticket type is no longer available.");
    }

    const isPrimary = index === 0;
    const firstName = isPrimary ? primaryInputFirstName : attendee.firstName?.trim() || "";
    const lastName = isPrimary ? primaryInputLastName : attendee.lastName?.trim() || "";
    const fullName = isPrimary ? primaryFullName : `${firstName} ${lastName}`.trim();
    const email = isPrimary ? input.email : attendee.email?.trim() || null;

    attendees.push({
      firstName,
      lastName,
      fullName: fullName || `Attendee ${index + 1}`,
      email,
      emailNormalized: email ? normalizeEmail(email) : null,
      age: isPrimary ? input.age ?? null : attendee.age ?? null,
      category,
      addon: null,
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
    return sum + attendee.category.priceMinor;
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

    return rows;
  });

  const { error: itemError } = await input.supabase.from("booking_intent_items").insert(itemRows);
  if (itemError) {
    throw itemError;
  }

  return booking as BookingRow;
}

async function sendCheckoutVerificationEmail(input: {
  booking: Pick<BookingRow, "id" | "payer_full_name">;
  event: Pick<NonNullable<Awaited<ReturnType<typeof getEventById>>>, "id" | "title">;
  email: string;
  verificationCode: string;
}) {
  await executeEmailJob("verify_email", {
    bookingIntentId: input.booking.id,
    eventId: input.event.id,
    email: input.email.trim(),
    fullName: input.booking.payer_full_name
  }, async (job) => {
    const mail = buildVerificationEmail({
      fullName: displayNameForVerification(input.booking.payer_full_name),
      eventTitle: input.event.title,
      otpCode: input.verificationCode
    });

    await sendMail({
      to: input.email.trim(),
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      idempotencyKey: job.id
    });
  });
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

  const supabase = createAdminSupabaseClient({ noStore: true });
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
    attendees = normalizeAttendeeDrafts(input, catalog.categories);
  } catch (error) {
    return {
      outcome: "invalid_selection",
      message: error instanceof Error ? error.message : "The selected ticket type or activity category is no longer available."
    };
  }

  const verificationCode = generateVerificationCode();
  const booking = await insertBooking({ supabase, checkoutInput: input, attendees, event, verificationCode, metadata });
  const reservation = await reserveCapacity(supabase, booking.id, { advancePaymentPending: false });

  if (!reservation || reservation.outcome !== "reserved") {
    const message = reservation?.message ?? "Unable to reserve capacity.";
    await supabase.from("booking_intents").update({
      status: "expired",
      manual_action_reason: message
    }).eq("id", booking.id);

    return {
      outcome: reservation?.outcome === "capacity_exceeded" ? "capacity_exceeded" : "invalid_selection",
      message
    };
  }

  await sendCheckoutVerificationEmail({
    booking,
    event,
    email: input.email,
    verificationCode
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

export async function resendCheckoutOtp(input: {
  checkoutToken: string;
  metadata?: CheckoutRequestMetadata;
}): Promise<CheckoutStartResult> {
  if (isDemoMode()) {
    return {
      outcome: "otp_sent",
      message: "Verification code sent. Enter the 6-digit OTP to continue.",
      totalMinor: 0,
      currencyCode: "AED"
    };
  }

  const supabase = createAdminSupabaseClient({ noStore: true });
  const booking = await getBookingByToken(supabase, input.checkoutToken);

  if (booking.status === "email_verified") {
    return {
      outcome: "invalid_selection",
      message: "This email is already verified. Continue to payment."
    };
  }

  if (booking.status !== "otp_sent") {
    return {
      outcome: "invalid_selection",
      message: "This booking can no longer receive a new verification code. Select tickets again to restart."
    };
  }

  if (booking.held_until && new Date(booking.held_until).getTime() < Date.now()) {
    return {
      outcome: "capacity_exceeded",
      message: "This ticket hold has expired. Select tickets again to restart."
    };
  }

  const bookingLimit = await checkCheckoutRateLimit({
    supabase,
    key: booking.id,
    action: "checkout_resend_otp_booking",
    maxRequests: 3,
    windowSeconds: VERIFICATION_TOKEN_TTL_MINUTES * 60
  });
  const ipLimit = await checkCheckoutRateLimit({
    supabase,
    key: `${input.metadata?.ipAddress ?? "unknown"}:${booking.id}`,
    action: "checkout_resend_otp_ip",
    maxRequests: 3,
    windowSeconds: RATE_LIMIT_WINDOW_SECONDS
  });

  if (!bookingLimit?.allowed || !ipLimit?.allowed) {
    return {
      outcome: "rate_limited",
      message: `Too many resend attempts. Please wait ${Math.max(
        bookingLimit?.retry_after_seconds ?? 0,
        ipLimit?.retry_after_seconds ?? 0,
        60
      )} seconds before trying again.`
    };
  }

  const event = await getEventById(booking.event_id);
  if (!event) {
    throw new Error("Event not found.");
  }

  const verificationCode = generateVerificationCode();
  const verificationExpiresAt = new Date(Date.now() + VERIFICATION_TOKEN_TTL_MINUTES * 60 * 1000).toISOString();
  const { error } = await supabase
    .from("booking_intents")
    .update({
      verification_token_hash: hashOpaqueToken(verificationCode),
      verification_expires_at: verificationExpiresAt
    })
    .eq("id", booking.id);

  if (error) {
    throw error;
  }

  await sendCheckoutVerificationEmail({
    booking,
    event,
    email: booking.payer_email_raw,
    verificationCode
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

async function reserveCapacity(
  supabase: Supabase,
  bookingIntentId: string,
  options?: { advancePaymentPending?: boolean }
) {
  const { data, error } = await supabase.rpc("reserve_booking_capacity", {
    p_booking_intent_id: bookingIntentId,
    p_hold_minutes: CHECKOUT_HOLD_MINUTES,
    p_advance_payment_pending: options?.advancePaymentPending ?? true
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

async function loadBookingItemsByAttendee(supabase: Supabase, bookingIntentId: string) {
  const { data, error } = await supabase
    .from("booking_intent_items")
    .select("attendee_id, item_type, public_id")
    .eq("booking_intent_id", bookingIntentId);

  if (error) {
    throw error;
  }

  const byAttendee = new Map<string, { categoryId: string | null; addonId: string | null }>();

  for (const row of data ?? []) {
    const attendeeId = row.attendee_id as string | null;
    if (!attendeeId) continue;
    const current = byAttendee.get(attendeeId) ?? { categoryId: null, addonId: null };
    if (row.item_type === "category") {
      current.categoryId = row.public_id as string;
    }
    if (row.item_type === "addon") {
      current.addonId = row.public_id as string;
    }
    byAttendee.set(attendeeId, current);
  }

  return byAttendee;
}

async function loadCategoryItemIdsByAttendee(supabase: Supabase, bookingIntentId: string) {
  const { data, error } = await supabase
    .from("booking_intent_items")
    .select("id, attendee_id")
    .eq("booking_intent_id", bookingIntentId)
    .eq("item_type", "category");

  if (error) {
    throw error;
  }

  return new Map(
    (data ?? [])
      .filter((row) => row.attendee_id)
      .map((row) => [row.attendee_id as string, row.id as string])
  );
}

function incrementCount(counts: Map<string, number>, key: string | null | undefined) {
  if (!key) return;
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

function countMapsEqual(left: Map<string, number>, right: Map<string, number>) {
  if (left.size !== right.size) return false;
  for (const [key, value] of left) {
    if (right.get(key) !== value) return false;
  }
  return true;
}

async function updateBookingContactDetails(
  supabase: Supabase,
  bookingIntentId: string,
  contact: Pick<CheckoutCreatePaymentInput, "phone" | "uaeResident">
) {
  const normalizedPhone = normalizePhone(contact.phone);

  const [bookingResult, attendeeResult] = await Promise.all([
    supabase
      .from("booking_intents")
      .update({
        payer_phone: normalizedPhone,
        payer_uae_resident: contact.uaeResident
      })
      .eq("id", bookingIntentId),
    supabase
      .from("booking_attendees")
      .update({
        phone: normalizedPhone,
        uae_resident: contact.uaeResident
      })
      .eq("booking_intent_id", bookingIntentId)
      .eq("attendee_index", 0)
  ]);

  if (bookingResult.error) {
    throw bookingResult.error;
  }

  if (attendeeResult.error) {
    throw attendeeResult.error;
  }
}

async function completeBookingAttendees(
  supabase: Supabase,
  booking: BookingRow,
  categories: EventCatalogOption[],
  addons: EventCatalogOption[],
  attendees: NonNullable<CheckoutCreatePaymentInput["attendees"]>
) {
  const [existingAttendees, itemsByAttendee, categoryItemIdsByAttendee] = await Promise.all([
    loadBookingAttendees(supabase, booking.id),
    loadBookingItemsByAttendee(supabase, booking.id),
    loadCategoryItemIdsByAttendee(supabase, booking.id)
  ]);

  if (existingAttendees.length !== attendees.length) {
    return { ok: false as const, message: "Attendee details no longer match the reserved tickets. Start again to refresh the booking." };
  }

  const reservedCategoryCounts = new Map<string, number>();
  for (const itemSelection of itemsByAttendee.values()) {
    incrementCount(reservedCategoryCounts, itemSelection.categoryId);
  }

  const requestedCategoryCounts = new Map<string, number>();
  const categoryUpdates: Array<{
    id: string;
    event_category_id: string;
    public_id: string;
    title: string;
    description: string;
    unit_price_minor: number;
    total_price_minor: number;
    currency_code: string;
    sort_order: number;
  }> = [];
  const addonRows: Array<{
    booking_intent_id: string;
    attendee_id: string;
    item_type: "addon";
    event_addon_id: string;
    public_id: string;
    title: string;
    description: string;
    quantity: number;
    unit_price_minor: number;
    total_price_minor: number;
    currency_code: string;
    sort_order: number;
  }> = [];
  const attendeeRows = existingAttendees.map((row, index) => {
    const attendee = attendees[index];
    const categoryItemId = categoryItemIdsByAttendee.get(row.id as string);
    const category = findCatalogOption(categories, attendee.categoryId);
    const addon = findCatalogOption(addons, attendee.addonId);

    if (!categoryItemId || !category || !addon) {
      return null;
    }

    incrementCount(requestedCategoryCounts, category.publicId);
    categoryUpdates.push({
      id: categoryItemId,
      event_category_id: category.id,
      public_id: category.publicId,
      title: category.title,
      description: category.description,
      unit_price_minor: category.priceMinor,
      total_price_minor: category.priceMinor,
      currency_code: category.currencyCode,
      sort_order: index * 2
    });

    const attendeeEmail = attendee.email?.trim() || null;
    addonRows.push({
      booking_intent_id: booking.id,
      attendee_id: row.id as string,
      item_type: "addon",
      event_addon_id: addon.id,
      public_id: addon.publicId,
      title: addon.title,
      description: addon.description,
      quantity: 1,
      unit_price_minor: 0,
      total_price_minor: 0,
      currency_code: category.currencyCode,
      sort_order: index * 2 + 1
    });

    return {
      booking_intent_id: booking.id,
      attendee_index: index,
      full_name: `${attendee.firstName} ${attendee.lastName}`.replace(/\s+/g, " ").trim(),
      email_raw: index === 0 ? booking.payer_email_raw : attendeeEmail,
      email_normalized: index === 0 ? booking.payer_email_normalized : attendeeEmail ? normalizeEmail(attendeeEmail) : null,
      age: attendee.age
    };
  });

  if (attendeeRows.some((row) => row === null)) {
    return { ok: false as const, message: "Attendee ticket assignments or activity preferences are no longer available." };
  }

  if (!countMapsEqual(reservedCategoryCounts, requestedCategoryCounts)) {
    return { ok: false as const, message: "Attendee ticket assignments no longer match the reserved ticket quantities." };
  }

  const completeRows = attendeeRows.filter((row): row is Exclude<(typeof attendeeRows)[number], null> => row !== null);
  const primary = attendeeRows[0];
  const writeOperations: Array<Promise<unknown>> = [
    (async () => {
      const { error: attendeeError } = await supabase
        .from("booking_attendees")
        .upsert(completeRows, { onConflict: "booking_intent_id,attendee_index" });

      if (attendeeError) {
        throw attendeeError;
      }
    })(),
    Promise.all(categoryUpdates.map(async (categoryUpdate) => {
      const { id, ...values } = categoryUpdate;
      const { error: categoryUpdateError } = await supabase
        .from("booking_intent_items")
        .update(values)
        .eq("id", id);

      if (categoryUpdateError) {
        throw categoryUpdateError;
      }
    })),
    (async () => {
      const { error: deleteAddonError } = await supabase
        .from("booking_intent_items")
        .delete()
        .eq("booking_intent_id", booking.id)
        .eq("item_type", "addon");

      if (deleteAddonError) {
        throw deleteAddonError;
      }

      if (addonRows.length === 0) return;

      const { error: addonError } = await supabase
        .from("booking_intent_items")
        .insert(addonRows);

      if (addonError) {
        throw addonError;
      }
    })()
  ];

  if (primary) {
    writeOperations.push((async () => {
      const { error: bookingError } = await supabase
        .from("booking_intents")
        .update({
          payer_full_name: primary.full_name,
          payer_age: primary.age
        })
        .eq("id", booking.id);

      if (bookingError) {
        throw bookingError;
      }
    })());
  }

  await Promise.all(writeOperations);

  return { ok: true as const };
}

async function ensureBookingAttendeesComplete(supabase: Supabase, bookingIntentId: string) {
  const attendees = await loadBookingAttendees(supabase, bookingIntentId);
  const itemsByAttendee = await loadBookingItemsByAttendee(supabase, bookingIntentId);
  const incomplete = attendees.some((row) => {
    const fullName = typeof row.full_name === "string" ? row.full_name.trim() : "";
    const itemSelection = itemsByAttendee.get(row.id as string);
    return !fullName || row.age === null || row.age === undefined || !itemSelection?.addonId;
  });

  if (incomplete) {
    return { ok: false as const, message: "Complete attendee names, ages, and activity preferences before continuing to payment." };
  }

  return { ok: true as const };
}

function buildPaidOrderItemsFromAttendees(
  attendees: NonNullable<CheckoutCreatePaymentInput["attendees"]>,
  categories: EventCatalogOption[]
): NgeniusOrderItem[] {
  return attendees.flatMap((attendee) => {
    const category = findCatalogOption(categories, attendee.categoryId);

    if (!category || category.priceMinor <= 0) {
      return [];
    }

    return [{
      name: category.title,
      quantity: 1,
      amountMinor: category.priceMinor
    }];
  });
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

  const supabase = createAdminSupabaseClient({ noStore: true });
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

export async function createCheckoutPayment(
  checkoutToken: string,
  attendees?: CheckoutCreatePaymentInput["attendees"],
  contact?: Pick<CheckoutCreatePaymentInput, "phone" | "uaeResident">
): Promise<CheckoutPaymentResult> {
  const markTiming = createCheckoutTimer("create-payment");
  const supabase = createAdminSupabaseClient({ noStore: true });
  const booking = await getBookingByToken(supabase, checkoutToken);
  markTiming("load_booking", {
    bookingIntentId: booking.id,
    status: booking.status,
    totalMinor: booking.total_minor
  });
  const event = await getEventById(booking.event_id);
  markTiming("load_event", {
    bookingIntentId: booking.id,
    eventId: booking.event_id,
    found: Boolean(event)
  });

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
  markTiming("rate_limit", {
    bookingIntentId: booking.id,
    allowed: Boolean(rateLimit?.allowed)
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

  if (booking.total_minor > 0) {
    void prefetchNgeniusAccessToken().catch((error) => {
      markTiming("prefetch_ngenius_token_failed", {
        bookingIntentId: booking.id,
        error: error instanceof Error ? error.message : "Unknown error"
      });
    });
  }

  let attendeeDetailsCompleted = false;
  let paidOrderItems: NgeniusOrderItem[] | null = null;
  if (attendees?.length) {
    const catalog = await getEventCatalog(event);
    markTiming("load_catalog", {
      bookingIntentId: booking.id,
      categoryCount: catalog.categories.length,
      addonCount: catalog.addons.length
    });
    const completed = await completeBookingAttendees(supabase, booking, catalog.categories, catalog.addons, attendees);
    markTiming("complete_attendees", {
      bookingIntentId: booking.id,
      attendeeCount: attendees.length,
      ok: completed.ok
    });
    if (!completed.ok) {
      return { outcome: "invalid", message: completed.message };
    }
    attendeeDetailsCompleted = true;
    paidOrderItems = buildPaidOrderItemsFromAttendees(attendees, catalog.categories);
    const primary = attendees[0];
    if (primary) {
      booking.payer_full_name = `${primary.firstName} ${primary.lastName}`.replace(/\s+/g, " ").trim();
    }
  }

  if (contact) {
    await updateBookingContactDetails(supabase, booking.id, contact);
    markTiming("update_contact", {
      bookingIntentId: booking.id
    });
    booking.payer_phone = normalizePhone(contact.phone);
    booking.payer_uae_resident = contact.uaeResident;
  }

  if (!attendeeDetailsCompleted) {
    const attendeeCompletion = await ensureBookingAttendeesComplete(supabase, booking.id);
    markTiming("ensure_attendees_complete", {
      bookingIntentId: booking.id,
      ok: attendeeCompletion.ok
    });
    if (!attendeeCompletion.ok) {
      return { outcome: "invalid", message: attendeeCompletion.message };
    }
  }

  if (booking.total_minor === 0) {
    await supabase.from("booking_intents").update({
      declaration_accepted_at: new Date().toISOString()
    }).eq("id", booking.id);
    markTiming("accept_declaration", {
      bookingIntentId: booking.id
    });
    const reservation = await reserveCapacity(supabase, booking.id);
    markTiming("reserve_free_capacity", {
      bookingIntentId: booking.id,
      outcome: reservation?.outcome
    });
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
  markTiming("prepare_payment_attempt", {
    bookingIntentId: booking.id,
    outcome: preparedAttempt?.outcome,
    paymentAttemptId: preparedAttempt?.payment_attempt_id
  });
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

  if (!paidOrderItems) {
    const { data: itemRows, error: itemError } = await supabase
      .from("booking_intent_items")
      .select("title, quantity, total_price_minor")
      .eq("booking_intent_id", booking.id)
      .order("sort_order", { ascending: true });
    markTiming("load_order_items", {
      bookingIntentId: booking.id,
      itemCount: itemRows?.length ?? 0
    });

    if (itemError) {
      throw itemError;
    }

    paidOrderItems = (itemRows ?? [])
      .filter((item: Record<string, unknown>) => (item.total_price_minor as number) > 0)
      .map((item: Record<string, unknown>) => ({
        name: item.title as string,
        quantity: item.quantity as number,
        amountMinor: item.total_price_minor as number
      }));
  } else {
    markTiming("build_order_items_from_attendees", {
      bookingIntentId: booking.id,
      itemCount: paidOrderItems.length
    });
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
      items: paidOrderItems
    });
    markTiming("create_ngenius_order", {
      bookingIntentId: booking.id,
      paymentAttemptId: preparedAttempt.payment_attempt_id
    });

    const { error: updateAttemptError } = await supabase.from("payment_attempts").update({
      status: "payment_pending",
      ni_order_reference: order.orderReference,
      payment_href: order.paymentHref,
      raw_order_response: order.raw
    }).eq("id", preparedAttempt.payment_attempt_id);
    markTiming("store_ngenius_order", {
      bookingIntentId: booking.id,
      paymentAttemptId: preparedAttempt.payment_attempt_id
    });

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
    markTiming("create_ngenius_order_failed", {
      bookingIntentId: booking.id,
      paymentAttemptId: preparedAttempt.payment_attempt_id,
      error: message
    });
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
  const supabase = createAdminSupabaseClient({ noStore: true });
  const booking = await getBookingByToken(supabase, checkoutToken);
  if (booking.status === "fulfilled") {
    await ensureAutomaticTicketDelivery(supabase, booking.id);
    return buildFulfilledCheckoutStatus(supabase, booking, null);
  }

  const { data: attempt } = await supabase
    .from("payment_attempts")
    .select("id, booking_intent_id, status, ni_order_reference, amount_minor, currency_code")
    .eq("booking_intent_id", booking.id)
    .order("attempt_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  const recoveredIssuedTickets = await recoverIssuedTicketsForStatus(
    supabase,
    booking,
    attempt as CheckoutStatusPaymentAttempt | null
  );
  if (recoveredIssuedTickets) {
    return recoveredIssuedTickets;
  }

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

  const recoveredRefreshedTickets = await recoverIssuedTicketsForStatus(supabase, currentBooking, currentAttempt);
  if (recoveredRefreshedTickets) {
    return recoveredRefreshedTickets;
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

  const effectiveStatus = getEffectiveCheckoutStatus(currentBooking.status, currentAttempt?.status ?? null);

  return {
    status: effectiveStatus as CheckoutStatusResult["status"],
    message: getCheckoutStatusMessage(effectiveStatus),
    bookingIntentId: currentBooking.id,
    paymentAttemptId: currentAttempt?.id,
    paymentAttemptStatus: currentAttempt?.status as CheckoutStatusResult["paymentAttemptStatus"]
  };
}

function getEffectiveCheckoutStatus(bookingStatus: string, attemptStatus: string | null) {
  if (
    ["payment_pending", "expired"].includes(bookingStatus) &&
    (attemptStatus === "failed" || attemptStatus === "cancelled")
  ) {
    return "payment_failed";
  }

  if (
    bookingStatus === "payment_pending" &&
    attemptStatus === "manual_action_required"
  ) {
    return "manual_action_required";
  }

  return bookingStatus;
}

function getCheckoutStatusMessage(status: string) {
  if (status === "manual_action_required") {
    return "Payment needs manual review before ticket issuance.";
  }

  if (status === "payment_failed") {
    return "Payment failed. You can try again.";
  }

  if (status === "expired") {
    return "Payment session expired. No ticket was issued.";
  }

  if (status === "cancelled") {
    return "Payment was cancelled. No ticket was issued.";
  }

  return "Payment is still processing.";
}

async function recoverIssuedTicketsForStatus(
  supabase: Supabase,
  booking: BookingRow,
  attempt: CheckoutStatusPaymentAttempt | null
) {
  const canRecoverIssuedTickets =
    booking.status === "paid" ||
    attempt?.status === "paid" ||
    (booking.status === "manual_action_required" &&
      booking.manual_action_reason === HOLD_EXPIRED_AFTER_PAYMENT_REASON);

  if (!canRecoverIssuedTickets) {
    return null;
  }

  const attendees = await loadFulfilledTicketAttendees(supabase, booking);
  if (attendees.length === 0) {
    return null;
  }

  await markBookingFulfilledAfterTicketIssue({
    supabase,
    bookingIntentId: booking.id,
    paymentAttemptId: attempt?.id,
    recoverManualHoldExpired: booking.status === "manual_action_required"
  });
  await ensureAutomaticTicketDelivery(supabase, booking.id);
  return buildFulfilledCheckoutStatus(supabase, { ...booking, status: "fulfilled" }, attempt, attendees);
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
  const supabase = createAdminSupabaseClient({ noStore: true });
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
  const supabase = createAdminSupabaseClient({ noStore: true });
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

function isNgeniusUnauthorizedError(error: unknown) {
  return error instanceof NgeniusApiError && error.status === 401;
}

async function updateBookingUnlessFulfilled(
  supabase: Supabase,
  bookingIntentId: string,
  values: Partial<BookingRow>
) {
  const { error } = await supabase
    .from("booking_intents")
    .update(values)
    .eq("id", bookingIntentId)
    .neq("status", "fulfilled");

  if (error) {
    throw error;
  }
}

async function updatePendingBookingForManualAction(
  supabase: Supabase,
  bookingIntentId: string,
  values: Partial<BookingRow>
) {
  const { error } = await supabase
    .from("booking_intents")
    .update(values)
    .eq("id", bookingIntentId)
    .in("status", ["otp_sent", "email_verified", "payment_pending", "manual_action_required"]);

  if (error) {
    throw error;
  }
}

async function markNgeniusReconcileAuthFailure(input: {
  supabase: Supabase;
  bookingIntentId: string;
  paymentAttemptId: string;
}) {
  const { error: attemptError } = await input.supabase
    .from("payment_attempts")
    .update({
      status: "manual_action_required",
      last_error: NGENIUS_RECONCILE_AUTH_REASON
    })
    .eq("id", input.paymentAttemptId)
    .neq("status", "paid");

  if (attemptError) {
    throw attemptError;
  }

  await updatePendingBookingForManualAction(input.supabase, input.bookingIntentId, {
    status: "manual_action_required",
    manual_action_reason: NGENIUS_RECONCILE_AUTH_REASON
  });
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
      await updateBookingUnlessFulfilled(input.supabase, input.booking.id, {
        status: "manual_action_required",
        manual_action_reason: reason
      });
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
      await updateBookingUnlessFulfilled(input.supabase, input.booking.id, {
        status: "paid",
        manual_action_reason: null
      });
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
      await updateBookingUnlessFulfilled(input.supabase, input.booking.id, {
        status: "payment_failed",
        manual_action_reason: null
      });
    } else if (state.kind === "manual_review") {
      const reason = state.state ? `N-Genius manual review state: ${state.state}` : "N-Genius state requires manual review.";
      await input.supabase.from("payment_attempts").update({
        status: "manual_action_required",
        last_error: reason
      }).eq("id", input.attempt.id);
      await updateBookingUnlessFulfilled(input.supabase, input.booking.id, {
        status: "manual_action_required",
        manual_action_reason: reason
      });
    }
  } catch (error) {
    if (isNgeniusUnauthorizedError(error) && input.attempt?.id) {
      await markNgeniusReconcileAuthFailure({
        supabase: input.supabase,
        bookingIntentId: input.booking.id,
        paymentAttemptId: input.attempt.id
      });
    }
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
  const { count: bookingIssuedCount, error: bookingIssuedError } = await input.supabase
    .from("registrations")
    .select("id", { count: "exact", head: true })
    .eq("booking_intent_id", input.bookingIntentId)
    .not("status", "in", "(cancelled,revoked)");

  if (bookingIssuedError) {
    throw bookingIssuedError;
  }

  if ((bookingIssuedCount ?? 0) > 0) {
    return false;
  }

  const { count: attemptIssuedCount, error: issuedError } = await input.supabase
    .from("registrations")
    .select("id", { count: "exact", head: true })
    .eq("booking_intent_id", input.bookingIntentId)
    .eq("payment_attempt_id", input.paymentAttemptId);

  if (issuedError) {
    throw issuedError;
  }

  if ((attemptIssuedCount ?? 0) > 0) {
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
  const supabase = createAdminSupabaseClient({ noStore: true });
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
