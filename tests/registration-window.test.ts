import { describe, expect, it } from "vitest";
import { getRegistrationWindowState } from "../lib/utils";

describe("getRegistrationWindowState", () => {
  const farPast = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const farFuture = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const recentPast = new Date(Date.now() - 1000).toISOString();
  const nearFuture = new Date(Date.now() + 1000).toISOString();

  it("returns closed for draft events regardless of dates", () => {
    const result = getRegistrationWindowState({
      status: "draft",
      registration_opens_at: farPast,
      registration_closes_at: farFuture
    });
    expect(result.state).toBe("closed");
  });

  it("returns closed for archived events regardless of dates", () => {
    const result = getRegistrationWindowState({
      status: "archived",
      registration_opens_at: farPast,
      registration_closes_at: farFuture
    });
    expect(result.state).toBe("closed");
  });

  it("returns closed for closed events regardless of dates", () => {
    const result = getRegistrationWindowState({
      status: "closed",
      registration_opens_at: farPast,
      registration_closes_at: farFuture
    });
    expect(result.state).toBe("closed");
  });

  it("returns open for live status with no date constraints", () => {
    const result = getRegistrationWindowState({
      status: "live",
      registration_opens_at: null,
      registration_closes_at: null
    });
    expect(result.state).toBe("open");
  });

  it("returns open for open status with no date constraints", () => {
    const result = getRegistrationWindowState({
      status: "open",
      registration_opens_at: null,
      registration_closes_at: null
    });
    expect(result.state).toBe("open");
  });

  it("returns not_open_yet when opens_at is in the future", () => {
    const result = getRegistrationWindowState({
      status: "open",
      registration_opens_at: farFuture,
      registration_closes_at: null
    });
    expect(result.state).toBe("not_open_yet");
  });

  it("returns closed when closes_at is in the past", () => {
    const result = getRegistrationWindowState({
      status: "open",
      registration_opens_at: null,
      registration_closes_at: farPast
    });
    expect(result.state).toBe("closed");
  });

  it("returns open when within both opens_at and closes_at bounds", () => {
    const result = getRegistrationWindowState({
      status: "open",
      registration_opens_at: farPast,
      registration_closes_at: farFuture
    });
    expect(result.state).toBe("open");
  });

  it("returns not_open_yet when opens_at is barely in the future", () => {
    const result = getRegistrationWindowState({
      status: "open",
      registration_opens_at: nearFuture,
      registration_closes_at: farFuture
    });
    expect(result.state).toBe("not_open_yet");
  });

  it("returns closed when closes_at is barely in the past", () => {
    const result = getRegistrationWindowState({
      status: "open",
      registration_opens_at: farPast,
      registration_closes_at: recentPast
    });
    expect(result.state).toBe("closed");
  });

  it("returns open for live status that has passed opens_at", () => {
    const result = getRegistrationWindowState({
      status: "live",
      registration_opens_at: farPast,
      registration_closes_at: farFuture
    });
    expect(result.state).toBe("open");
  });

  it("returns closed for live status when closes_at has passed", () => {
    const result = getRegistrationWindowState({
      status: "live",
      registration_opens_at: farPast,
      registration_closes_at: farPast
    });
    expect(result.state).toBe("closed");
  });
});
