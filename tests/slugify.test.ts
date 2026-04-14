import { describe, expect, it } from "vitest";
import { slugify } from "../lib/utils";

describe("slugify", () => {
  it("lowercases and replaces spaces with hyphens", () => {
    expect(slugify("Dubai Track Day")).toBe("dubai-track-day");
  });

  it("replaces special characters with hyphens", () => {
    expect(slugify("Event #1 (2026)")).toBe("event-1-2026");
  });

  it("collapses consecutive special characters into a single hyphen", () => {
    expect(slugify("hello---world")).toBe("hello-world");
    expect(slugify("a & b & c")).toBe("a-b-c");
  });

  it("strips leading and trailing hyphens", () => {
    expect(slugify("---hello---")).toBe("hello");
    expect(slugify("  --test--  ")).toBe("test");
  });

  it("truncates to 80 characters", () => {
    const long = "a".repeat(100);
    expect(slugify(long).length).toBe(80);
  });

  it("handles empty string input", () => {
    expect(slugify("")).toBe("");
  });

  it("returns empty string when input is all special characters", () => {
    expect(slugify("!@#$%^&*()")).toBe("");
  });

  it("trims whitespace before processing", () => {
    expect(slugify("  hello world  ")).toBe("hello-world");
  });

  it("preserves numbers", () => {
    expect(slugify("May 2026 Edition")).toBe("may-2026-edition");
  });

  it("handles unicode characters by replacing them", () => {
    expect(slugify("café résumé")).toBe("caf-r-sum");
  });
});
