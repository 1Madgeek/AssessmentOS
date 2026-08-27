import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { createDb, invites } from "@assessment-os/db";
import { buildApp } from "./app.js";
import { createMailer } from "./mailer.js";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://assessment:assessment@localhost:5433/assessmentos";

function cookieFrom(res: { headers: Record<string, unknown> }): string {
  const raw = res.headers["set-cookie"];
  if (!raw) return "";
  const list = Array.isArray(raw) ? raw : [raw];
  return list.map((c) => String(c).split(";")[0]).join("; ");
}

describe("invite lifecycle", () => {
  let app: FastifyInstance;
  let mailer: ReturnType<typeof createMailer>;
  const email = `invite-test+${Date.now()}@assessmentos.dev`;
  const password = "password12345";
  let cookies = "";
  let assessmentId = "";

  beforeAll(async () => {
    mailer = createMailer({});
    app = await buildApp({
      databaseUrl,
      corsOrigin: "http://localhost:3000",
      sessionSecret: "test-secret",
      useMockRunner: true,
      webOrigin: "http://localhost:3000",
      mailer,
    });
    await app.ready();

    const register = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email, name: "Invite Tester", password },
    });
    expect(register.statusCode).toBe(200);
    cookies = cookieFrom(register);

    const created = await app.inject({
      method: "POST",
      url: "/assessments",
      headers: { cookie: cookies },
      payload: {
        title: `Invite policy ${Date.now()}`,
        durationSeconds: 3600,
      },
    });
    assessmentId = (created.json() as { id: string }).id;
    await app.inject({
      method: "PATCH",
      url: `/assessments/${assessmentId}`,
      headers: { cookie: cookies },
      payload: { published: true },
    });
  }, 30_000);

  afterAll(async () => {
    await app.close();
  });

  it("blocks second start on the same invite token", async () => {
    const created = await app.inject({
      method: "POST",
      url: `/assessments/${assessmentId}/invites`,
      headers: { cookie: cookies },
      payload: { sendEmail: false },
    });
    expect(created.statusCode).toBe(200);
    const token = (created.json() as { token: string }).token;

    const start1 = await app.inject({
      method: "POST",
      url: `/invites/${token}/start`,
      payload: {
        candidateName: "One",
        candidateEmail: `one+${Date.now()}@example.com`,
      },
    });
    expect(start1.statusCode).toBe(200);

    const start2 = await app.inject({
      method: "POST",
      url: `/invites/${token}/start`,
      payload: {
        candidateName: "Two",
        candidateEmail: `two+${Date.now()}@example.com`,
      },
    });
    expect(start2.statusCode).toBe(410);
  });

  it("enforces bound email on start", async () => {
    const created = await app.inject({
      method: "POST",
      url: `/assessments/${assessmentId}/invites`,
      headers: { cookie: cookies },
      payload: {
        candidateEmail: "bound@example.com",
        candidateName: "Bound",
        sendEmail: false,
      },
    });
    const token = (created.json() as { token: string }).token;

    const mismatch = await app.inject({
      method: "POST",
      url: `/invites/${token}/start`,
      payload: {
        candidateName: "Bound",
        candidateEmail: "other@example.com",
      },
    });
    expect(mismatch.statusCode).toBe(403);

    const ok = await app.inject({
      method: "POST",
      url: `/invites/${token}/start`,
      payload: {
        candidateName: "Bound",
        candidateEmail: "Bound@example.com",
      },
    });
    expect(ok.statusCode).toBe(200);
  });

  it("rejects expired invites on GET and start", async () => {
    const created = await app.inject({
      method: "POST",
      url: `/assessments/${assessmentId}/invites`,
      headers: { cookie: cookies },
      payload: { sendEmail: false },
    });
    const { id, token } = created.json() as { id: string; token: string };
    const db = createDb(databaseUrl);
    await db
      .update(invites)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(invites.id, id));

    const get = await app.inject({ method: "GET", url: `/invites/${token}` });
    expect(get.statusCode).toBe(410);

    const start = await app.inject({
      method: "POST",
      url: `/invites/${token}/start`,
      payload: {
        candidateName: "Late",
        candidateEmail: `late+${Date.now()}@example.com`,
      },
    });
    expect(start.statusCode).toBe(410);
  });

  it("rejects revoked invites", async () => {
    const created = await app.inject({
      method: "POST",
      url: `/assessments/${assessmentId}/invites`,
      headers: { cookie: cookies },
      payload: { sendEmail: false },
    });
    const { id, token } = created.json() as { id: string; token: string };

    const revoked = await app.inject({
      method: "POST",
      url: `/assessments/${assessmentId}/invites/${id}/revoke`,
      headers: { cookie: cookies },
      payload: {},
    });
    expect(revoked.statusCode).toBe(200);
    expect((revoked.json() as { status: string }).status).toBe("revoked");

    const start = await app.inject({
      method: "POST",
      url: `/invites/${token}/start`,
      payload: {
        candidateName: "X",
        candidateEmail: `x+${Date.now()}@example.com`,
      },
    });
    expect(start.statusCode).toBe(410);
  });

  it("allows retake via a new invite for the same email", async () => {
    const emailAddr = `retake+${Date.now()}@example.com`;
    const first = await app.inject({
      method: "POST",
      url: `/assessments/${assessmentId}/invites`,
      headers: { cookie: cookies },
      payload: { candidateEmail: emailAddr, sendEmail: false },
    });
    const token1 = (first.json() as { token: string }).token;
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/invites/${token1}/start`,
          payload: { candidateName: "Retake", candidateEmail: emailAddr },
        })
      ).statusCode,
    ).toBe(200);

    const second = await app.inject({
      method: "POST",
      url: `/assessments/${assessmentId}/invites`,
      headers: { cookie: cookies },
      payload: { candidateEmail: emailAddr, sendEmail: false },
    });
    const token2 = (second.json() as { token: string }).token;
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/invites/${token2}/start`,
          payload: { candidateName: "Retake", candidateEmail: emailAddr },
        })
      ).statusCode,
    ).toBe(200);
  });

  it("sends invite email on create and resend using templates", async () => {
    mailer.sent!.length = 0;
    const created = await app.inject({
      method: "POST",
      url: `/assessments/${assessmentId}/invites`,
      headers: { cookie: cookies },
      payload: {
        candidateEmail: `mail+${Date.now()}@example.com`,
        candidateName: "Mailer",
        sendEmail: true,
      },
    });
    expect(created.statusCode).toBe(200);
    const body = created.json() as {
      id: string;
      url: string;
      emailed: boolean;
      lastEmailedAt: string | null;
    };
    expect(body.emailed).toBe(true);
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent![0]!.subject).toContain("You're invited");
    expect(mailer.sent![0]!.html).toContain(body.url);
    expect(body.lastEmailedAt).toBeTruthy();

    await app.inject({
      method: "PATCH",
      url: "/email-templates/invite",
      headers: { cookie: cookies },
      payload: { subject: "Custom invite: {{assessmentTitle}}" },
    });

    mailer.sent!.length = 0;
    const resent = await app.inject({
      method: "POST",
      url: `/assessments/${assessmentId}/invites/${body.id}/resend`,
      headers: { cookie: cookies },
      payload: {},
    });
    expect(resent.statusCode).toBe(200);
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent![0]!.subject.startsWith("Custom invite:")).toBe(true);

    const reset = await app.inject({
      method: "POST",
      url: "/email-templates/invite/reset",
      headers: { cookie: cookies },
      payload: {},
    });
    expect(reset.statusCode).toBe(200);
    expect((reset.json() as { subject: string }).subject).toContain(
      "{{assessmentTitle}}",
    );
  });
});
