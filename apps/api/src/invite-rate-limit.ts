import { and, eq } from "drizzle-orm";
import { inviteIpRateLimits, type Db } from "@assessment-os/db";

export const INVITE_OTP_IP_LIMIT = 10;
export const INVITE_START_IP_LIMIT = 20;
export const INVITE_IP_WINDOW_MS = 15 * 60 * 1000;

export type InviteRateAction = "otp" | "start";

/** Pure window math for unit tests. */
export function nextRateLimitState(args: {
  now: number;
  windowMs: number;
  limit: number;
  existing: { windowStartedAt: number; count: number } | null;
}): { allowed: boolean; count: number; windowStartedAt: number } {
  const { now, windowMs, limit, existing } = args;
  if (!existing || now - existing.windowStartedAt >= windowMs) {
    return { allowed: true, count: 1, windowStartedAt: now };
  }
  if (existing.count >= limit) {
    return {
      allowed: false,
      count: existing.count,
      windowStartedAt: existing.windowStartedAt,
    };
  }
  return {
    allowed: true,
    count: existing.count + 1,
    windowStartedAt: existing.windowStartedAt,
  };
}

function isUniqueViolation(err: unknown): boolean {
  return Boolean(
    err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code?: string }).code === "23505",
  );
}

export async function consumeInviteIpRateLimit(args: {
  db: Db;
  ip: string;
  action: InviteRateAction;
  limit: number;
  windowMs: number;
  now?: Date;
  _retry?: boolean;
}): Promise<{ allowed: boolean; retryAfterSeconds?: number }> {
  const now = args.now ?? new Date();
  const ip = args.ip.trim() || "unknown";

  const existing = (
    await args.db
      .select()
      .from(inviteIpRateLimits)
      .where(
        and(
          eq(inviteIpRateLimits.ip, ip),
          eq(inviteIpRateLimits.action, args.action),
        ),
      )
      .limit(1)
  )[0];

  const next = nextRateLimitState({
    now: now.getTime(),
    windowMs: args.windowMs,
    limit: args.limit,
    existing: existing
      ? {
          windowStartedAt: existing.windowStartedAt.getTime(),
          count: existing.count,
        }
      : null,
  });

  if (!next.allowed) {
    const elapsed = now.getTime() - next.windowStartedAt;
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((args.windowMs - elapsed) / 1000),
    );
    return { allowed: false, retryAfterSeconds };
  }

  const windowStartedAt = new Date(next.windowStartedAt);
  if (existing) {
    await args.db
      .update(inviteIpRateLimits)
      .set({ count: next.count, windowStartedAt })
      .where(eq(inviteIpRateLimits.id, existing.id));
  } else {
    try {
      await args.db.insert(inviteIpRateLimits).values({
        ip,
        action: args.action,
        count: next.count,
        windowStartedAt,
      });
    } catch (err) {
      if (!args._retry && isUniqueViolation(err)) {
        return consumeInviteIpRateLimit({ ...args, _retry: true });
      }
      throw err;
    }
  }

  return { allowed: true };
}
