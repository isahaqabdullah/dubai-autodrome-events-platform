import { describe, expect, it } from "vitest";
import { normalizeEmail, normalizePhone, blankToNull, mergeFormConfig, buildAbsoluteUrl } from "../lib/utils";

describe("normalizeEmail", () => {
  it("lowercases mixed-case emails", () => {
    expect(normalizeEmail("Jane.Doe@Example.COM")).toBe("jane.doe@example.com");
  });

  it("trims leading and trailing whitespace", () => {
    expect(normalizeEmail("  user@test.com  ")).toBe("user@test.com");
  });

  it("returns already-normalized email unchanged", () => {
    expect(normalizeEmail("user@test.com")).toBe("user@test.com");
  });

  it("handles email with only whitespace around it", () => {
    expect(normalizeEmail("\t hello@world.com \n")).toBe("hello@world.com");
  });
});

describe("normalizePhone", () => {
  it("returns trimmed phone for valid input", () => {
    expect(normalizePhone("+971-50-555-0198")).toBe("+971-50-555-0198");
  });

  it("trims whitespace from phone", () => {
    expect(normalizePhone("  +971-50-555-0198  ")).toBe("+971-50-555-0198");
  });

  it("returns null for null input", () => {
    expect(normalizePhone(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(normalizePhone(undefined)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(normalizePhone("")).toBeNull();
  });

  it("returns null for whitespace-only string", () => {
    expect(normalizePhone("   ")).toBeNull();
  });
});

describe("blankToNull", () => {
  it("returns null for null", () => {
    expect(blankToNull(null)).toBeNull();
  });

  it("returns null for undefined", () => {
    expect(blankToNull(undefined)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(blankToNull("")).toBeNull();
  });

  it("returns null for whitespace-only string", () => {
    expect(blankToNull("   ")).toBeNull();
  });

  it("returns trimmed value for non-empty string", () => {
    expect(blankToNull("  hello  ")).toBe("hello");
  });

  it("returns value as-is when already trimmed", () => {
    expect(blankToNull("hello")).toBe("hello");
  });
});

describe("mergeFormConfig", () => {
  it("returns defaults for null config", () => {
    const result = mergeFormConfig(null);
    expect(result.submitLabel).toBe("Reserve my spot");
    expect(result.ticketOptions).toEqual([]);
  });

  it("returns defaults for undefined config", () => {
    const result = mergeFormConfig(undefined);
    expect(result.submitLabel).toBe("Reserve my spot");
    expect(result.ticketOptions).toEqual([]);
  });

  it("preserves non-overridden defaults when partial config is given", () => {
    const result = mergeFormConfig({ submitLabel: "Book now" });
    expect(result.submitLabel).toBe("Book now");
    expect(result.ticketOptions).toEqual([]);
  });

  it("overrides all defaults when full config is given", () => {
    const tickets = [{ id: "vip", title: "VIP", description: "VIP access" }];
    const result = mergeFormConfig({
      submitLabel: "Confirm",
      ticketOptions: tickets
    });
    expect(result.submitLabel).toBe("Confirm");
    expect(result.ticketOptions).toEqual(tickets);
  });

  it("includes extra fields like mapLink from config", () => {
    const result = mergeFormConfig({ mapLink: "https://maps.example.com" });
    expect(result.mapLink).toBe("https://maps.example.com");
  });
});

describe("buildAbsoluteUrl", () => {
  it("joins base URL and path correctly", () => {
    expect(buildAbsoluteUrl("https://example.com", "/events")).toBe("https://example.com/events");
  });

  it("handles base URL with trailing slash", () => {
    expect(buildAbsoluteUrl("https://example.com/", "/events")).toBe("https://example.com/events");
  });

  it("handles path without leading slash", () => {
    expect(buildAbsoluteUrl("https://example.com", "events")).toBe("https://example.com/events");
  });

  it("preserves query strings in the path", () => {
    expect(buildAbsoluteUrl("https://example.com", "/api?key=value")).toBe(
      "https://example.com/api?key=value"
    );
  });
});
