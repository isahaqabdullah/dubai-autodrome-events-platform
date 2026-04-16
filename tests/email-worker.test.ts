import { beforeEach, describe, expect, it, vi } from "vitest";
import { runEmailWorker } from "@/services/email-worker";

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
  buildGroupConfirmationEmail: vi.fn()
}));

vi.mock("@/services/mailer", () => ({
  sendMail: vi.fn()
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
    testState.updateCalls = [];
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
      swept: 0
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
});
