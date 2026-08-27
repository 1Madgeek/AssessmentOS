import { createHash, randomInt, timingSafeEqual } from "node:crypto";

export const OTP_LENGTH = 6;
export const OTP_TTL_MS = 10 * 60 * 1000;
export const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_EXPIRES_IN_SECONDS = Math.floor(OTP_TTL_MS / 1000);

export function generateOtp(): string {
  const max = 10 ** OTP_LENGTH;
  return String(randomInt(0, max)).padStart(OTP_LENGTH, "0");
}

export function hashOtp(args: {
  otp: string;
  inviteId: string;
  secret: string;
}): string {
  return createHash("sha256")
    .update(`${args.otp}:${args.inviteId}:${args.secret}`)
    .digest("hex");
}

export function verifyOtpHash(args: {
  otp: string;
  inviteId: string;
  secret: string;
  expectedHash: string;
}): boolean {
  const actual = hashOtp(args);
  const a = Buffer.from(actual, "utf8");
  const b = Buffer.from(args.expectedHash, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export const clearedOtpFields = {
  otpHash: null as string | null,
  otpExpiresAt: null as Date | null,
  otpAttempts: 0,
  otpSentAt: null as Date | null,
  otpEmail: null as string | null,
};

/** Clear OTP secret but keep cooldown clock after max failed attempts. */
export function lockoutOtpFields(now = new Date()) {
  return {
    otpHash: null as string | null,
    otpExpiresAt: null as Date | null,
    otpAttempts: OTP_MAX_ATTEMPTS,
    otpSentAt: now,
    otpEmail: null as string | null,
  };
}
