import { beforeEach, describe, expect, it, vi } from "vitest";

const testState = vi.hoisted(() => ({
  isDemoMode: false,
  registrationCount: 1300,
  checkedInCount: 900,
  analyticsRows: [] as Array<Record<string, unknown>>,
  recentRows: [] as Array<Record<string, unknown>>,
  rangeCalls: [] as Array<{ from: number; to: number }>,
  eqCalls: [] as Array<{ table: string; column: string; value: unknown }>,
  notCalls: [] as Array<{ column: string; operator: string; value: unknown }>
}));

vi.mock("@/lib/demo-mode", () => ({
  isDemoMode: () => testState.isDemoMode
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: () => ({
    from(table: string) {
      if (table === "registrations") {
        return {
          select(_selectString: string, options?: { count?: string; head?: boolean }) {
            const checkedInOnly = { value: false };

            const chain = {
              eq(column: string, value: unknown) {
                testState.eqCalls.push({ table, column, value });
                return chain;
              },
              not(column: string, operator: string, value: unknown) {
                checkedInOnly.value = true;
                testState.notCalls.push({ column, operator, value });
                return chain;
              },
              then(resolve: (value: { count: number; error: null }) => void) {
                resolve({
                  count: checkedInOnly.value ? testState.checkedInCount : testState.registrationCount,
                  error: null
                });
              }
            };

            if (!options?.head) {
              throw new Error("Unexpected non-head registrations query in analytics test.");
            }

            return chain;
          }
        };
      }

      if (table === "checkins") {
        return {
          select(selectString: string) {
            if (selectString === "result, gate_name, scanned_at") {
              const chain = {
                eq(column: string, value: unknown) {
                  testState.eqCalls.push({ table, column, value });
                  return chain;
                },
                order() {
                  return chain;
                },
                async range(from: number, to: number) {
                  testState.rangeCalls.push({ from, to });

                  return {
                    data: testState.analyticsRows.slice(from, to + 1),
                    error: null
                  };
                }
              };

              return chain;
            }

            if (
              selectString ===
              "id, result, gate_name, scanned_at, registration:registrations(id, full_name, email_raw, phone, status, category_title)"
            ) {
              const chain = {
                eq(column: string, value: unknown) {
                  testState.eqCalls.push({ table, column, value });
                  return chain;
                },
                order() {
                  return chain;
                },
                async limit(_value: number) {
                  return {
                    data: testState.recentRows,
                    error: null
                  };
                }
              };

              return chain;
            }

            throw new Error(`Unexpected checkins select: ${selectString}`);
          }
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    }
  })
}));

import { getScanAnalytics } from "@/services/checkin";

describe("getScanAnalytics", () => {
  beforeEach(() => {
    testState.isDemoMode = false;
    testState.registrationCount = 1300;
    testState.checkedInCount = 900;
    testState.rangeCalls = [];
    testState.eqCalls = [];
    testState.notCalls = [];
    testState.recentRows = [];
    testState.analyticsRows = Array.from({ length: 1201 }, (_, index) => ({
      result: index < 801 ? "success" : index < 1001 ? "already_checked_in" : "invalid_token",
      gate_name: index % 2 === 0 ? "Main gate" : "North gate",
      scanned_at: new Date(Date.UTC(2026, 4, 22, 5, 0, index)).toISOString()
    }));
  });

  it("counts more than 1000 check-in attempts by fetching analytics rows in batches", async () => {
    const analytics = await getScanAnalytics("event-1", "Main gate");

    expect(analytics.summary.totalRegistered).toBe(1300);
    expect(analytics.summary.totalCheckedIn).toBe(900);
    expect(analytics.summary.totalScans).toBe(601);
    expect(analytics.summary.deskCheckedIn).toBe(401);
    expect(analytics.summary.duplicateScans).toBe(100);
    expect(analytics.summary.invalidScans).toBe(100);
    expect(testState.rangeCalls).toEqual([
      { from: 0, to: 999 },
      { from: 1000, to: 1999 }
    ]);
  });
});
