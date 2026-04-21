import { describe, expect, it } from "vitest";
import { formatShortDateTime, formatShortTime } from "@/lib/utils";

describe("time formatting helpers", () => {
  it("formats short date-time in the supplied timezone", () => {
    const value = "2026-04-21T10:00:00.000Z";

    expect(formatShortDateTime(value, "Asia/Dubai")).toBe("Apr 21, 2:00 PM");
    expect(formatShortDateTime(value, "America/New_York")).toBe("Apr 21, 6:00 AM");
  });

  it("formats time-only values in the supplied timezone", () => {
    const value = "2026-04-21T10:00:00.000Z";

    expect(formatShortTime(value, "Asia/Dubai")).toBe("2:00 PM");
    expect(formatShortTime(value, "America/New_York")).toBe("6:00 AM");
  });

  it("returns an empty string for invalid timestamps", () => {
    expect(formatShortDateTime("not-a-date", "Asia/Dubai")).toBe("");
    expect(formatShortTime("not-a-date", "Asia/Dubai")).toBe("");
  });
});
