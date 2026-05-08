import { beforeEach, describe, expect, it, vi } from "vitest";

const testState = vi.hoisted(() => ({
  isDemoMode: false,
  data: [] as Array<Record<string, unknown>>,
  error: null as { message: string } | null,
  selectCalls: [] as string[],
  eqCalls: [] as Array<{ column: string; value: unknown }>,
  notCalls: [] as Array<{ column: string; operator: string; value: unknown }>,
  orderCalls: [] as Array<{ column: string; ascending: boolean }>,
  rangeCalls: [] as Array<{ from: number; to: number }>
}));

vi.mock("@/lib/demo-mode", () => ({
  isDemoMode: () => testState.isDemoMode
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
      if (table !== "registrations") {
        throw new Error(`Unexpected table: ${table}`);
      }

      return {
        select(selectString: string) {
          testState.selectCalls.push(selectString);

          const predicates: Array<(row: Record<string, unknown>) => boolean> = [];
          let orderColumn: string | null = null;
          let ascending = true;

          const chain = {
            eq(column: string, value: unknown) {
              testState.eqCalls.push({ column, value });
              predicates.push((row) => row[column] === value);
              return chain;
            },
            not(column: string, operator: string, value: unknown) {
              testState.notCalls.push({ column, operator, value });
              if (operator === "is" && value === null) {
                predicates.push((row) => row[column] != null);
              }
              return chain;
            },
            order(column: string, options?: { ascending?: boolean }) {
              ascending = options?.ascending ?? true;
              orderColumn = column;
              testState.orderCalls.push({ column, ascending });
              return chain;
            },
            async range(from: number, to: number) {
              testState.rangeCalls.push({ from, to });

              const data = [...testState.data]
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
                data: data.slice(from, to + 1),
                error: testState.error
              };
            }
          };

          return chain;
        }
      };
    }
  })
}));

import { exportAttendeesCsv, exportRegistrationsCsv } from "@/services/admin";

function parseCsv(csv: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < csv.length; index++) {
    const char = csv[index];
    const next = csv[index + 1];

    if (char === "\"") {
      if (inQuotes && next === "\"") {
        cell += "\"";
        index++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }

    if (char === "\n" && !inQuotes) {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  if (cell || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  const [headers = [], ...dataRows] = rows;
  return dataRows.map((dataRow) =>
    Object.fromEntries(headers.map((header, index) => [header, dataRow[index] ?? ""]))
  );
}

describe("admin exports", () => {
  beforeEach(() => {
    testState.isDemoMode = false;
    testState.data = [];
    testState.error = null;
    testState.selectCalls = [];
    testState.eqCalls = [];
    testState.notCalls = [];
    testState.orderCalls = [];
    testState.rangeCalls = [];
  });

  it("exports registrations with the stored timestamps and collected fields", async () => {
    testState.data = [
      {
        event_id: "event-1",
        full_name: "Primary Booker",
        email_raw: "primary@example.com",
        phone: "+971501234567",
        age: 34,
        uae_resident: true,
        marketing_opt_in: true,
        category_title: "Adult",
        ticket_option_title: "VIP Access",
        status: "registered",
        registered_by_email: null,
        is_primary: true,
        created_at: "2026-04-10T08:00:00.000Z",
        checked_in_at: null
      },
      {
        event_id: "event-1",
        full_name: "Guest Attendee",
        email_raw: "noemail+booking-1-1@placeholder.internal",
        phone: null,
        age: 15,
        uae_resident: false,
        marketing_opt_in: true,
        category_title: "Junior",
        ticket_option_title: null,
        status: "checked_in",
        registered_by_email: "primary@example.com",
        is_primary: false,
        created_at: "2026-04-10T08:00:00.000Z",
        checked_in_at: "2026-04-17T09:30:00.000Z"
      }
    ];

    const csv = await exportRegistrationsCsv("event-1");
    const rows = parseCsv(csv);

    expect(rows).toEqual([
      {
        "#": "1",
        "Full Name": "Primary Booker",
        "Email": "primary@example.com",
        "Phone Number": "'+971501234567",
        "Age": "34",
        "UAE Resident": "Yes",
        "Marketing Opt-In": "Yes",
        "Ticket Type": "Adult",
        "Activity Category": "VIP Access",
        "Status": "registered",
        "Booked By": "",
        "Registered At": "Apr 10, 2026, 12:00 PM",
        "Checked In At": ""
      },
      {
        "#": "2",
        "Full Name": "Guest Attendee",
        "Email": "N/A",
        "Phone Number": "",
        "Age": "15",
        "UAE Resident": "",
        "Marketing Opt-In": "",
        "Ticket Type": "Junior",
        "Activity Category": "",
        "Status": "checked_in",
        "Booked By": "primary@example.com",
        "Registered At": "Apr 10, 2026, 12:00 PM",
        "Checked In At": "Apr 17, 2026, 1:30 PM"
      }
    ]);
    expect(testState.eqCalls).toContainEqual({ column: "event_id", value: "event-1" });
    expect(testState.notCalls).toHaveLength(0);
    expect(testState.rangeCalls).toEqual([{ from: 0, to: 999 }]);
  });

  it("exports attendees using the same columns but only for checked-in rows", async () => {
    testState.data = [
      {
        event_id: "event-1",
        full_name: "Registered Only",
        email_raw: "registered@example.com",
        phone: "+971509999999",
        age: 29,
        uae_resident: true,
        marketing_opt_in: false,
        category_title: "Adult",
        ticket_option_title: "General Admission",
        status: "registered",
        registered_by_email: null,
        is_primary: true,
        created_at: "2026-04-11T08:00:00.000Z",
        checked_in_at: null
      },
      {
        event_id: "event-1",
        full_name: "Checked In Guest",
        email_raw: "checked-in@example.com",
        phone: null,
        age: 22,
        uae_resident: false,
        marketing_opt_in: true,
        category_title: "Adult",
        ticket_option_title: "Pit Walk",
        status: "checked_in",
        registered_by_email: "primary@example.com",
        is_primary: false,
        created_at: "2026-04-11T08:00:00.000Z",
        checked_in_at: "2026-04-17T10:45:00.000Z"
      }
    ];

    const csv = await exportAttendeesCsv("event-1");
    const rows = parseCsv(csv);

    expect(rows).toEqual([
      {
        "#": "1",
        "Full Name": "Checked In Guest",
        "Email": "checked-in@example.com",
        "Phone Number": "",
        "Age": "22",
        "UAE Resident": "",
        "Marketing Opt-In": "",
        "Ticket Type": "Adult",
        "Activity Category": "Pit Walk",
        "Status": "checked_in",
        "Booked By": "primary@example.com",
        "Registered At": "Apr 11, 2026, 12:00 PM",
        "Checked In At": "Apr 17, 2026, 2:45 PM"
      }
    ]);
    expect(testState.eqCalls).toContainEqual({ column: "event_id", value: "event-1" });
    expect(testState.notCalls).toContainEqual({ column: "checked_in_at", operator: "is", value: null });
    expect(testState.orderCalls).toContainEqual({ column: "checked_in_at", ascending: true });
    expect(testState.rangeCalls).toEqual([{ from: 0, to: 999 }]);
  });

  it("exports more than 1000 registrations by fetching multiple batches", async () => {
    testState.data = Array.from({ length: 1001 }, (_, index) => ({
      event_id: "event-1",
      full_name: `Attendee ${index + 1}`,
      email_raw: `attendee-${index + 1}@example.com`,
      phone: null,
      age: null,
      uae_resident: null,
      marketing_opt_in: null,
      category_title: "Adult",
      ticket_option_title: null,
      status: "registered",
      registered_by_email: null,
      is_primary: true,
      created_at: new Date(Date.UTC(2026, 3, 10, 8, 0, index)).toISOString(),
      checked_in_at: null
    }));

    const csv = await exportRegistrationsCsv("event-1");
    const rows = parseCsv(csv);

    expect(rows).toHaveLength(1001);
    expect(rows[0]).toMatchObject({
      "#": "1",
      "Full Name": "Attendee 1"
    });
    expect(rows[1000]).toMatchObject({
      "#": "1001",
      "Full Name": "Attendee 1001"
    });
    expect(testState.rangeCalls).toEqual([
      { from: 0, to: 999 },
      { from: 1000, to: 1999 }
    ]);
  });

  it("guards CSV values that spreadsheet apps could interpret as formulas", async () => {
    testState.data = [
      {
        event_id: "event-1",
        full_name: "=IMPORTXML(\"https://example.com\")",
        email_raw: "formula@example.com",
        phone: "+971501234567",
        age: 34,
        uae_resident: true,
        marketing_opt_in: true,
        category_title: "+Danger",
        ticket_option_title: "@Command",
        status: "registered",
        registered_by_email: null,
        is_primary: true,
        created_at: "2026-04-10T08:00:00.000Z",
        checked_in_at: null
      }
    ];

    const rows = parseCsv(await exportRegistrationsCsv("event-1"));

    expect(rows[0]["Full Name"]).toBe("'=IMPORTXML(\"https://example.com\")");
    expect(rows[0]["Ticket Type"]).toBe("'+Danger");
    expect(rows[0]["Activity Category"]).toBe("'@Command");
  });
});
