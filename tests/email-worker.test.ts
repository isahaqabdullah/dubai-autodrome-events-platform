import { beforeEach, describe, expect, it, vi } from "vitest";
import { runEmailWorker } from "@/services/email-worker";
import { buildTicketDeliveryEmail } from "@/services/email-templates";
import { sendMail } from "@/services/mailer";
import { getTicketWalletByBookingId } from "@/services/tickets";

const testState = vi.hoisted(() => ({
  jobs: [
    {
      id: "job-1",
      kind: "registration_confirmed",
      payload: {
        registrationId: "registration-1",
        eventId: "event-1",
        email: "jane@example.com",
        fullName: "Jane Doe",
        qrToken: "qr-token",
        manualCheckinCode: "ABCD",
        ticketTitle: "General Admission"
      },
      attempts: 1,
      attempts_max: 3
    }
  ] as Array<Record<string, unknown>>,
  ticketJobs: [] as Array<Record<string, unknown>>,
  sweepCount: 0,
  updateCalls: [] as Array<{ table: string; values: Record<string, unknown>; id: string }>,
  eventError: {
    message: "relation \"events\" does not exist",
    code: "42P01",
    details: "Query referenced public.events before migrations were applied."
  } as { message: string; code?: string; details?: string }
}));

vi.mock("@/lib/env", () => ({
  env: {
    APP_URL: "https://example.com",
    RESEND_API_KEY: "test-key"
  }
}));

vi.mock("@/lib/ticket-presentation", () => ({
  DEFAULT_TICKET_POSTER_IMAGE: "/poster.png"
}));

vi.mock("@/lib/qr", () => ({
  buildQrEmailAttachment: vi.fn(),
  buildQrEmailCid: vi.fn()
}));

vi.mock("@/lib/utils", () => ({
  buildAbsoluteUrl: vi.fn((_base: string, path: string) => `https://example.com${path}`)
}));

vi.mock("@/services/email-templates", () => ({
  buildConfirmationEmail: vi.fn(),
  buildGroupConfirmationEmail: vi.fn(),
  buildTicketDeliveryEmail: vi.fn()
}));

vi.mock("@/services/mailer", () => ({
  sendMail: vi.fn()
}));

vi.mock("@/services/tickets", () => ({
  getTicketWalletByBookingId: vi.fn()
}));

vi.mock("@/services/events", () => ({
  getEventById: vi.fn(async () => {
    throw testState.eventError;
  })
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: () => ({
    rpc: vi.fn(async (fn: string) => {
      if (fn === "claim_email_jobs") {
        return { data: testState.jobs, error: null };
      }

      if (fn === "fail_exhausted_email_jobs") {
        return { data: testState.sweepCount, error: null };
      }

      if (fn === "claim_ticket_delivery_jobs") {
        return { data: testState.ticketJobs, error: null };
      }

      throw new Error(`Unexpected RPC in test: ${fn}`);
    }),
    from(table: string) {
      return {
        update(values: Record<string, unknown>) {
          return {
            eq: vi.fn(async (_column: string, id: string) => {
              testState.updateCalls.push({ table, values, id });
              return { error: null };
            })
          };
        }
      };
    }
  })
}));

describe("runEmailWorker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testState.updateCalls = [];
    testState.ticketJobs = [];
    testState.jobs = [
      {
        id: "job-1",
        kind: "registration_confirmed",
        payload: {
          registrationId: "registration-1",
          eventId: "event-1",
          email: "jane@example.com",
          fullName: "Jane Doe",
          qrToken: "qr-token",
          manualCheckinCode: "ABCD",
          ticketTitle: "General Admission"
        },
        attempts: 1,
        attempts_max: 3
      }
    ];
    testState.sweepCount = 0;
    testState.eventError = {
      message: "relation \"events\" does not exist",
      code: "42P01",
      details: "Query referenced public.events before migrations were applied."
    };
  });

  it("persists a readable failure message when the job throws a plain object", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await runEmailWorker();

    expect(result).toEqual({
      claimed: 1,
      sent: 0,
      requeued: 1,
      failed: 0,
      swept: 0,
      ticketClaimed: 0,
      ticketAccepted: 0,
      ticketRequeued: 0,
      ticketFailed: 0
    });

    expect(testState.updateCalls).toContainEqual({
      table: "email_jobs",
      id: "job-1",
      values: {
        status: "queued",
        last_error:
          "relation \"events\" does not exist | code=42P01 | details=Query referenced public.events before migrations were applied.",
        locked_at: null
      }
    });

    expect(errorSpy).toHaveBeenCalledWith("[email-worker] job failed", {
      jobId: "job-1",
      kind: "registration_confirmed",
      attempts: 1,
      attempts_max: 3,
      exhausted: false,
      error: {
        message: "relation \"events\" does not exist",
        code: "42P01",
        details: "Query referenced public.events before migrations were applied."
      }
    });

    errorSpy.mockRestore();
  });

  it("sends ticket delivery jobs from the outbox and marks the whole booking as emailed", async () => {
    testState.jobs = [];
    testState.ticketJobs = [{
      id: "delivery-1",
      booking_intent_id: "booking-1",
      delivery_kind: "automatic",
      delivery_version: 1,
      recipient_email: "payer@example.com",
      attempts: 1
    }];

    vi.mocked(getTicketWalletByBookingId).mockResolvedValue({
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
        form_config: { mapLink: "https://maps.example.com" }
      },
      attendees: [{
        registrationId: "registration-1",
        fullName: "Jane Doe",
        qrToken: "qr-token",
        manualCheckinCode: "ABCD",
        categoryTitle: "General Admission",
        ticketTitle: null,
        email: "payer@example.com"
      }],
      ticketToken: "ticket-token",
      ticketUrl: "https://example.com/tickets/ticket-token"
    });
    vi.mocked(buildTicketDeliveryEmail).mockReturnValue({
      subject: "Your tickets",
      html: "<p>tickets</p>",
      text: "tickets"
    });
    vi.mocked(sendMail).mockResolvedValue({
      ok: true,
      mode: "resend",
      providerMessageId: "provider-1"
    });

    const result = await runEmailWorker();

    expect(result.ticketAccepted).toBe(1);
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({
      to: "payer@example.com",
      subject: "Your tickets",
      idempotencyKey: "delivery-1"
    }));
    expect(testState.updateCalls).toContainEqual({
      table: "ticket_delivery_jobs",
      id: "delivery-1",
      values: expect.objectContaining({
        status: "accepted",
        provider_message_id: "provider-1"
      })
    });
    expect(testState.updateCalls).toContainEqual({
      table: "registrations",
      id: "booking-1",
      values: expect.objectContaining({
        confirmation_email_sent_at: expect.any(String)
      })
    });
  });

  it("requeues failed ticket deliveries for an immediate retry first", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-04T08:00:00.000Z"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    testState.jobs = [];
    testState.ticketJobs = [{
      id: "delivery-1",
      booking_intent_id: "booking-1",
      delivery_kind: "automatic",
      delivery_version: 1,
      recipient_email: "payer@example.com",
      attempts: 1
    }];

    vi.mocked(getTicketWalletByBookingId).mockResolvedValue({
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
        form_config: {}
      },
      attendees: [{
        registrationId: "registration-1",
        fullName: "Jane Doe",
        qrToken: "qr-token",
        manualCheckinCode: "ABCD",
        categoryTitle: "General Admission",
        ticketTitle: null
      }],
      ticketToken: "ticket-token",
      ticketUrl: "https://example.com/tickets/ticket-token"
    });
    vi.mocked(buildTicketDeliveryEmail).mockReturnValue({
      subject: "Your tickets",
      html: "<p>tickets</p>",
      text: "tickets"
    });
    vi.mocked(sendMail).mockRejectedValue(new Error("temporary provider failure"));

    try {
      const result = await runEmailWorker();

      expect(result.ticketRequeued).toBe(1);
      expect(testState.updateCalls).toContainEqual({
        table: "ticket_delivery_jobs",
        id: "delivery-1",
        values: {
          status: "pending",
          next_attempt_at: "2026-05-04T08:00:00.000Z",
          last_error: "temporary provider failure",
          locked_at: null
        }
      });
    } finally {
      errorSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  it("does not accept ticket delivery when the provider is only mocked", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    testState.jobs = [];
    testState.ticketJobs = [{
      id: "delivery-1",
      booking_intent_id: "booking-1",
      delivery_kind: "automatic",
      delivery_version: 1,
      recipient_email: "payer@example.com",
      attempts: 1
    }];

    vi.mocked(getTicketWalletByBookingId).mockResolvedValue({
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
        form_config: {}
      },
      attendees: [{
        registrationId: "registration-1",
        fullName: "Jane Doe",
        qrToken: "qr-token",
        manualCheckinCode: "ABCD",
        categoryTitle: "General Admission",
        ticketTitle: null
      }],
      ticketToken: "ticket-token",
      ticketUrl: "https://example.com/tickets/ticket-token"
    });
    vi.mocked(buildTicketDeliveryEmail).mockReturnValue({
      subject: "Your tickets",
      html: "<p>tickets</p>",
      text: "tickets"
    });
    vi.mocked(sendMail).mockResolvedValue({
      ok: true,
      mode: "mock",
      providerMessageId: null
    });

    try {
      const result = await runEmailWorker();

      expect(result.ticketAccepted).toBe(0);
      expect(result.ticketRequeued).toBe(1);
      expect(testState.updateCalls).toContainEqual({
        table: "ticket_delivery_jobs",
        id: "delivery-1",
        values: expect.objectContaining({
          status: "pending",
          last_error: "Ticket email provider is not configured; delivery was not accepted by an email provider.",
          locked_at: null
        })
      });
    } finally {
      errorSpy.mockRestore();
    }
  });
});
