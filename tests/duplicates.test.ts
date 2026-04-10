import { describe, expect, it } from "vitest";
import { isSameEventEmailDuplicate } from "../lib/domain/duplicates";

describe("duplicate registration logic", () => {
  it("blocks the same normalized email on the same event edition", () => {
    expect(
      isSameEventEmailDuplicate(
        {
          eventId: "event-a",
          emailNormalized: "person@example.com"
        },
        {
          eventId: "event-a",
          emailNormalized: "person@example.com"
        }
      )
    ).toBe(true);
  });

  it("allows the same email to register for a different event edition", () => {
    expect(
      isSameEventEmailDuplicate(
        {
          eventId: "event-a",
          emailNormalized: "person@example.com"
        },
        {
          eventId: "event-b",
          emailNormalized: "person@example.com"
        }
      )
    ).toBe(false);
  });

  it("compares normalized casing for duplicate checks", () => {
    expect(
      isSameEventEmailDuplicate(
        {
          eventId: "event-a",
          emailNormalized: "Person@Example.com"
        },
        {
          eventId: "event-a",
          emailNormalized: "person@example.com"
        }
      )
    ).toBe(true);
  });
});
