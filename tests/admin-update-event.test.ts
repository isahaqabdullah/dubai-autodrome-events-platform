import { beforeEach, describe, expect, it, vi } from "vitest";

const testState = vi.hoisted(() => ({
  isDemoMode: false,
  beforeEvent: null as Record<string, unknown> | null,
  registrationSummary: {
    count: 0,
    ticketCounts: {} as Record<string, number>,
    categoryCounts: {} as Record<string, number>
  },
  lastUpdatePayload: null as Record<string, unknown> | null,
  auditRows: [] as Array<Record<string, unknown>>
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
  }
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

vi.mock("@/services/events", () => ({
  getRegistrationSummaryForEvent: vi.fn(async () => testState.registrationSummary)
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: () => ({
    from(table: string) {
      if (table === "events") {
        return {
          select() {
            return {
              eq() {
                return {
                  single: vi.fn(async () => ({
                    data: testState.beforeEvent,
                    error: null
                  }))
                };
              }
            };
          },
          update(payload: Record<string, unknown>) {
            testState.lastUpdatePayload = payload;
            return {
              eq() {
                return {
                  select() {
                    return {
                      single: vi.fn(async () => ({
                        data: { ...(testState.beforeEvent ?? {}), ...payload },
                        error: null
                      }))
                    };
                  }
                };
              }
            };
          }
        };
      }

      if (table === "audit_logs") {
        return {
          insert: vi.fn(async (payload: Record<string, unknown>) => {
            testState.auditRows.push(payload);
            return { error: null };
          })
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    }
  })
}));

import { updateEvent } from "@/services/admin";

type UpdateEventInput = Parameters<typeof updateEvent>[0];

function createBeforeEvent() {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    slug: "track-day-april-2026",
    title: "Track Day",
    venue: "Dubai Autodrome",
    timezone: "Asia/Dubai",
    start_at: "2026-04-24T12:00:00.000Z",
    end_at: "2026-04-24T14:00:00.000Z",
    registration_opens_at: null,
    registration_closes_at: null,
    status: "open",
    capacity: 10,
    declaration_version: 1,
    declaration_text: "Terms and conditions for the track day event.",
    form_config: {
      submitLabel: "Reserve my spot",
      categories: [],
      ticketOptions: [
        {
          id: "addon-session",
          title: "Add-on Session",
          description: "Optional extra session",
          note: null,
          badge: null,
          capacity: 2,
          soldOut: false
        }
      ]
    },
    created_at: "2026-04-20T00:00:00.000Z",
    updated_at: "2026-04-20T00:00:00.000Z"
  };
}

function createUpdateInput(overrides: Partial<UpdateEventInput> = {}): UpdateEventInput {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    slug: "track-day-april-2026",
    title: "Track Day",
    venue: "Dubai Autodrome",
    timezone: "Asia/Dubai",
    startAt: "2026-04-24T16:00",
    endAt: "2026-04-24T18:00",
    registrationOpensAt: "",
    registrationClosesAt: "",
    status: "open",
    capacity: "10",
    declarationVersion: 1,
    declarationText: "Terms and conditions for the track day event.",
    submitLabel: "Reserve my spot",
    mapLink: "",
    categoriesLabel: "",
    ticketOptionsLabel: "Additional category",
    categories: [],
    ticketOptions: [
      {
        id: "addon-session",
        title: "Add-on Session",
        description: "Optional extra session",
        note: "",
        badge: "",
        capacity: 2,
        soldOut: false
      }
    ],
    posterImage: "",
    introLine: "",
    descriptionText: "",
    emailIntroLine: "",
    emailDescriptionText: "",
    disclaimerPdfUrl: "",
    disclaimerHeading: "",
    ...overrides
  };
}

const actor = {
  id: "user-1",
  email: "admin@example.com",
  role: "admin",
  gateName: "Main gate"
} as const;

describe("updateEvent", () => {
  beforeEach(() => {
    testState.isDemoMode = false;
    testState.beforeEvent = createBeforeEvent();
    testState.registrationSummary = {
      count: 2,
      ticketCounts: { "addon-session": 2 },
      categoryCounts: {}
    };
    testState.lastUpdatePayload = null;
    testState.auditRows = [];
  });

  it("rejects removing and recreating an add-on that already has registrations", async () => {
    await expect(updateEvent(
      createUpdateInput({
        ticketOptions: [
          {
            id: "addon-session-v2",
            title: "Add-on Session",
            description: "Optional extra session",
            note: "",
            badge: "",
            capacity: 2,
            soldOut: false
          }
        ]
      }),
      actor
    )).rejects.toThrow("Cannot remove additional category");

    expect(testState.lastUpdatePayload).toBeNull();
    expect(testState.auditRows).toHaveLength(0);
  });

  it("rejects lowering an add-on capacity below current usage", async () => {
    await expect(updateEvent(
      createUpdateInput({
        ticketOptions: [
          {
            id: "addon-session",
            title: "Add-on Session",
            description: "Optional extra session",
            note: "",
            badge: "",
            capacity: 1,
            soldOut: false
          }
        ]
      }),
      actor
    )).rejects.toThrow('Additional category "Add-on Session" capacity cannot be set below 2');

    expect(testState.lastUpdatePayload).toBeNull();
    expect(testState.auditRows).toHaveLength(0);
  });
});
