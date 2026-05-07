import "server-only";
import { env } from "@/lib/env";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { deriveCheckoutQrToken, hashOpaqueToken, signTicketAccessToken, verifyTicketAccessToken } from "@/lib/tokens";
import type { CheckoutTicketEvent, ConfirmedCheckoutAttendee } from "@/lib/types";
import { buildAbsoluteUrl, isSyntheticEmail } from "@/lib/utils";
import { getEventById } from "@/services/events";

type Supabase = ReturnType<typeof createAdminSupabaseClient>;

export type TicketBookingRow = {
  id: string;
  event_id: string;
  status: string;
  payer_email_raw: string;
  payer_full_name: string;
  ticket_access_nonce: string;
};

type BookingAttendeeRow = {
  id: string;
  attendee_index: number;
  full_name: string;
};

type RegistrationTicketRow = {
  id: string;
  full_name: string;
  email_raw: string;
  category_title: string | null;
  ticket_option_title: string | null;
  manual_checkin_code: string;
  payment_attempt_id: string | null;
  qr_token_hash?: string | null;
  booking_attendee_id?: string | null;
  status?: string;
};

export interface TicketWalletData {
  booking: {
    id: string;
    publicReference?: string | null;
    payerEmail: string;
    payerFullName: string;
  };
  event: CheckoutTicketEvent;
  attendees: ConfirmedCheckoutAttendee[];
  ticketToken: string;
  ticketUrl: string;
}

export function buildTicketAccessToken(booking: Pick<TicketBookingRow, "id" | "ticket_access_nonce">) {
  return signTicketAccessToken({
    bookingIntentId: booking.id,
    nonce: booking.ticket_access_nonce
  });
}

export function buildTicketPath(ticketToken: string) {
  return `/tickets/${encodeURIComponent(ticketToken)}`;
}

export function buildTicketUrl(ticketToken: string) {
  return buildAbsoluteUrl(env.APP_URL, buildTicketPath(ticketToken));
}

function getAttendeeIndexForRegistration(
  registration: RegistrationTicketRow,
  index: number,
  booking: Pick<TicketBookingRow, "id">,
  attendees: BookingAttendeeRow[],
  attendeeById: Map<string, BookingAttendeeRow>,
  fallbackByName: Map<string, BookingAttendeeRow[]>
) {
  if (registration.booking_attendee_id) {
    const direct = attendeeById.get(registration.booking_attendee_id);
    if (direct) {
      return direct.attendee_index;
    }
  }

  if (registration.qr_token_hash) {
    const matchedByQrHash = attendees.find((attendee) => {
      const qrToken = deriveCheckoutQrToken({
        bookingIntentId: booking.id,
        paymentAttemptId: registration.payment_attempt_id ?? null,
        attendeeIndex: attendee.attendee_index
      });
      return hashOpaqueToken(qrToken) === registration.qr_token_hash;
    });

    if (matchedByQrHash) {
      return matchedByQrHash.attendee_index;
    }
  }

  const nameMatches = fallbackByName.get(registration.full_name) ?? [];
  if (nameMatches.length === 1) {
    return nameMatches[0].attendee_index;
  }

  return index;
}

export async function loadFulfilledTicketAttendees(
  supabase: Supabase,
  booking: Pick<TicketBookingRow, "id">
): Promise<ConfirmedCheckoutAttendee[]> {
  const [registrationsResult, attendeesResult] = await Promise.all([
    supabase
      .from("registrations")
      .select("id, full_name, email_raw, category_title, ticket_option_title, manual_checkin_code, payment_attempt_id, qr_token_hash, booking_attendee_id, status")
      .eq("booking_intent_id", booking.id),
    supabase
      .from("booking_attendees")
      .select("id, attendee_index, full_name")
      .eq("booking_intent_id", booking.id)
      .order("attendee_index", { ascending: true })
  ]);

  if (registrationsResult.error) {
    throw registrationsResult.error;
  }

  if (attendeesResult.error) {
    throw attendeesResult.error;
  }

  const attendeeRows = (attendeesResult.data ?? []) as BookingAttendeeRow[];
  const attendeeById = new Map(attendeeRows.map((row) => [row.id, row]));
  const fallbackByName = new Map<string, BookingAttendeeRow[]>();

  for (const attendee of attendeeRows) {
    const rows = fallbackByName.get(attendee.full_name) ?? [];
    rows.push(attendee);
    fallbackByName.set(attendee.full_name, rows);
  }

  return ((registrationsResult.data ?? []) as RegistrationTicketRow[])
    .filter((row) => !["cancelled", "revoked"].includes(row.status ?? ""))
    .map((row, index) => {
      const attendeeIndex = getAttendeeIndexForRegistration(row, index, booking, attendeeRows, attendeeById, fallbackByName);
      return {
        attendeeIndex,
        registrationId: row.id,
        fullName: row.full_name,
        qrToken: deriveCheckoutQrToken({
          bookingIntentId: booking.id,
          paymentAttemptId: row.payment_attempt_id ?? null,
          attendeeIndex
        }),
        manualCheckinCode: row.manual_checkin_code,
        categoryTitle: row.category_title ?? "General Admission",
        ticketTitle: row.ticket_option_title ?? null,
        email: isSyntheticEmail(row.email_raw) ? undefined : row.email_raw
      };
    })
    .sort((a, b) => a.attendeeIndex - b.attendeeIndex)
    .map(({ attendeeIndex: _attendeeIndex, ...attendee }) => attendee);
}

async function loadTicketBookingById(supabase: Supabase, bookingIntentId: string) {
  const { data, error } = await supabase
    .from("booking_intents")
    .select("id, event_id, status, payer_email_raw, payer_full_name, public_reference, ticket_access_nonce")
    .eq("id", bookingIntentId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as (TicketBookingRow & { public_reference?: string | null }) | null;
}

export async function buildTicketWalletForBooking(
  supabase: Supabase,
  booking: TicketBookingRow & { public_reference?: string | null },
  ticketToken?: string
): Promise<TicketWalletData | null> {
  if (booking.status !== "fulfilled") {
    return null;
  }

  const [event, attendees] = await Promise.all([
    getEventById(booking.event_id),
    loadFulfilledTicketAttendees(supabase, booking)
  ]);

  if (!event || attendees.length === 0) {
    return null;
  }

  const token = ticketToken ?? buildTicketAccessToken(booking);

  return {
    booking: {
      id: booking.id,
      publicReference: booking.public_reference,
      payerEmail: booking.payer_email_raw,
      payerFullName: booking.payer_full_name
    },
    event: {
      title: event.title,
      venue: event.venue,
      start_at: event.start_at,
      end_at: event.end_at,
      timezone: event.timezone,
      form_config: event.form_config
    },
    attendees,
    ticketToken: token,
    ticketUrl: buildTicketUrl(token)
  };
}

export async function getTicketWalletByToken(ticketToken: string) {
  const payload = verifyTicketAccessToken(ticketToken);
  if (!payload) {
    return null;
  }

  const supabase = createAdminSupabaseClient({ noStore: true });
  const booking = await loadTicketBookingById(supabase, payload.bookingIntentId);
  if (!booking) {
    return null;
  }

  if (booking.ticket_access_nonce !== payload.nonce) {
    return null;
  }

  return buildTicketWalletForBooking(supabase, booking, ticketToken);
}

export async function getTicketWalletByBookingId(bookingIntentId: string) {
  const supabase = createAdminSupabaseClient({ noStore: true });
  const booking = await loadTicketBookingById(supabase, bookingIntentId);
  if (!booking) {
    throw new Error("Booking not found.");
  }
  return buildTicketWalletForBooking(supabase, booking);
}

export async function ensureAutomaticTicketDelivery(
  supabase: Supabase,
  bookingIntentId: string
) {
  const { error } = await supabase.rpc("ensure_ticket_delivery_job", {
    p_booking_intent_id: bookingIntentId
  });

  if (error) {
    throw error;
  }
}

export async function createTicketResendDelivery(input: {
  ticketToken: string;
  ipAddress?: string | null;
}) {
  const payload = verifyTicketAccessToken(input.ticketToken);
  if (!payload) {
    return { ok: false, message: "Invalid ticket link.", status: 400 };
  }

  const supabase = createAdminSupabaseClient({ noStore: true });
  const booking = await loadTicketBookingById(supabase, payload.bookingIntentId);
  if (!booking) {
    return { ok: false, message: "Invalid ticket link.", status: 400 };
  }
  if (booking.ticket_access_nonce !== payload.nonce || booking.status !== "fulfilled") {
    return { ok: false, message: "Invalid ticket link.", status: 400 };
  }

  const { data: bookingLimit, error: bookingLimitError } = await supabase.rpc("check_checkout_rate_limit", {
    p_throttle_key: booking.id,
    p_action: "ticket_resend_booking",
    p_window_seconds: 60 * 60,
    p_max_requests: 3
  });

  if (bookingLimitError) {
    throw bookingLimitError;
  }

  const { data: ipLimit, error: ipLimitError } = await supabase.rpc("check_checkout_rate_limit", {
    p_throttle_key: `${input.ipAddress ?? "unknown"}:${booking.id}`,
    p_action: "ticket_resend_ip",
    p_window_seconds: 60 * 60,
    p_max_requests: 5
  });

  if (ipLimitError) {
    throw ipLimitError;
  }

  const bookingAllowed = Array.isArray(bookingLimit) ? bookingLimit[0]?.allowed : true;
  const ipAllowed = Array.isArray(ipLimit) ? ipLimit[0]?.allowed : true;

  if (!bookingAllowed || !ipAllowed) {
    return { ok: false, message: "Too many resend requests. Please try again later.", status: 429 };
  }

  const { data, error } = await supabase.rpc("create_ticket_delivery_job", {
    p_booking_intent_id: booking.id,
    p_delivery_kind: "user_resend",
    p_recipient_email: booking.payer_email_raw
  });

  if (error) {
    throw error;
  }

  return { ok: Boolean(data), message: "Ticket email queued for resend.", status: 202 };
}
