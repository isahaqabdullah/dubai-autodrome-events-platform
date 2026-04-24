import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { CheckoutSignedTokenPayload } from "@/lib/types";

export function generateOpaqueToken(size = 32) {
  return randomBytes(size).toString("base64url");
}

export function hashOpaqueToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function base64UrlJson(input: unknown) {
  return Buffer.from(JSON.stringify(input), "utf8").toString("base64url");
}

function hmacSha256(input: string, secret: string) {
  return createHmac("sha256", secret).update(input).digest("base64url");
}

function requireCheckoutTokenSecret() {
  const secret = process.env.CHECKOUT_HMAC_SECRET;
  if (!secret) {
    throw new Error("CHECKOUT_HMAC_SECRET is required for checkout tokens and deterministic QR generation.");
  }
  return secret;
}

export function signCheckoutToken(input: Omit<CheckoutSignedTokenPayload, "exp"> & { expiresInSeconds?: number }) {
  const secret = requireCheckoutTokenSecret();
  const payload: CheckoutSignedTokenPayload = {
    bookingIntentId: input.bookingIntentId,
    email: input.email,
    exp: Math.floor(Date.now() / 1000) + (input.expiresInSeconds ?? 60 * 60)
  };
  const encodedPayload = base64UrlJson(payload);
  const signature = hmacSha256(encodedPayload, secret);
  return `${encodedPayload}.${signature}`;
}

export function verifyCheckoutToken(token: string): CheckoutSignedTokenPayload | null {
  const secret = requireCheckoutTokenSecret();
  const [encodedPayload, signature] = token.split(".");

  if (!encodedPayload || !signature) {
    return null;
  }

  const expected = hmacSha256(encodedPayload, secret);
  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(signature);

  if (expectedBuffer.length !== signatureBuffer.length || !timingSafeEqual(expectedBuffer, signatureBuffer)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as CheckoutSignedTokenPayload;
    if (!payload.bookingIntentId || !payload.email || !payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export function deriveCheckoutQrToken(input: {
  bookingIntentId: string;
  paymentAttemptId: string | null;
  attendeeIndex: number;
}) {
  const secret = requireCheckoutTokenSecret();
  return createHmac("sha256", secret)
    .update(`${input.bookingIntentId}:${input.paymentAttemptId ?? "free"}:${input.attendeeIndex}`)
    .digest("base64url");
}
