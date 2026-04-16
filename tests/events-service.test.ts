import { describe, expect, it, vi } from "vitest";
import { getRegistrationSummaryForEvent } from "@/services/events";

const testState = vi.hoisted(() => ({
  isDemoMode: false,
  rpcData: [
    {
      registration_count: 3,
      ticket_counts: { "bootcamp-1": 2, "bootcamp-2": "1" },
      category_counts: { cycling: 2, walking: "1" }
    }
  ] as Array<Record<string, unknown>>,
  rpcError: null as { code?: string; message?: string } | null,
  legacyRows: [
    { ticket_option_id: "bootcamp-1", category_id: "cycling" },
    { ticket_option_id: "bootcamp-1", category_id: "cycling" },
    { ticket_option_id: null, category_id: "walking" }
  ] as Array<{ ticket_option_id: string | null; category_id: string | null }>,
  legacyCount: 3,
  legacySelectCalls: 0
}));

vi.mock("@/lib/demo-mode", () => ({
  isDemoMode: () => testState.isDemoMode
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: () => ({
    rpc: vi.fn(async () => ({
      data: testState.rpcData,
      error: testState.rpcError
    })),
    from(table: string) {
      if (table !== "registrations") {
        throw new Error(`Unexpected table: ${table}`);
      }

      return {
        select: vi.fn((_columns: string, _options: Record<string, unknown>) => {
          testState.legacySelectCalls += 1;
          return {
            eq: vi.fn(async () => ({
              data: testState.legacyRows,
              error: null,
              count: testState.legacyCount
            }))
          };
        })
      };
    }
  })
}));

describe("getRegistrationSummaryForEvent", () => {
  it("uses the RPC summary when available", async () => {
    testState.rpcError = null;
    testState.legacySelectCalls = 0;

    const result = await getRegistrationSummaryForEvent("event-1");

    expect(result).toEqual({
      count: 3,
      ticketCounts: { "bootcamp-1": 2, "bootcamp-2": 1 },
      categoryCounts: { cycling: 2, walking: 1 }
    });
    expect(testState.legacySelectCalls).toBe(0);
  });

  it("falls back to the legacy query when the RPC is not available yet", async () => {
    testState.rpcError = {
      code: "PGRST202",
      message: "Could not find the function public.get_registration_summary"
    };
    testState.legacySelectCalls = 0;

    const result = await getRegistrationSummaryForEvent("event-1");

    expect(result).toEqual({
      count: 3,
      ticketCounts: { "bootcamp-1": 2 },
      categoryCounts: { cycling: 2, walking: 1 }
    });
    expect(testState.legacySelectCalls).toBe(1);
  });
});
