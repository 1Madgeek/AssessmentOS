import { describe, expect, it } from "vitest";
import { nextRateLimitState } from "./invite-rate-limit.js";

describe("nextRateLimitState", () => {
  const windowMs = 15 * 60 * 1000;
  const limit = 10;
  const now = 1_000_000;

  it("allows first request and starts a window", () => {
    expect(
      nextRateLimitState({ now, windowMs, limit, existing: null }),
    ).toEqual({ allowed: true, count: 1, windowStartedAt: now });
  });

  it("increments within the window under the limit", () => {
    expect(
      nextRateLimitState({
        now: now + 1000,
        windowMs,
        limit,
        existing: { windowStartedAt: now, count: 3 },
      }),
    ).toEqual({ allowed: true, count: 4, windowStartedAt: now });
  });

  it("denies when at the limit", () => {
    expect(
      nextRateLimitState({
        now: now + 1000,
        windowMs,
        limit,
        existing: { windowStartedAt: now, count: 10 },
      }),
    ).toEqual({ allowed: false, count: 10, windowStartedAt: now });
  });

  it("resets after the window expires", () => {
    expect(
      nextRateLimitState({
        now: now + windowMs,
        windowMs,
        limit,
        existing: { windowStartedAt: now, count: 10 },
      }),
    ).toEqual({ allowed: true, count: 1, windowStartedAt: now + windowMs });
  });
});
