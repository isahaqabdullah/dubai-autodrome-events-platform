import { describe, expect, it } from "vitest";
import { generateOpaqueToken, hashOpaqueToken } from "../lib/tokens";

describe("token utilities", () => {
  it("creates opaque random tokens", () => {
    const first = generateOpaqueToken();
    const second = generateOpaqueToken();

    expect(first).not.toEqual(second);
    expect(first.length).toBeGreaterThan(20);
    expect(second.length).toBeGreaterThan(20);
  });

  it("hashes tokens deterministically", () => {
    const token = "opaque-registration-token";

    expect(hashOpaqueToken(token)).toEqual(hashOpaqueToken(token));
    expect(hashOpaqueToken(token)).not.toEqual(hashOpaqueToken(`${token}-other`));
  });

  it("generates tokens with sufficient entropy (default 32 bytes = 43+ base64url chars)", () => {
    const token = generateOpaqueToken();
    expect(token.length).toBeGreaterThanOrEqual(43);
  });

  it("produces a 64-character hex hash", () => {
    const hash = hashOpaqueToken("test-token");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("hashing empty string does not throw", () => {
    expect(() => hashOpaqueToken("")).not.toThrow();
    expect(hashOpaqueToken("")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("two sequential tokens never collide", () => {
    const tokens = new Set<string>();
    for (let i = 0; i < 100; i++) {
      tokens.add(generateOpaqueToken());
    }
    expect(tokens.size).toBe(100);
  });
});
