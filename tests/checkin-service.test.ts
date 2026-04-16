import { beforeEach, describe, expect, it, vi } from "vitest";
import { manualCheckinByCode } from "@/services/checkin";

const testState = vi.hoisted(() => ({
  isDemoMode: false,
  registration: {
    id: "registration-1",
    full_name: "Jane Doe",
    status: "registered"
  } as { id: string; full_name: string; status: string } | null,
  lookupError: null as { message: string } | null,
  rpcData: [
    {
      result: "success",
      message: "Jane Doe checked in."
    }
  ] as Array<Record<string, unknown>>,
  rpcError: null as { message: string } | null,
  eqCalls: [] as Array<{ column: string; value: unknown }>,
  ilikeCalls: [] as Array<{ column: string; value: unknown }>
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
        select: vi.fn(() => ({
          eq(column: string, value: unknown) {
            testState.eqCalls.push({ column, value });
            return this;
          },
          ilike(column: string, value: unknown) {
            testState.ilikeCalls.push({ column, value });
            return this;
          },
          maybeSingle: async () => ({
            data: testState.registration,
            error: testState.lookupError
          })
        }))
      };
    },
    rpc: vi.fn(async (_fn: string, args: Record<string, unknown>) => {
      return {
        data: testState.rpcData,
        error: testState.rpcError,
        args
      };
    })
  })
}));

describe("manualCheckinByCode", () => {
  beforeEach(() => {
    testState.eqCalls = [];
    testState.ilikeCalls = [];
    testState.registration = {
      id: "registration-1",
      full_name: "Jane Doe",
      status: "registered"
    };
    testState.lookupError = null;
    testState.rpcError = null;
  });

  it("looks up registrations by the event-scoped manual code", async () => {
    const result = await manualCheckinByCode({
      eventId: "event-1",
      manualCheckinCode: "  ab23  "
    });

    expect(result).toMatchObject({
      ok: true,
      result: "success"
    });
    expect(testState.eqCalls).toContainEqual({ column: "event_id", value: "event-1" });
    expect(testState.eqCalls).toContainEqual({ column: "manual_checkin_code", value: "AB23" });
    expect(testState.ilikeCalls).toHaveLength(0);
  });
});
