import { beforeEach, describe, expect, it, vi } from "vitest";

const testState = vi.hoisted(() => ({
  isDemoMode: false,
  beforeEvent: null as Record<string, unknown> | null,
  registrationSummary: {
    count: 0,
    ticketCounts: {} as Record<string, number>,
    categoryCounts: {} as Record<string, number>
  },
  eventGroupSlugCollision: false,
  lastUpdatePayload: null as Record<string, unknown> | null,
  auditRows: [] as Array<Record<string, unknown>>
}));

vi.mock("@/lib/demo-mode", () => ({
  isDemoMode: () => testState.isDemoMode
}));

vi.mock("@/lib/demo-data", () => ({
  demoEventGroups: [],
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

      if (table === "event_groups") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: testState.eventGroupSlugCollision ? { id: "event-category-1" } : null,
                error: null
              }))
            }))
          }))
        };
      }

      if (table === "event_categories" || table === "event_addons") {
        return {
          upsert: vi.fn(async () => ({ error: null })),
          update: vi.fn(() => ({
            eq: vi.fn(() => ({
              not: vi.fn(async () => ({ error: null }))
            }))
          }))
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    }
  })
}));

import { createEvent, updateEvent } from "@/services/admin";

type UpdateEventInput = Parameters<typeof updateEvent>[0];

function createBeforeEvent() {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    event_group_id: "22222222-2222-4222-8222-222222222222",
    slug: "track-day-april-2026",
    title: "Track Day",
    description: "Previous description",
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
      categoriesLabel: "Ticket type",
      ticketOptionsLabel: "Activity category",
      categories: [
        {
          id: "track-access",
          title: "Track access",
          description: "Track access",
          note: null,
          badge: null,
          capacity: null,
          soldOut: false
        }
      ],
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
    eventGroupId: "22222222-2222-4222-8222-222222222222",
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
    categoriesLabel: "Ticket type",
    ticketOptionsLabel: "Activity category",
    categories: [
      {
        id: "track-access",
        title: "Track access",
        description: "Track access",
        note: "",
        badge: "",
        capacity: null,
        soldOut: false
      }
    ],
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
      categoryCounts: { "track-access": 2 }
    };
    testState.eventGroupSlugCollision = false;
    testState.lastUpdatePayload = null;
    testState.auditRows = [];
  });

  it("rejects event slugs that would collide with category URLs", async () => {
    testState.eventGroupSlugCollision = true;

    await expect(updateEvent(createUpdateInput(), actor)).rejects.toThrow(
      "Event slug cannot match an event category slug"
    );

    expect(testState.lastUpdatePayload).toBeNull();
    expect(testState.auditRows).toHaveLength(0);
  });

  it("rejects removing and recreating an activity category that already has registrations", async () => {
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
    )).rejects.toThrow("Cannot remove activity category");

    expect(testState.lastUpdatePayload).toBeNull();
    expect(testState.auditRows).toHaveLength(0);
  });

  it("ignores activity category capacity because activity is a preference", async () => {
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
    )).resolves.toBeTruthy();

    const formConfig = testState.lastUpdatePayload?.form_config as { ticketOptions?: Array<{ capacity?: number | null }> };
    expect(formConfig.ticketOptions?.[0]?.capacity).toBeNull();
    expect(testState.auditRows).toHaveLength(1);
  });

  it("syncs the form description to event description and booking paragraphs", async () => {
    await updateEvent(
      createUpdateInput({
        descriptionText: "First paragraph.\n\nSecond paragraph."
      }),
      actor
    );

    const formConfig = testState.lastUpdatePayload?.form_config as { descriptionParagraphs?: string[] };
    expect(testState.lastUpdatePayload?.description).toBe("First paragraph.\n\nSecond paragraph.");
    expect(formConfig.descriptionParagraphs).toEqual(["First paragraph.", "Second paragraph."]);
  });

  it("syncs the form description when creating an event", async () => {
    testState.isDemoMode = true;

    const created = await createEvent(
      createUpdateInput({
        id: undefined,
        status: "draft",
        descriptionText: "Created description.\n\nShown publicly."
      }),
      actor
    );

    expect(created.description).toBe("Created description.\n\nShown publicly.");
    expect(created.form_config?.descriptionParagraphs).toEqual(["Created description.", "Shown publicly."]);
  });
});
