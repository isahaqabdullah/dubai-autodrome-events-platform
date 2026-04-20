import { beforeEach, describe, expect, it, vi } from "vitest";

const testState = vi.hoisted(() => ({
  isDemoMode: false,
  data: [] as Array<Record<string, unknown>>,
  error: null as { message: string } | null,
  selectCalls: [] as Array<{ columns: string; options?: Record<string, unknown> }>,
  eqCalls: [] as Array<{ column: string; value: unknown }>,
  orCalls: [] as string[],
  orderCalls: [] as Array<{ column: string; ascending: boolean }>,
  rangeCalls: [] as Array<{ from: number; to: number }>
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

vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: () => ({
    from(table: string) {
      if (table !== "registrations") {
        throw new Error(`Unexpected table: ${table}`);
      }

      return {
        select(selectString: string, options?: Record<string, unknown>) {
          testState.selectCalls.push({ columns: selectString, options });

          const predicates: Array<(row: Record<string, unknown>) => boolean> = [];
          let orderColumn: string | null = null;
          let ascending = true;

          const chain = {
            eq(column: string, value: unknown) {
              testState.eqCalls.push({ column, value });
              predicates.push((row) => row[column] === value);
              return chain;
            },
            or(filterString: string) {
              testState.orCalls.push(filterString);
              const needle = /%([^%]+)%/.exec(filterString)?.[1]?.toLowerCase() ?? "";
              predicates.push((row) =>
                [row.full_name, row.email_raw, row.phone].some((value) =>
                  String(value ?? "")
                    .toLowerCase()
                    .includes(needle)
                )
              );
              return chain;
            },
            order(column: string, orderOptions?: { ascending?: boolean }) {
              ascending = orderOptions?.ascending ?? true;
              orderColumn = column;
              testState.orderCalls.push({ column, ascending });
              return chain;
            },
            async range(from: number, to: number) {
              testState.rangeCalls.push({ from, to });

              const filtered = [...testState.data]
                .filter((row) => predicates.every((predicate) => predicate(row)))
                .sort((left, right) => {
                  if (!orderColumn) {
                    return 0;
                  }

                  const leftValue = left[orderColumn];
                  const rightValue = right[orderColumn];

                  if (leftValue === rightValue) return 0;
                  if (leftValue == null) return 1;
                  if (rightValue == null) return -1;

                  return ascending
                    ? String(leftValue).localeCompare(String(rightValue))
                    : String(rightValue).localeCompare(String(leftValue));
                });

              return {
                data: filtered.slice(from, to + 1),
                error: testState.error,
                count: options?.count === "exact" ? filtered.length : null
              };
            }
          };

          return chain;
        }
      };
    }
  })
}));

import { listRegistrations } from "@/services/admin";

function buildRow(index: number, overrides: Record<string, unknown> = {}) {
  return {
    id: `row-${index}`,
    event_id: "event-1",
    full_name: `Attendee ${index}`,
    email_raw: `attendee-${index}@example.com`,
    phone: `050000${String(index).padStart(4, "0")}`,
    status: "registered",
    created_at: new Date(Date.UTC(2026, 3, 1, 0, index, 0)).toISOString(),
    ...overrides
  };
}

describe("listRegistrations", () => {
  beforeEach(() => {
    testState.isDemoMode = false;
    testState.data = [];
    testState.error = null;
    testState.selectCalls = [];
    testState.eqCalls = [];
    testState.orCalls = [];
    testState.orderCalls = [];
    testState.rangeCalls = [];
  });

  it("returns the requested registration slice with the exact total count", async () => {
    testState.data = Array.from({ length: 60 }, (_, index) => buildRow(index + 1));

    const result = await listRegistrations({ page: 2, pageSize: 25 });

    expect(result.total).toBe(60);
    expect(result.rows).toHaveLength(25);
    expect(result.rows[0]).toMatchObject({ id: "row-35" });
    expect(result.rows[24]).toMatchObject({ id: "row-11" });
    expect(testState.rangeCalls).toEqual([{ from: 25, to: 49 }]);
    expect(testState.selectCalls[0]).toMatchObject({
      options: { count: "exact" }
    });
  });

  it("applies event, status, and search filters before counting and paging", async () => {
    testState.data = [
      buildRow(1, {
        event_id: "event-1",
        status: "checked_in",
        full_name: "Alice Adams",
        email_raw: "alice@example.com"
      }),
      buildRow(2, {
        event_id: "event-2",
        status: "checked_in",
        full_name: "Alice Brown",
        email_raw: "alice.brown@example.com"
      }),
      buildRow(3, {
        event_id: "event-1",
        status: "registered",
        full_name: "Bob Carter",
        email_raw: "bob@example.com"
      })
    ];

    const result = await listRegistrations({
      eventId: "event-1",
      status: "checked_in",
      query: "alice",
      page: 1,
      pageSize: 10
    });

    expect(result.total).toBe(1);
    expect(result.rows).toEqual([
      expect.objectContaining({
        id: "row-1",
        full_name: "Alice Adams"
      })
    ]);
    expect(testState.eqCalls).toContainEqual({ column: "event_id", value: "event-1" });
    expect(testState.eqCalls).toContainEqual({ column: "status", value: "checked_in" });
    expect(testState.orCalls).toEqual([
      "full_name.ilike.%alice%,email_raw.ilike.%alice%,phone.ilike.%alice%"
    ]);
  });
});
