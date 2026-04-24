import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  env: {
    APP_URL: "https://example.com"
  },
  getNgeniusConfig: () => ({
    environment: "uat",
    apiBaseUrl: "https://api-gateway-uat.ngenius-payments.com",
    apiKey: "api-key",
    outletRef: "outlet-ref"
  })
}));

import { buildNgeniusOrderSummary, getNgeniusOrderAmount, interpretNgeniusOrder } from "@/services/ngenius";

describe("N-Genius order interpretation", () => {
  it("treats PURCHASED as paid", () => {
    expect(interpretNgeniusOrder({ state: "PURCHASED" })).toEqual({
      kind: "paid",
      state: "PURCHASED"
    });
  });

  it("keeps CAPTURED in manual review until UAT confirms it", () => {
    expect(interpretNgeniusOrder({ state: "CAPTURED" })).toEqual({
      kind: "manual_review",
      state: "CAPTURED"
    });
  });

  it("extracts order amount and currency", () => {
    expect(getNgeniusOrderAmount({
      amount: {
        value: 12345,
        currencyCode: "AED"
      }
    })).toEqual({
      value: 12345,
      currencyCode: "AED"
    });
  });

  it("builds categorized order summary with N-Genius field names", () => {
    expect(buildNgeniusOrderSummary({
      currencyCode: "AED",
      amountMinor: 15000,
      items: [
        { name: "Runner", quantity: 1, amountMinor: 10000 },
        { name: "Bootcamp", quantity: 1, amountMinor: 5000 }
      ]
    })).toEqual({
      total: {
        currencyCode: "AED",
        value: 15000
      },
      items: [
        {
          category: "Tickets",
          description: "Runner",
          quantity: 1,
          totalPrice: {
            currencyCode: "AED",
            value: 10000
          }
        },
        {
          category: "Tickets",
          description: "Bootcamp",
          quantity: 1,
          totalPrice: {
            currencyCode: "AED",
            value: 5000
          }
        }
      ]
    });
  });
});
