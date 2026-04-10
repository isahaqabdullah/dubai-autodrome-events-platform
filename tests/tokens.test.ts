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
});
