import { beforeEach, describe, expect, it, vi } from "vitest";
import { searchRegistrationsForEvent } from "@/services/checkin";

const testState = vi.hoisted(() => ({
  isDemoMode: false,
  data: [
    {
      id: "registration-1",
      full_name: "Alice Adams",
      email_raw: "alice@example.com",
      phone: "+971500000001",
      status: "registered",
      checked_in_at: null,
      created_at: "2026-04-22T08:00:00.000Z"
    }
  ] as Array<Record<string, unknown>>,
  error: null as { message: string } | null,
  eqCalls: [] as Array<{ column: string; value: unknown }>,
  orCalls: [] as string[],
  orderCalls: [] as Array<{ column: string; ascending: boolean }>,
  limitCalls: [] as number[]
}));

vi.mock("@/lib/demo-mode", () => ({
  isDemoMode: () => testState.isDemoMode
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: () => ({
    from(table: string) {
      if (table !== "registrations") {
        throw new Error(`Unexpected table: ${table}`);
      }

      return {
        select: vi.fn(() => {
          const chain = {
            eq(column: string, value: unknown) {
              testState.eqCalls.push({ column, value });
              return chain;
            },
            or(value: string) {
              testState.orCalls.push(value);
              return chain;
            },
            order(column: string, options: { ascending: boolean }) {
              testState.orderCalls.push({ column, ascending: options.ascending });
              return chain;
            },
            async limit(value: number) {
              testState.limitCalls.push(value);
              return {
                data: testState.data,
                error: testState.error
              };
            }
          };

          return chain;
        })
      };
    }
  })
}));

describe("searchRegistrationsForEvent", () => {
  beforeEach(() => {
    testState.isDemoMode = false;
    testState.error = null;
    testState.eqCalls = [];
    testState.orCalls = [];
    testState.orderCalls = [];
    testState.limitCalls = [];
  });

  it("searches attendees within the selected event and orders recommendations by name", async () => {
    const results = await searchRegistrationsForEvent("event-1", "alic");

    expect(results).toEqual(testState.data);
    expect(testState.eqCalls).toContainEqual({ column: "event_id", value: "event-1" });
    expect(testState.orCalls).toEqual([
      "full_name.ilike.%alic%,email_raw.ilike.%alic%,phone.ilike.%alic%"
    ]);
    expect(testState.orderCalls).toEqual([{ column: "full_name", ascending: true }]);
    expect(testState.limitCalls).toEqual([20]);
  });
});
