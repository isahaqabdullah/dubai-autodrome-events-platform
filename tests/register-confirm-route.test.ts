import { beforeEach, describe, expect, it, vi } from "vitest";

const testState = vi.hoisted(() => ({
  confirmResult: {
    outcome: "confirmed",
    message: "Registration confirmed.",
    eventId: "event-1"
  } as Record<string, unknown>,
  event: {
    id: "event-1",
    slug: "track-day-april-2026"
  } as { id: string; slug: string } | null,
  revalidatedPaths: [] as string[],
  waitUntilCalls: 0
}));

vi.mock("@vercel/functions", () => ({
  waitUntil: (promise: Promise<unknown>) => {
    testState.waitUntilCalls += 1;
    void promise;
  }
}));

vi.mock("next/cache", () => ({
  revalidatePath: (path: string) => {
    testState.revalidatedPaths.push(path);
  }
}));

vi.mock("@/lib/request", () => ({
  getClientIp: () => "127.0.0.1"
}));

vi.mock("@/lib/validation/registration", () => ({
  registrationCompleteSchema: {
    safeParse: (payload: unknown) => ({
      success: true,
      data: payload
    })
  }
}));

vi.mock("@/services/email-worker", () => ({
  runEmailWorker: vi.fn(async () => undefined)
}));

vi.mock("@/services/registration", () => ({
  confirmRegistrationFromOtp: vi.fn(async () => testState.confirmResult)
}));

vi.mock("@/services/events", () => ({
  getEventById: vi.fn(async () => testState.event)
}));

import { POST } from "@/app/api/register/confirm/route";

describe("POST /api/register/confirm", () => {
  beforeEach(() => {
    testState.confirmResult = {
      outcome: "confirmed",
      message: "Registration confirmed.",
      eventId: "event-1"
    };
    testState.event = {
      id: "event-1",
      slug: "track-day-april-2026"
    };
    testState.revalidatedPaths = [];
    testState.waitUntilCalls = 0;
  });

  it("revalidates the public event pages after a confirmed registration", async () => {
    const response = await POST(new Request("http://localhost/api/register/confirm", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        eventId: "event-1",
        otp: "123456"
      })
    }));

    expect(response.status).toBe(200);
    expect(testState.revalidatedPaths).toEqual([
      "/events",
      "/events/track-day-april-2026"
    ]);
    expect(testState.waitUntilCalls).toBe(1);
  });

  it("does not revalidate when confirmation fails", async () => {
    testState.confirmResult = {
      outcome: "invalid",
      message: "Invalid code."
    };

    const response = await POST(new Request("http://localhost/api/register/confirm", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        eventId: "event-1",
        otp: "123456"
      })
    }));

    expect(response.status).toBe(400);
    expect(testState.revalidatedPaths).toEqual([]);
    expect(testState.waitUntilCalls).toBe(0);
  });
});
