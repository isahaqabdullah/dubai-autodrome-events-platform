import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EventRecord } from "@/lib/types";
import { confirmRegistrationFromOtp, startRegistrationAttempt, verifyOtp } from "@/services/registration";

const testState = vi.hoisted(() => {
  const state = {
    isDemoMode: false,
    rateLimitAllowed: true,
    event: null as EventRecord | null,
    registrationSummary: {
      count: 0,
      ticketCounts: {} as Record<string, number>,
      categoryCounts: {} as Record<string, number>
    },
    existingRegistrationResult: {
      data: null as { id: string } | null,
      error: null as { message: string } | null
    },
    reusableVerifiedPendingResult: {
      data: null as {
        id: string;
        verification_expires_at: string;
        verified_at: string | null;
        email_verified_at: string | null;
      } | null,
      error: null as { message: string } | null
    },
    pendingRegistrationResult: {
      data: {
        id: "pending-1",
        verification_expires_at: "2099-01-01T00:00:00.000Z",
        verified_at: null,
        email_verified_at: null
      } as {
        id: string;
        verification_expires_at: string;
        verified_at: string | null;
        email_verified_at: string | null;
      } | null,
      error: null as { message: string } | null
    },
    insertError: null as { message: string } | null,
    pendingUpdateError: null as { message: string } | null,
    pendingInsert: null as unknown as any,
    pendingUpdate: null as unknown as any,
    lastPendingUpdateValues: null as Record<string, unknown> | null,
    rpcData: [
      {
        outcome: "confirmed",
        registration_id: "registration-1",
        event_id: "event-1",
        full_name: "Jane Doe",
        email_raw: "jane@example.com"
      }
    ] as Array<Record<string, unknown>>,
    rpcError: null as { message: string } | null,
    lastRpcArgs: null as Record<string, unknown> | null,
    executeEmailJob: vi.fn(async (_kind: string, _payload: Record<string, unknown>, handler: (job: { id: string }) => Promise<void>) => {
      await handler({ id: "job-1" });
    }),
    enqueueEmailJob: vi.fn(async () => {}),
    sendMail: vi.fn(async () => {})
  };

  state.pendingInsert = vi.fn(async (_values: Record<string, unknown>) => ({ error: state.insertError }));
  state.pendingUpdate = vi.fn((values: Record<string, unknown>) => ({
    eq: vi.fn(async (_column: string, _value: string) => {
      state.lastPendingUpdateValues = values;
      return { error: state.pendingUpdateError };
    })
  }));

  return state;
});

vi.mock("@/lib/demo-mode", () => ({
  isDemoMode: () => testState.isDemoMode
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: () => ({ allowed: testState.rateLimitAllowed })
}));

vi.mock("@/services/events", () => ({
  getEventById: vi.fn(async () => testState.event),
  getRegistrationSummaryForEvent: vi.fn(async () => testState.registrationSummary)
}));

vi.mock("@/services/email-jobs", () => ({
  executeEmailJob: testState.executeEmailJob,
  enqueueEmailJob: testState.enqueueEmailJob
}));

vi.mock("@/services/email-templates", () => ({
  buildVerificationEmail: () => ({
    subject: "Verify your email",
    html: "<p>123456</p>",
    text: "123456"
  })
}));

vi.mock("@/services/mailer", () => ({
  sendMail: testState.sendMail
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: () => ({
    from(table: string) {
      if (table === "registrations") {
        return {
          select() {
            return {
              eq() {
                return this;
              },
              limit() {
                return this;
              },
              maybeSingle: async () => testState.existingRegistrationResult
            };
          }
        };
      }

      if (table === "pending_registrations") {
        return {
          select() {
            const state = {
              eqFilters: {} as Record<string, unknown>,
              isFilters: {} as Record<string, unknown>,
              notFilters: {} as Record<string, unknown>
            };

            return {
              eq(column: string, value: unknown) {
                state.eqFilters[column] = value;
                return this;
              },
              is(column: string, value: unknown) {
                state.isFilters[column] = value;
                return this;
              },
              not(column: string, _operator: string, value: unknown) {
                state.notFilters[column] = value;
                return this;
              },
              order() {
                return this;
              },
              limit() {
                return this;
              },
              maybeSingle: async () => {
                if ("verification_token_hash" in state.eqFilters) {
                  return testState.pendingRegistrationResult;
                }

                if ("email_verified_at" in state.notFilters || ("verified_at" in state.isFilters && state.isFilters.verified_at === null)) {
                  return testState.reusableVerifiedPendingResult;
                }

                return testState.pendingRegistrationResult;
              }
            };
          },
          insert: testState.pendingInsert,
          update: testState.pendingUpdate
        };
      }

      throw new Error(`Unexpected table in test mock: ${table}`);
    },
    rpc: async (_fn: string, args: Record<string, unknown>) => {
      testState.lastRpcArgs = args;
      return { data: testState.rpcData, error: testState.rpcError };
    }
  })
}));

function createEvent(overrides: Partial<EventRecord> = {}): EventRecord {
  return {
    id: "event-1",
    slug: "single-attendee-flow",
    title: "Single Attendee Flow",
    description: null,
    venue: "Dubai",
    timezone: "Asia/Dubai",
    start_at: "2099-05-01T17:00:00.000Z",
    end_at: "2099-05-01T19:00:00.000Z",
    registration_opens_at: "2020-04-01T08:00:00.000Z",
    registration_closes_at: "2099-04-30T16:00:00.000Z",
    status: "open",
    capacity: 10,
    declaration_version: 1,
    declaration_text: "Terms and conditions for the single attendee flow.",
    form_config: {
      categories: [
        {
          id: "general-admission",
          title: "General Admission",
          description: "Base ticket",
          capacity: 5
        }
      ],
      ticketOptions: [
        {
          id: "addon-session",
          title: "Add-on Session",
          description: "Optional extra session",
          capacity: 2
        }
      ]
    },
    created_at: "2099-03-01T08:00:00.000Z",
    updated_at: "2099-03-01T08:00:00.000Z",
    ...overrides
  };
}

function createStartInput(overrides: Record<string, unknown> = {}) {
  return {
    eventId: "event-1",
    selectedTicketId: "general-admission",
    selectedTicketTitle: "General Admission",
    categoryId: "general-admission",
    categoryTitle: "General Admission",
    fullName: "Jane Doe",
    email: "jane@example.com",
    phone: "",
    website: "",
    ...overrides
  };
}

function createConfirmInput(overrides: Record<string, unknown> = {}) {
  return {
    eventId: "event-1",
    selectedTicketId: "general-admission",
    selectedTicketTitle: "General Admission",
    categoryId: "general-admission",
    categoryTitle: "General Admission",
    fullName: "Jane Doe",
    email: "jane@example.com",
    phone: "+971-50-555-1234",
    age: 28,
    uaeResident: true,
    declarationAccepted: true as const,
    otp: "123456",
    ...overrides
  };
}

describe("registration service single-attendee selection rules", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testState.isDemoMode = false;
    testState.rateLimitAllowed = true;
    testState.event = createEvent();
    testState.registrationSummary = {
      count: 0,
      ticketCounts: {},
      categoryCounts: {}
    };
    testState.existingRegistrationResult = { data: null, error: null };
    testState.reusableVerifiedPendingResult = { data: null, error: null };
    testState.pendingRegistrationResult = {
      data: {
        id: "pending-1",
        verification_expires_at: "2099-01-01T00:00:00.000Z",
        verified_at: null,
        email_verified_at: null
      },
      error: null
    };
    testState.insertError = null;
    testState.pendingUpdateError = null;
    testState.lastPendingUpdateValues = null;
    testState.lastRpcArgs = null;
    testState.rpcData = [
      {
        outcome: "confirmed",
        registration_id: "registration-1",
        event_id: "event-1",
        full_name: "Jane Doe",
        email_raw: "jane@example.com"
      }
    ];
    testState.rpcError = null;
  });

  it("rejects a full base category during start", async () => {
    testState.registrationSummary = {
      count: 1,
      ticketCounts: {},
      categoryCounts: { "general-admission": 5 }
    };

    const result = await startRegistrationAttempt(createStartInput(), {
      ipAddress: "127.0.0.1",
      userAgent: "vitest"
    });

    expect(result.outcome).toBe("capacity_exceeded");
    expect(result.message).toContain("General Admission");
  });

  it("rejects a sold-out base category during start", async () => {
    testState.event = createEvent({
      form_config: {
        categories: [
          {
            id: "general-admission",
            title: "General Admission",
            description: "Base ticket",
            soldOut: true
          }
        ],
        ticketOptions: []
      }
    });

    const result = await startRegistrationAttempt(createStartInput(), {
      ipAddress: "127.0.0.1",
      userAgent: "vitest"
    });

    expect(result.outcome).toBe("invalid_ticket");
    expect(result.message).toContain("General Admission");
  });

  it("rejects a full additional category during start", async () => {
    testState.registrationSummary = {
      count: 1,
      ticketCounts: { "addon-session": 2 },
      categoryCounts: {}
    };

    const result = await startRegistrationAttempt(
      createStartInput({
        selectedTicketId: "addon-session",
        selectedTicketTitle: "Add-on Session"
      }),
      {
        ipAddress: "127.0.0.1",
        userAgent: "vitest"
      }
    );

    expect(result.outcome).toBe("capacity_exceeded");
    expect(result.message).toContain("Add-on Session");
  });

  it("rejects a sold-out additional category during start", async () => {
    testState.event = createEvent({
      form_config: {
        categories: [
          {
            id: "general-admission",
            title: "General Admission",
            description: "Base ticket"
          }
        ],
        ticketOptions: [
          {
            id: "addon-session",
            title: "Add-on Session",
            description: "Optional extra session",
            soldOut: true
          }
        ]
      }
    });

    const result = await startRegistrationAttempt(
      createStartInput({
        selectedTicketId: "addon-session",
        selectedTicketTitle: "Add-on Session"
      }),
      {
        ipAddress: "127.0.0.1",
        userAgent: "vitest"
      }
    );

    expect(result.outcome).toBe("invalid_ticket");
    expect(result.message).toContain("Add-on Session");
  });

  it("returns already_verified during start when the email is already verified for the event", async () => {
    testState.reusableVerifiedPendingResult = {
      data: {
        id: "pending-verified",
        verification_expires_at: "2099-01-01T00:00:00.000Z",
        verified_at: null,
        email_verified_at: "2099-01-01T00:00:00.000Z"
      },
      error: null
    };

    const result = await startRegistrationAttempt(createStartInput(), {
      ipAddress: "127.0.0.1",
      userAgent: "vitest"
    });

    expect(result.outcome).toBe("already_verified");
    expect(result.message).toBe("Email already verified for this event.");
    expect(testState.executeEmailJob).not.toHaveBeenCalled();
    expect(testState.pendingInsert).not.toHaveBeenCalled();
  });

  it("persists email verification when OTP validation succeeds", async () => {
    const result = await verifyOtp({
      eventId: "event-1",
      email: "jane@example.com",
      otp: "123456"
    });

    expect(result.valid).toBe(true);
    expect(testState.lastPendingUpdateValues).toEqual({
      email_verified_at: expect.any(String)
    });
  });

  it("returns capacity_exceeded during confirm when the category fills up after OTP send", async () => {
    testState.rpcData = [
      {
        outcome: "capacity_exceeded",
        registration_id: null,
        event_id: "event-1",
        full_name: "Jane Doe",
        email_raw: "jane@example.com"
      }
    ];

    const result = await confirmRegistrationFromOtp(createConfirmInput(), {
      ipAddress: "127.0.0.1",
      userAgent: "vitest"
    });

    expect(result.outcome).toBe("capacity_exceeded");
    expect(result.message).toContain("no longer available");
  });

  it("confirms a single-attendee booking without a fresh OTP when the email is already verified", async () => {
    testState.reusableVerifiedPendingResult = {
      data: {
        id: "pending-verified",
        verification_expires_at: "2099-01-01T00:00:00.000Z",
        verified_at: null,
        email_verified_at: "2099-01-01T00:00:00.000Z"
      },
      error: null
    };

    const result = await confirmRegistrationFromOtp(createConfirmInput({ otp: undefined }), {
      ipAddress: "127.0.0.1",
      userAgent: "vitest"
    });

    expect(result.outcome).toBe("confirmed");
    expect(testState.lastRpcArgs?.p_verification_code_hash).toBeNull();
  });

  it("confirms a single-attendee booking with no additional category", async () => {
    const result = await confirmRegistrationFromOtp(createConfirmInput(), {
      ipAddress: "127.0.0.1",
      userAgent: "vitest"
    });

    expect(result.outcome).toBe("confirmed");
    expect(result.attendees).toHaveLength(1);
    expect(result.attendees?.[0]?.categoryTitle).toBe("General Admission");
    expect(result.attendees?.[0]?.ticketTitle).toBeNull();
    expect(testState.enqueueEmailJob).toHaveBeenCalledTimes(1);
  });
});
