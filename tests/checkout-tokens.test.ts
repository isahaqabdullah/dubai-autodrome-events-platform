import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { deriveCheckoutQrToken, signCheckoutToken, verifyCheckoutToken } from "../lib/tokens";

const originalSecret = process.env.CHECKOUT_HMAC_SECRET;

describe("checkout token utilities", () => {
  beforeEach(() => {
    process.env.CHECKOUT_HMAC_SECRET = "test-checkout-secret";
  });

  afterEach(() => {
    process.env.CHECKOUT_HMAC_SECRET = originalSecret;
  });

  it("signs and verifies checkout tokens", () => {
    const token = signCheckoutToken({
      bookingIntentId: "booking-1",
      email: "buyer@example.com",
      expiresInSeconds: 60
    });

    expect(verifyCheckoutToken(token)).toMatchObject({
      bookingIntentId: "booking-1",
      email: "buyer@example.com"
    });
  });

  it("rejects tampered checkout tokens", () => {
    const token = signCheckoutToken({
      bookingIntentId: "booking-1",
      email: "buyer@example.com",
      expiresInSeconds: 60
    });
    const [payload] = token.split(".");

    expect(verifyCheckoutToken(`${payload}.invalid-signature`)).toBeNull();
  });

  it("derives stable QR tokens per booking, attempt, and attendee", () => {
    const first = deriveCheckoutQrToken({
      bookingIntentId: "booking-1",
      paymentAttemptId: "attempt-1",
      attendeeIndex: 0
    });
    const retry = deriveCheckoutQrToken({
      bookingIntentId: "booking-1",
      paymentAttemptId: "attempt-1",
      attendeeIndex: 0
    });
    const nextAttempt = deriveCheckoutQrToken({
      bookingIntentId: "booking-1",
      paymentAttemptId: "attempt-2",
      attendeeIndex: 0
    });

    expect(retry).toBe(first);
    expect(nextAttempt).not.toBe(first);
  });
});
