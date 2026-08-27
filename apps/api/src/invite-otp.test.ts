import { describe, expect, it } from "vitest";
import {
  generateOtp,
  hashOtp,
  verifyOtpHash,
} from "./invite-otp.js";

describe("invite-otp", () => {
  it("generates 6-digit codes", () => {
    for (let i = 0; i < 20; i++) {
      expect(generateOtp()).toMatch(/^\d{6}$/);
    }
  });

  it("hashes and verifies with timing-safe compare", () => {
    const otp = "123456";
    const hash = hashOtp({
      otp,
      inviteId: "inv-1",
      secret: "test-secret",
    });
    expect(
      verifyOtpHash({
        otp,
        inviteId: "inv-1",
        secret: "test-secret",
        expectedHash: hash,
      }),
    ).toBe(true);
    expect(
      verifyOtpHash({
        otp: "000000",
        inviteId: "inv-1",
        secret: "test-secret",
        expectedHash: hash,
      }),
    ).toBe(false);
  });
});
