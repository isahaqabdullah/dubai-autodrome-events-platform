import { describe, expect, it } from "vitest";
import { registrationStartSchema, registrationCompleteSchema, verifyOtpSchema } from "../lib/validation/registration";
import { checkinScanSchema, manualCheckinSchema } from "../lib/validation/checkin";
import { adminEventSchema } from "../lib/validation/admin";

describe("registrationStartSchema", () => {
  const validBase = {
    eventId: "6db7f8b7-4e20-410e-9a1d-78c7bfc2f101",
    selectedTicketId: "general-admission",
    selectedTicketTitle: "General Admission",
    fullName: "Jane Doe",
    email: "jane@example.com"
  };

  it("accepts a valid minimal registration", () => {
    const result = registrationStartSchema.safeParse(validBase);
    expect(result.success).toBe(true);
  });

  it("accepts when honeypot website field is empty", () => {
    const result = registrationStartSchema.safeParse({ ...validBase, website: "" });
    expect(result.success).toBe(true);
  });

  it("rejects when honeypot website field has content", () => {
    const result = registrationStartSchema.safeParse({ ...validBase, website: "http://spam.example.com" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid email format", () => {
    const result = registrationStartSchema.safeParse({ ...validBase, email: "not-an-email" });
    expect(result.success).toBe(false);
  });

  it("rejects missing fullName", () => {
    const { fullName, ...missing } = validBase;
    const result = registrationStartSchema.safeParse(missing);
    expect(result.success).toBe(false);
  });

  it("rejects fullName shorter than 2 characters", () => {
    const result = registrationStartSchema.safeParse({ ...validBase, fullName: "A" });
    expect(result.success).toBe(false);
  });

  it("rejects missing eventId", () => {
    const { eventId, ...missing } = validBase;
    const result = registrationStartSchema.safeParse(missing);
    expect(result.success).toBe(false);
  });

  it("rejects non-UUID eventId", () => {
    const result = registrationStartSchema.safeParse({ ...validBase, eventId: "not-a-uuid" });
    expect(result.success).toBe(false);
  });

  it("rejects age outside valid range", () => {
    expect(registrationStartSchema.safeParse({ ...validBase, age: 0 }).success).toBe(false);
    expect(registrationStartSchema.safeParse({ ...validBase, age: 121 }).success).toBe(false);
  });
});

describe("registrationCompleteSchema", () => {
  const validComplete = {
    eventId: "6db7f8b7-4e20-410e-9a1d-78c7bfc2f101",
    selectedTicketId: "general-admission",
    selectedTicketTitle: "General Admission",
    fullName: "Jane Doe",
    email: "jane@example.com",
    phone: "+971-50-555-1234",
    age: 28,
    uaeResident: true,
    declarationAccepted: true,
    otp: "123456"
  };

  it("accepts a fully valid completion payload", () => {
    const result = registrationCompleteSchema.safeParse(validComplete);
    expect(result.success).toBe(true);
  });

  it("rejects OTP with fewer than 6 digits", () => {
    const result = registrationCompleteSchema.safeParse({ ...validComplete, otp: "12345" });
    expect(result.success).toBe(false);
  });

  it("rejects OTP with more than 6 digits", () => {
    const result = registrationCompleteSchema.safeParse({ ...validComplete, otp: "1234567" });
    expect(result.success).toBe(false);
  });

  it("rejects OTP with non-digit characters", () => {
    const result = registrationCompleteSchema.safeParse({ ...validComplete, otp: "abcdef" });
    expect(result.success).toBe(false);
  });

  it("rejects empty OTP", () => {
    const result = registrationCompleteSchema.safeParse({ ...validComplete, otp: "" });
    expect(result.success).toBe(false);
  });

  it("rejects declarationAccepted as false", () => {
    const result = registrationCompleteSchema.safeParse({ ...validComplete, declarationAccepted: false });
    expect(result.success).toBe(false);
  });

  it("requires phone to be non-empty", () => {
    const result = registrationCompleteSchema.safeParse({ ...validComplete, phone: "" });
    expect(result.success).toBe(false);
  });

  it("requires age to be present", () => {
    const { age, ...missing } = validComplete;
    const result = registrationCompleteSchema.safeParse(missing);
    expect(result.success).toBe(false);
  });

  it("requires uaeResident to be present", () => {
    const { uaeResident, ...missing } = validComplete;
    const result = registrationCompleteSchema.safeParse(missing);
    expect(result.success).toBe(false);
  });
});

describe("verifyOtpSchema", () => {
  it("accepts a valid OTP payload", () => {
    const result = verifyOtpSchema.safeParse({
      eventId: "6db7f8b7-4e20-410e-9a1d-78c7bfc2f101",
      email: "jane@example.com",
      otp: "654321"
    });
    expect(result.success).toBe(true);
  });

  it("rejects OTP that is not exactly 6 digits", () => {
    expect(
      verifyOtpSchema.safeParse({
        eventId: "6db7f8b7-4e20-410e-9a1d-78c7bfc2f101",
        email: "jane@example.com",
        otp: "12345"
      }).success
    ).toBe(false);

    expect(
      verifyOtpSchema.safeParse({
        eventId: "6db7f8b7-4e20-410e-9a1d-78c7bfc2f101",
        email: "jane@example.com",
        otp: "12345a"
      }).success
    ).toBe(false);
  });

  it("rejects non-UUID eventId", () => {
    const result = verifyOtpSchema.safeParse({
      eventId: "bad",
      email: "jane@example.com",
      otp: "123456"
    });
    expect(result.success).toBe(false);
  });
});

describe("checkinScanSchema", () => {
  it("accepts a valid scan payload", () => {
    const result = checkinScanSchema.safeParse({
      eventId: "6db7f8b7-4e20-410e-9a1d-78c7bfc2f101",
      token: "a".repeat(32)
    });
    expect(result.success).toBe(true);
  });

  it("rejects token shorter than 16 characters", () => {
    const result = checkinScanSchema.safeParse({
      eventId: "6db7f8b7-4e20-410e-9a1d-78c7bfc2f101",
      token: "short"
    });
    expect(result.success).toBe(false);
  });

  it("rejects token longer than 256 characters", () => {
    const result = checkinScanSchema.safeParse({
      eventId: "6db7f8b7-4e20-410e-9a1d-78c7bfc2f101",
      token: "a".repeat(257)
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-UUID eventId", () => {
    const result = checkinScanSchema.safeParse({
      eventId: "not-a-uuid",
      token: "a".repeat(32)
    });
    expect(result.success).toBe(false);
  });

  it("accepts optional gateName and deviceId", () => {
    const result = checkinScanSchema.safeParse({
      eventId: "6db7f8b7-4e20-410e-9a1d-78c7bfc2f101",
      token: "a".repeat(32),
      gateName: "Main gate",
      deviceId: "DL-01"
    });
    expect(result.success).toBe(true);
  });
});

describe("manualCheckinSchema", () => {
  it("accepts a valid manual checkin payload", () => {
    const result = manualCheckinSchema.safeParse({
      eventId: "6db7f8b7-4e20-410e-9a1d-78c7bfc2f101",
      registrationId: "a59562d5-c7fa-4446-8aaf-bca6e0fd7af1"
    });
    expect(result.success).toBe(true);
  });

  it("rejects non-UUID registrationId", () => {
    const result = manualCheckinSchema.safeParse({
      eventId: "6db7f8b7-4e20-410e-9a1d-78c7bfc2f101",
      registrationId: "bad-id"
    });
    expect(result.success).toBe(false);
  });
});

describe("adminEventSchema", () => {
  const validEvent = {
    slug: "track-day-april",
    title: "Dubai Autodrome Track Day",
    timezone: "Asia/Dubai",
    startAt: "2026-05-22T09:00",
    endAt: "2026-05-22T12:00",
    status: "draft" as const,
    declarationVersion: 1,
    declarationText: "I confirm that my details are accurate and I will follow all safety instructions."
  };

  it("accepts a valid minimal event", () => {
    const result = adminEventSchema.safeParse(validEvent);
    expect(result.success).toBe(true);
  });

  it("rejects when end time is before start time", () => {
    const result = adminEventSchema.safeParse({
      ...validEvent,
      startAt: "2026-05-22T12:00",
      endAt: "2026-05-22T09:00"
    });
    expect(result.success).toBe(false);
  });

  it("rejects when end time equals start time", () => {
    const result = adminEventSchema.safeParse({
      ...validEvent,
      startAt: "2026-05-22T09:00",
      endAt: "2026-05-22T09:00"
    });
    expect(result.success).toBe(false);
  });

  it("rejects slug shorter than 2 characters", () => {
    const result = adminEventSchema.safeParse({ ...validEvent, slug: "a" });
    expect(result.success).toBe(false);
  });

  it("rejects title shorter than 2 characters", () => {
    const result = adminEventSchema.safeParse({ ...validEvent, title: "X" });
    expect(result.success).toBe(false);
  });

  it("rejects declaration text shorter than 10 characters", () => {
    const result = adminEventSchema.safeParse({ ...validEvent, declarationText: "Short" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid status value", () => {
    const result = adminEventSchema.safeParse({ ...validEvent, status: "invalid" });
    expect(result.success).toBe(false);
  });

  it("accepts all valid status values", () => {
    for (const status of ["draft", "open", "closed", "live", "archived"]) {
      const result = adminEventSchema.safeParse({ ...validEvent, status });
      expect(result.success).toBe(true);
    }
  });

  it("rejects non-positive capacity", () => {
    const result = adminEventSchema.safeParse({ ...validEvent, capacity: "0" });
    expect(result.success).toBe(false);
  });

  it("accepts empty capacity string", () => {
    const result = adminEventSchema.safeParse({ ...validEvent, capacity: "" });
    expect(result.success).toBe(true);
  });

  it("accepts valid ticket options", () => {
    const result = adminEventSchema.safeParse({
      ...validEvent,
      ticketOptions: [
        { id: "bootcamp-1830", title: "Bootcamp - 18:30" }
      ]
    });
    expect(result.success).toBe(true);
  });

  it("rejects ticket option with empty title", () => {
    const result = adminEventSchema.safeParse({
      ...validEvent,
      ticketOptions: [
        { id: "bootcamp-1830", title: "X" }
      ]
    });
    expect(result.success).toBe(false);
  });
});
