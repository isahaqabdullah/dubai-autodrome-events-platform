import { describe, expect, it } from "vitest";
import { formatMailFromAddress } from "@/lib/mail-address";

describe("formatMailFromAddress", () => {
  it("returns the email when no sender name is provided", () => {
    expect(formatMailFromAddress("info@example.com")).toBe("info@example.com");
    expect(formatMailFromAddress("info@example.com", "   ")).toBe("info@example.com");
  });

  it("formats a quoted display name for the sender", () => {
    expect(formatMailFromAddress("info@example.com", "Dubai Autodrome Events")).toBe(
      '"Dubai Autodrome Events" <info@example.com>'
    );
  });

  it("escapes quotes inside the sender name", () => {
    expect(formatMailFromAddress("info@example.com", 'Team "A"')).toBe(
      '"Team \\"A\\"" <info@example.com>'
    );
  });
});
