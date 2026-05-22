import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EventFormTemplate } from "@/lib/event-form-templates";

const testState = vi.hoisted(() => ({
  isDemoMode: false,
  templateRows: [] as Array<Record<string, unknown>>,
  auditRows: [] as Array<Record<string, unknown>>,
  deletedTemplateIds: [] as string[],
  nextId: 1
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
  getRegistrationSummaryForEvent: vi.fn()
}));

function createTemplateRow(payload: Record<string, unknown>) {
  const timestamp = "2026-05-22T05:00:00.000Z";

  return {
    id: `00000000-0000-4000-8000-${String(testState.nextId++).padStart(12, "0")}`,
    name: payload.name,
    values: payload.values,
    created_at: timestamp,
    updated_at: timestamp
  };
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: () => ({
    from(table: string) {
      if (table === "event_form_templates") {
        return {
          select: vi.fn(() => ({
            order: vi.fn(async () => ({
              data: testState.templateRows,
              error: null
            })),
            eq: vi.fn((_column: string, templateId: string) => ({
              maybeSingle: vi.fn(async () => ({
                data: testState.templateRows.find((row) => row.id === templateId) ?? null,
                error: null
              }))
            }))
          })),
          insert: vi.fn((payload: Record<string, unknown> | Array<Record<string, unknown>>) => {
            if (Array.isArray(payload)) {
              const rows = payload.map(createTemplateRow);
              testState.templateRows.unshift(...rows);
              return { error: null };
            }

            const row = createTemplateRow(payload);
            testState.templateRows.unshift(row);
            return {
              select: vi.fn(() => ({
                single: vi.fn(async () => ({
                  data: row,
                  error: null
                }))
              }))
            };
          }),
          delete: vi.fn(() => ({
            eq: vi.fn(async (_column: string, templateId: string) => {
              testState.deletedTemplateIds.push(templateId);
              testState.templateRows = testState.templateRows.filter((row) => row.id !== templateId);
              return { error: null };
            })
          }))
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

import {
  deleteEventFormTemplate,
  importEventFormTemplates,
  listEventFormTemplates,
  saveEventFormTemplate
} from "@/services/admin";

const actor = {
  id: "admin-user-1",
  email: "admin@example.com",
  role: "admin",
  gateName: "Main gate"
} as const;

function templateValues(overrides: Partial<EventFormTemplate["values"]> = {}): EventFormTemplate["values"] {
  return {
    venue: "Dubai Autodrome",
    timezone: "Asia/Dubai",
    mapLink: "",
    introLine: "",
    descriptionText: "",
    emailIntroLine: "",
    emailDescriptionText: "",
    disclaimerHeading: "",
    declarationText: "Template terms",
    categoriesLabel: "Ticket type",
    ticketOptionsLabel: "Activity category",
    declarationVersion: "1",
    submitLabel: "Register",
    posterImage: "",
    disclaimerPdfUrl: "",
    categories: [],
    ticketOptions: [],
    ...overrides
  };
}

describe("event form template admin service", () => {
  beforeEach(() => {
    testState.isDemoMode = false;
    testState.templateRows = [];
    testState.auditRows = [];
    testState.deletedTemplateIds = [];
    testState.nextId = 1;
  });

  it("stores a template in Supabase and writes an audit log", async () => {
    const template = await saveEventFormTemplate(
      {
        name: "Track setup",
        values: templateValues({
          categories: [{ id: "vip", title: "VIP", description: "VIP package" }]
        })
      },
      actor
    );

    expect(template.name).toBe("Track setup");
    expect(template.values.categories).toEqual([
      {
        id: "vip",
        title: "VIP",
        description: "VIP package",
        note: "",
        badge: "",
        capacity: null,
        soldOut: false,
        priceMinor: 0,
        currencyCode: "AED"
      }
    ]);
    expect(testState.templateRows).toHaveLength(1);
    expect(testState.auditRows[0]).toMatchObject({
      action: "event_form_template.created",
      entity_type: "event_form_template",
      entity_id: template.id
    });
  });

  it("imports legacy browser templates without duplicating existing values", async () => {
    const existing = await saveEventFormTemplate(
      { name: "Existing setup", values: templateValues({ venue: "Existing venue" }) },
      actor
    );
    testState.auditRows = [];

    const result = await importEventFormTemplates(
      [
        existing,
        {
          ...existing,
          id: "legacy-template-1",
          name: "New setup",
          values: templateValues({ venue: "New venue" })
        }
      ],
      actor
    );

    expect(result.importedCount).toBe(1);
    expect(result.templates.map((template) => template.name)).toContain("New setup");
    expect(testState.templateRows).toHaveLength(2);
    expect(testState.auditRows[0]).toMatchObject({
      action: "event_form_template.imported",
      after_json: { count: 1 }
    });
  });

  it("lists and deletes shared templates", async () => {
    const template = await saveEventFormTemplate(
      { name: "Delete me", values: templateValues() },
      actor
    );

    expect(await listEventFormTemplates()).toHaveLength(1);

    await deleteEventFormTemplate(template.id, actor);

    expect(testState.deletedTemplateIds).toEqual([template.id]);
    expect(await listEventFormTemplates()).toHaveLength(0);
    expect(testState.auditRows.at(-1)).toMatchObject({
      action: "event_form_template.deleted",
      entity_id: template.id
    });
  });
});
