import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { Db } from "@assessment-os/db";
import {
  organizationWebhooks,
  webhookDeliveries,
} from "@assessment-os/db";

export function newWebhookSecret(): string {
  return randomBytes(32).toString("hex");
}

export function signWebhookBody(secret: string, rawBody: string): string {
  const hex = createHmac("sha256", secret).update(rawBody).digest("hex");
  return `sha256=${hex}`;
}

export type SessionCompletedPayload = {
  event: "session.completed";
  organizationId: string;
  assessmentId: string;
  sessionId: string;
  candidateEmail: string;
  status: string;
  totalScore: number | null;
  maxScore: number | null;
  submittedAt: string | null;
};

async function deliverOnce(
  url: string,
  secret: string,
  rawBody: string,
): Promise<{ statusCode: number; ok: boolean; error?: string }> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-AssessmentOS-Event": "session.completed",
        "X-AssessmentOS-Signature": signWebhookBody(secret, rawBody),
      },
      body: rawBody,
      signal: AbortSignal.timeout(10_000),
    });
    return { statusCode: res.status, ok: res.ok };
  } catch (err) {
    return {
      statusCode: 0,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export function enqueueSessionCompletedWebhook(
  db: Db,
  payload: SessionCompletedPayload,
): void {
  setImmediate(() => {
    void dispatchSessionCompleted(db, payload).catch((err) => {
      console.error("[webhook] dispatch failed", err);
    });
  });
}

async function dispatchSessionCompleted(
  db: Db,
  payload: SessionCompletedPayload,
): Promise<void> {
  const hooks = await db
    .select()
    .from(organizationWebhooks)
    .where(
      and(
        eq(organizationWebhooks.organizationId, payload.organizationId),
        eq(organizationWebhooks.enabled, true),
      ),
    );
  const eventId = randomUUID();
  const rawBody = JSON.stringify(payload);

  for (const hook of hooks) {
    if (!hook.events.includes("session.completed")) continue;
    let attempts = 0;
    let last: { statusCode: number; ok: boolean; error?: string } = {
      statusCode: 0,
      ok: false,
    };
    for (let i = 0; i < 3; i++) {
      attempts += 1;
      last = await deliverOnce(hook.url, hook.secret, rawBody);
      if (last.ok) break;
      await new Promise((r) => setTimeout(r, 250 * 2 ** i));
    }
    await db.insert(webhookDeliveries).values({
      webhookId: hook.id,
      eventId,
      payload,
      statusCode: last.statusCode || null,
      success: last.ok,
      attempts,
      lastError: last.error ?? (last.ok ? null : `HTTP ${last.statusCode}`),
    });
  }
}
