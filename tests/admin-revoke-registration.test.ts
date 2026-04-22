import { beforeEach, describe, expect, it, vi } from "vitest";

const testState = vi.hoisted(() => ({
  isDemoMode: false,
  registrations: [] as Array<Record<string, unknown>>,
  checkins: [] as Array<Record<string, unknown>>,
  auditLogs: [] as Array<Record<string, unknown>>
}));

vi.mock("@/lib/demo-mode", () => ({
  isDemoMode: () => testState.isDemoMode
}));

vi.mock("@/lib/demo-data", () => ({
  demoEvents: [],
  demoRegistrations: []
}));

vi.mock("@/lib/env", () => ({
  env: {
    APP_URL: "https://example.com",
    MAIL_FROM_EMAIL: "info@example.com",
    MAIL_FROM_NAME: "Example",
    MAIL_REPLY_TO_EMAIL: "info@example.com",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
    NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-key"
  },
  resendConfigured: false
}));

vi.mock("@/lib/qr", () => ({
  buildQrEmailAttachment: vi.fn(),
  buildQrEmailCid: vi.fn()
}));

vi.mock("@/lib/tokens", () => ({
  generateOpaqueToken: vi.fn(),
  hashOpaqueToken: vi.fn()
}));

vi.mock("@/services/email-templates", () => ({
  buildConfirmationEmail: vi.fn()
}));

vi.mock("@/services/email-jobs", () => ({
  executeEmailJob: vi.fn()
}));

vi.mock("@/services/mailer", () => ({
  sendMail: vi.fn()
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: () => ({
    from(table: string) {
      if (table === "registrations") {
        return {
          select() {
            let idFilter: string | null = null;

            const chain = {
              eq(column: string, value: unknown) {
                if (column === "id") {
                  idFilter = String(value);
                }
                return chain;
              },
              async single() {
                const row = testState.registrations.find((registration) => registration.id === idFilter) ?? null;
                return row
                  ? { data: row, error: null }
                  : { data: null, error: { message: "Registration not found." } };
              }
            };

            return chain;
          },
          delete() {
            return {
              async eq(column: string, value: unknown) {
                if (column === "id") {
                  testState.registrations = testState.registrations.filter((row) => row.id !== value);
                }

                return { error: null };
              }
            };
          }
        };
      }

      if (table === "checkins") {
        return {
          delete() {
            return {
              async eq(column: string, value: unknown) {
                if (column === "registration_id") {
                  testState.checkins = testState.checkins.filter((row) => row.registration_id !== value);
                }

                return { error: null };
              }
            };
          }
        };
      }

      if (table === "audit_logs") {
        return {
          async insert(payload: Record<string, unknown>) {
            testState.auditLogs.push(payload);
            return { error: null };
          }
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    }
  })
}));

import { revokeRegistration } from "@/services/admin";

describe("revokeRegistration", () => {
  beforeEach(() => {
    testState.isDemoMode = false;
    testState.registrations = [];
    testState.checkins = [];
    testState.auditLogs = [];
  });

  it("hard deletes the registration and linked check-in activity", async () => {
    testState.registrations = [
      {
        id: "registration-1",
        event_id: "event-1",
        full_name: "Attendee One",
        status: "registered"
      },
      {
        id: "registration-2",
        event_id: "event-1",
        full_name: "Attendee Two",
        status: "registered"
      }
    ];
    testState.checkins = [
      {
        id: "checkin-1",
        registration_id: "registration-1",
        event_id: "event-1"
      },
      {
        id: "checkin-2",
        registration_id: "registration-2",
        event_id: "event-1"
      }
    ];

    const result = await revokeRegistration(
      "registration-1",
      {
        id: "admin-1",
        email: "admin@example.com",
        role: "admin",
        gateName: "Main gate"
      },
      "Requested removal"
    );

    expect(result).toEqual({
      id: "registration-1",
      deleted: true,
      reason: "Requested removal"
    });
    expect(testState.registrations).toEqual([
      expect.objectContaining({
        id: "registration-2"
      })
    ]);
    expect(testState.checkins).toEqual([
      expect.objectContaining({
        id: "checkin-2"
      })
    ]);
    expect(testState.auditLogs).toEqual([
      expect.objectContaining({
        action: "registration.deleted",
        entity_type: "registration",
        entity_id: "registration-1",
        before_json: expect.objectContaining({
          id: "registration-1",
          full_name: "Attendee One"
        }),
        after_json: {
          deleted: true,
          delete_reason: "Requested removal"
        }
      })
    ]);
  });
});
