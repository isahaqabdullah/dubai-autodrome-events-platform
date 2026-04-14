import { describe, expect, it } from "vitest";
import { checkRateLimit } from "../lib/rate-limit";

describe("checkRateLimit", () => {
  function uniqueKey() {
    return `test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  it("allows the first request in a new window", () => {
    const result = checkRateLimit(uniqueKey(), 60, 5);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it("tracks remaining count down to zero", () => {
    const key = uniqueKey();
    const max = 3;

    const first = checkRateLimit(key, 60, max);
    expect(first.remaining).toBe(2);

    const second = checkRateLimit(key, 60, max);
    expect(second.remaining).toBe(1);

    const third = checkRateLimit(key, 60, max);
    expect(third.remaining).toBe(0);
  });

  it("blocks when exceeding max requests within the window", () => {
    const key = uniqueKey();
    const max = 2;

    checkRateLimit(key, 60, max);
    checkRateLimit(key, 60, max);

    const overLimit = checkRateLimit(key, 60, max);
    expect(overLimit.allowed).toBe(false);
    expect(overLimit.remaining).toBe(0);
  });

  it("allows the request at exactly the max count then blocks the next", () => {
    const key = uniqueKey();
    const max = 3;

    checkRateLimit(key, 60, max);
    checkRateLimit(key, 60, max);

    const atLimit = checkRateLimit(key, 60, max);
    expect(atLimit.allowed).toBe(true);
    expect(atLimit.remaining).toBe(0);

    const overLimit = checkRateLimit(key, 60, max);
    expect(overLimit.allowed).toBe(false);
  });

  it("treats different keys independently", () => {
    const keyA = uniqueKey();
    const keyB = uniqueKey();
    const max = 1;

    checkRateLimit(keyA, 60, max);

    const resultB = checkRateLimit(keyB, 60, max);
    expect(resultB.allowed).toBe(true);
  });

  it("resets after the window expires", async () => {
    const key = uniqueKey();
    const windowSeconds = 1;
    const max = 1;

    const first = checkRateLimit(key, windowSeconds, max);
    expect(first.allowed).toBe(true);

    const blocked = checkRateLimit(key, windowSeconds, max);
    expect(blocked.allowed).toBe(false);

    await new Promise((resolve) => setTimeout(resolve, 1100));

    const afterExpiry = checkRateLimit(key, windowSeconds, max);
    expect(afterExpiry.allowed).toBe(true);
    expect(afterExpiry.remaining).toBe(0);
  });

  it("remaining never goes below zero", () => {
    const key = uniqueKey();
    const max = 1;

    checkRateLimit(key, 60, max);
    checkRateLimit(key, 60, max);
    checkRateLimit(key, 60, max);

    const result = checkRateLimit(key, 60, max);
    expect(result.remaining).toBe(0);
  });
});
