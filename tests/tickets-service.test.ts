import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deriveCheckoutQrToken, hashOpaqueToken, signTicketAccessToken } from "@/lib/tokens";
import { generateTicketPdf } from "@/services/ticket-pdf";
import {
  createTicketResendDelivery,
  getTicketWalletByToken,
  loadFulfilledTicketAttendees
} from "@/services/tickets";

const testState = vi.hoisted(() => ({
  booking: null as Record<string, unknown> | null,
  bookingError: null as { message: string } | null,
  rateLimitAllowed: true,
  rpcCalls: [] as Array<{ fn: string; args: Record<string, unknown> }>
}));

vi.mock("@/lib/env", () => ({
  env: {
    APP_URL: "https://example.com"
  }
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: () => ({
    from(table: string) {
      return {
        select() {
          return {
            eq() {
              if (table !== "booking_intents") {
                throw new Error(`Unexpected table in ticket service test: ${table}`);
              }
              return {
                maybeSingle: async () => ({
                  data: testState.booking,
                  error: testState.bookingError
                })
              };
            }
          };
        }
      };
    },
    rpc: vi.fn(async (fn: string, args: Record<string, unknown>) => {
      testState.rpcCalls.push({ fn, args });
      if (fn === "check_checkout_rate_limit") {
        return {
          data: [{ allowed: testState.rateLimitAllowed, retry_after_seconds: 60 }],
          error: null
        };
      }
      if (fn === "create_ticket_delivery_job") {
        return { data: "delivery-1", error: null };
      }
      throw new Error(`Unexpected RPC in ticket service test: ${fn}`);
    })
  })
}));

const originalSecret = process.env.CHECKOUT_HMAC_SECRET;

function fulfilledBooking(overrides: Record<string, unknown> = {}) {
  return {
    id: "booking-1",
    event_id: "event-1",
    status: "fulfilled",
    payer_email_raw: "payer@example.com",
    payer_full_name: "Jane Doe",
    public_reference: "BI-123",
    ticket_access_nonce: "nonce-1",
    ...overrides
  };
}

describe("ticket service", () => {
  beforeEach(() => {
    process.env.CHECKOUT_HMAC_SECRET = "test-checkout-secret";
    testState.booking = null;
    testState.bookingError = null;
    testState.rateLimitAllowed = true;
    testState.rpcCalls = [];
  });

  afterEach(() => {
    process.env.CHECKOUT_HMAC_SECRET = originalSecret;
  });

  it("orders fulfilled attendees by booking attendee index and pairs the right QR token", async () => {
    const registrations = [
      {
        id: "registration-2",
        full_name: "Second Attendee",
        email_raw: "second@example.com",
        category_title: "General Admission",
        ticket_option_title: null,
        manual_checkin_code: "BBBB",
        payment_attempt_id: "attempt-1",
        qr_token_hash: hashOpaqueToken(deriveCheckoutQrToken({
          bookingIntentId: "booking-1",
          paymentAttemptId: "attempt-1",
          attendeeIndex: 1
        })),
        booking_attendee_id: "attendee-2",
        status: "registered"
      },
      {
        id: "registration-1",
        full_name: "First Attendee",
        email_raw: "first@example.com",
        category_title: "General Admission",
        ticket_option_title: null,
        manual_checkin_code: "AAAA",
        payment_attempt_id: "attempt-1",
        qr_token_hash: hashOpaqueToken(deriveCheckoutQrToken({
          bookingIntentId: "booking-1",
          paymentAttemptId: "attempt-1",
          attendeeIndex: 0
        })),
        booking_attendee_id: "attendee-1",
        status: "registered"
      }
    ];
    const bookingAttendees = [
      { id: "attendee-1", attendee_index: 0, full_name: "First Attendee" },
      { id: "attendee-2", attendee_index: 1, full_name: "Second Attendee" }
    ];
    const supabase = {
      from(table: string) {
        return {
          select() {
            return {
              eq() {
                if (table === "registrations") {
                  return Promise.resolve({ data: registrations, error: null });
                }
                return {
                  order() {
                    return Promise.resolve({ data: bookingAttendees, error: null });
                  }
                };
              }
            };
          }
        };
      }
    };

    const attendees = await loadFulfilledTicketAttendees(supabase as never, { id: "booking-1" });

    expect(attendees.map((attendee) => attendee.fullName)).toEqual(["First Attendee", "Second Attendee"]);
    expect(attendees[0].qrToken).toBe(deriveCheckoutQrToken({
      bookingIntentId: "booking-1",
      paymentAttemptId: "attempt-1",
      attendeeIndex: 0
    }));
    expect(attendees[1].qrToken).toBe(deriveCheckoutQrToken({
      bookingIntentId: "booking-1",
      paymentAttemptId: "attempt-1",
      attendeeIndex: 1
    }));
  });

  it("recovers attendee order from QR hashes when legacy rows have duplicate names", async () => {
    const registrations = [
      {
        id: "registration-2",
        full_name: "Alex Lee",
        email_raw: "second@example.com",
        category_title: "General Admission",
        ticket_option_title: null,
        manual_checkin_code: "BBBB",
        payment_attempt_id: "attempt-1",
        qr_token_hash: hashOpaqueToken(deriveCheckoutQrToken({
          bookingIntentId: "booking-1",
          paymentAttemptId: "attempt-1",
          attendeeIndex: 1
        })),
        booking_attendee_id: null,
        status: "registered"
      },
      {
        id: "registration-1",
        full_name: "Alex Lee",
        email_raw: "first@example.com",
        category_title: "General Admission",
        ticket_option_title: null,
        manual_checkin_code: "AAAA",
        payment_attempt_id: "attempt-1",
        qr_token_hash: hashOpaqueToken(deriveCheckoutQrToken({
          bookingIntentId: "booking-1",
          paymentAttemptId: "attempt-1",
          attendeeIndex: 0
        })),
        booking_attendee_id: null,
        status: "registered"
      }
    ];
    const bookingAttendees = [
      { id: "attendee-1", attendee_index: 0, full_name: "Alex Lee" },
      { id: "attendee-2", attendee_index: 1, full_name: "Alex Lee" }
    ];
    const supabase = {
      from(table: string) {
        return {
          select() {
            return {
              eq() {
                if (table === "registrations") {
                  return Promise.resolve({ data: registrations, error: null });
                }
                return {
                  order() {
                    return Promise.resolve({ data: bookingAttendees, error: null });
                  }
                };
              }
            };
          }
        };
      }
    };

    const attendees = await loadFulfilledTicketAttendees(supabase as never, { id: "booking-1" });

    expect(attendees.map((attendee) => attendee.manualCheckinCode)).toEqual(["AAAA", "BBBB"]);
    expect(attendees[0].qrToken).toBe(deriveCheckoutQrToken({
      bookingIntentId: "booking-1",
      paymentAttemptId: "attempt-1",
      attendeeIndex: 0
    }));
    expect(attendees[1].qrToken).toBe(deriveCheckoutQrToken({
      bookingIntentId: "booking-1",
      paymentAttemptId: "attempt-1",
      attendeeIndex: 1
    }));
  });

  it("generates a single PDF containing all ticket pages", () => {
    const pdf = generateTicketPdf({
      booking: {
        id: "booking-1",
        payerEmail: "payer@example.com",
        payerFullName: "Jane Doe"
      },
      event: {
        title: "Track Night",
        venue: "Dubai Autodrome",
        start_at: "2099-05-01T17:00:00.000Z",
        end_at: "2099-05-01T19:00:00.000Z",
        timezone: "Asia/Dubai",
        form_config: null
      },
      attendees: [
        {
          registrationId: "registration-1",
          fullName: "First Attendee",
          qrToken: "qr-token-1",
          manualCheckinCode: "AAAA",
          categoryTitle: "General Admission",
          ticketTitle: null,
          email: "first@example.com"
        },
        {
          registrationId: "registration-2",
          fullName: "Second Attendee",
          qrToken: "qr-token-2",
          manualCheckinCode: "BBBB",
          categoryTitle: "General Admission",
          ticketTitle: "Bootcamp",
          email: "second@example.com"
        }
      ],
      ticketToken: "ticket-token",
      ticketUrl: "https://example.com/tickets/ticket-token"
    });

    const text = pdf.toString("utf8");
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text).toContain("/Count 2");
    expect(text).toContain("First Attendee");
    expect(text).toContain("Second Attendee");
  });

  it("rejects ticket links after nonce rotation", async () => {
    testState.booking = fulfilledBooking({ ticket_access_nonce: "rotated-nonce" });
    const token = signTicketAccessToken({
      bookingIntentId: "booking-1",
      nonce: "nonce-1"
    });

    await expect(getTicketWalletByToken(token)).resolves.toBeNull();
  });

  it("does not expose cancelled bookings through ticket links", async () => {
    testState.booking = fulfilledBooking({ status: "cancelled" });
    const token = signTicketAccessToken({
      bookingIntentId: "booking-1",
      nonce: "nonce-1"
    });

    await expect(getTicketWalletByToken(token)).resolves.toBeNull();
  });

  it("treats missing ticket booking rows as invalid links", async () => {
    const token = signTicketAccessToken({
      bookingIntentId: "missing-booking",
      nonce: "nonce-1"
    });

    await expect(getTicketWalletByToken(token)).resolves.toBeNull();
  });

  it("creates user resend delivery jobs only after resend rate limits pass", async () => {
    testState.booking = fulfilledBooking();
    const token = signTicketAccessToken({
      bookingIntentId: "booking-1",
      nonce: "nonce-1"
    });

    const result = await createTicketResendDelivery({
      ticketToken: token,
      ipAddress: "203.0.113.10"
    });

    expect(result).toEqual({
      ok: true,
      message: "Ticket email queued for resend.",
      status: 202
    });
    expect(testState.rpcCalls.map((call) => call.fn)).toEqual([
      "check_checkout_rate_limit",
      "check_checkout_rate_limit",
      "create_ticket_delivery_job"
    ]);
    expect(testState.rpcCalls[2].args).toMatchObject({
      p_booking_intent_id: "booking-1",
      p_delivery_kind: "user_resend",
      p_recipient_email: "payer@example.com"
    });
  });

  it("blocks user resend delivery jobs when resend rate limits fail", async () => {
    testState.booking = fulfilledBooking();
    testState.rateLimitAllowed = false;
    const token = signTicketAccessToken({
      bookingIntentId: "booking-1",
      nonce: "nonce-1"
    });

    const result = await createTicketResendDelivery({
      ticketToken: token,
      ipAddress: "203.0.113.10"
    });

    expect(result).toEqual({
      ok: false,
      message: "Too many resend requests. Please try again later.",
      status: 429
    });
    expect(testState.rpcCalls.map((call) => call.fn)).toEqual([
      "check_checkout_rate_limit",
      "check_checkout_rate_limit"
    ]);
  });
});
