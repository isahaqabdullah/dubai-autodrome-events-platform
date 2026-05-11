import { describe, expect, it, vi } from "vitest";
import {
  createEventFormTemplate,
  EVENT_FORM_TEMPLATE_STORAGE_KEY,
  EVENT_FORM_TEMPLATE_TEXT_FIELDS,
  extractEventFormTemplateValues,
  parseStoredEventFormTemplates
} from "@/lib/event-form-templates";

describe("event form templates", () => {
  it("uses a versioned localStorage key", () => {
    expect(EVENT_FORM_TEMPLATE_STORAGE_KEY).toBe("event-form-templates-v1");
  });

  it("extracts only reusable setup fields from form data", () => {
    const formData = new FormData();
    formData.set("title", "Do not save");
    formData.set("slug", "do-not-save");
    formData.set("startAt", "2026-05-22T09:00");
    formData.set("status", "open");
    formData.set("capacity", "100");
    formData.set("venue", "Main Hall");
    formData.set("timezone", "Asia/Dubai");
    formData.set("descriptionText", "Actual event description");
    formData.set("declarationText", "Template terms and conditions");
    formData.set("categoriesJson", JSON.stringify([{ id: "vip", title: "VIP", description: "VIP access" }]));
    formData.set("ticketOptionsJson", JSON.stringify([{ id: "run", title: "Run", description: "Running" }]));

    const values = extractEventFormTemplateValues(formData, {
      posterImage: "/poster.png",
      disclaimerPdfUrl: "/terms.pdf"
    });

    expect(values).toMatchObject({
      venue: "Main Hall",
      timezone: "Asia/Dubai",
      descriptionText: "Actual event description",
      declarationText: "Template terms and conditions",
      posterImage: "/poster.png",
      disclaimerPdfUrl: "/terms.pdf"
    });
    expect(values.categories).toEqual([{ id: "vip", title: "VIP", description: "VIP access", note: "", badge: "", capacity: null, soldOut: false, priceMinor: 0, currencyCode: "AED" }]);
    expect(values.ticketOptions).toEqual([{ id: "run", title: "Run", description: "Running", note: "", badge: "", capacity: null, soldOut: false, priceMinor: 0, currencyCode: "AED" }]);
    expect(Object.keys(values)).not.toEqual(expect.arrayContaining(["title", "slug", "startAt", "status", "capacity"]));
  });

  it("keeps the template text field allow-list explicit", () => {
    expect(EVENT_FORM_TEMPLATE_TEXT_FIELDS).toEqual([
      "venue",
      "timezone",
      "mapLink",
      "introLine",
      "descriptionText",
      "emailIntroLine",
      "emailDescriptionText",
      "disclaimerHeading",
      "declarationText",
      "categoriesLabel",
      "ticketOptionsLabel",
      "declarationVersion",
      "submitLabel"
    ]);
  });

  it("parses stored templates without restoring excluded event fields", () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.123456789);
    const template = createEventFormTemplate("Saved setup", {
      venue: "Main Hall",
      timezone: "Asia/Dubai",
      mapLink: "",
      introLine: "",
      descriptionText: "",
      emailIntroLine: "",
      emailDescriptionText: "",
      disclaimerHeading: "",
      declarationText: "",
      categoriesLabel: "",
      ticketOptionsLabel: "",
      declarationVersion: "1",
      submitLabel: "",
      posterImage: "",
      disclaimerPdfUrl: "",
      categories: [],
      ticketOptions: []
    }, new Date("2026-05-11T08:00:00.000Z"));

    const parsed = parseStoredEventFormTemplates(JSON.stringify([{ ...template, title: "Excluded" }]));

    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.name).toBe("Saved setup");
    expect(parsed[0]?.values.venue).toBe("Main Hall");
    expect(parsed[0]).not.toHaveProperty("title");
    randomSpy.mockRestore();
  });
});
