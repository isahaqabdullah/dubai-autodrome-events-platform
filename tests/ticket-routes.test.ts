import { beforeEach, describe, expect, it, vi } from "vitest";

const testState = vi.hoisted(() => ({
  wallet: null as Record<string, unknown> | null,
  resendResult: {
    ok: true,
    message: "Ticket email queued for resend.",
    status: 202
  },
  pdfThrows: false,
  updates: [] as Array<{ table: string; values: Record<string, unknown>; column: string; value: string }>
}));

vi.mock("@/lib/env", () => ({
  env: {
    RESEND_WEBHOOK_SECRET: "webhook-secret"
  }
}));

vi.mock("@/lib/request", () => ({
  getClientIp: () => "203.0.113.10"
}));

vi.mock("@/services/tickets", () => ({
  getTicketWalletByToken: vi.fn(async () => testState.wallet),
  createTicketResendDelivery: vi.fn(async () => testState.resendResult)
}));

vi.mock("@/services/ticket-pdf", () => ({
  generateTicketPdf: vi.fn(() => {
    if (testState.pdfThrows) {
      throw new Error("PDF renderer failed");
    }
    return Buffer.from("%PDF-1.4\n%%EOF", "utf8");
  })
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: () => ({
    from(table: string) {
      return {
        update(values: Record<string, unknown>) {
          return {
            eq: vi.fn(async (column: string, value: string) => {
              testState.updates.push({ table, values, column, value });
              return { error: null };
            })
          };
        }
      };
    }
  })
}));

import { GET as getTicketPdf } from "@/app/api/tickets/pdf/route";
import { POST as postTicketResend } from "@/app/api/tickets/resend/route";
import { POST as postResendWebhook } from "@/app/api/email-events/resend/route";

function walletFixture() {
  return {
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
  };
}

describe("ticket routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testState.wallet = null;
    testState.resendResult = {
      ok: true,
      message: "Ticket email queued for resend.",
      status: 202
    };
    testState.pdfThrows = false;
    testState.updates = [];
  });

  it("returns ticket PDFs with private no-store security headers", async () => {
    testState.wallet = walletFixture();

    const response = await getTicketPdf(new Request("http://localhost/api/tickets/pdf?token=ticket-token"));

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("keeps PDF failures contained to the PDF endpoint", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    testState.wallet = walletFixture();
    testState.pdfThrows = true;

    try {
      const response = await getTicketPdf(new Request("http://localhost/api/tickets/pdf?token=ticket-token"));
      const body = await response.json() as { message: string };

      expect(response.status).toBe(500);
      expect(body.message).toBe("Unable to generate ticket PDF right now.");
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("returns 404 for invalid ticket PDF tokens", async () => {
    const response = await getTicketPdf(new Request("http://localhost/api/tickets/pdf?token=bad-token"));

    expect(response.status).toBe(404);
  });

  it("returns resend route status from the ticket resend service", async () => {
    testState.resendResult = {
      ok: false,
      message: "Too many resend requests. Please try again later.",
      status: 429
    };

    const response = await postTicketResend(new Request("http://localhost/api/tickets/resend", {
      method: "POST",
      body: JSON.stringify({ token: "ticket-token" })
    }));
    const body = await response.json() as { ok: boolean; message: string };

    expect(response.status).toBe(429);
    expect(body).toEqual({
      ok: false,
      message: "Too many resend requests. Please try again later."
    });
  });

  it("requires webhook authorization before marking bounced deliveries", async () => {
    const unauthorized = await postResendWebhook(new Request("http://localhost/api/email-events/resend", {
      method: "POST",
      body: JSON.stringify({ type: "email.bounced", data: { email_id: "provider-1" } })
    }));

    expect(unauthorized.status).toBe(401);
    expect(testState.updates).toEqual([]);

    const authorized = await postResendWebhook(new Request("http://localhost/api/email-events/resend", {
      method: "POST",
      headers: { authorization: "Bearer webhook-secret" },
      body: JSON.stringify({ type: "email.bounced", data: { email_id: "provider-1" } })
    }));

    expect(authorized.status).toBe(200);
    expect(testState.updates).toContainEqual({
      table: "ticket_delivery_jobs",
      column: "provider_message_id",
      value: "provider-1",
      values: expect.objectContaining({
        status: "bounced",
        last_error: "Provider reported bounced."
      })
    });
  });
});
