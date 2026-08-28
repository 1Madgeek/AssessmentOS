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

function otpFromMailer(mailer: ReturnType<typeof createMailer>): string {
  const last = mailer.sent![mailer.sent!.length - 1]!;
  const m = /\b(\d{6})\b/.exec(last.text) ?? /\b(\d{6})\b/.exec(last.html);
  if (!m) throw new Error(`No OTP in mail: ${last.text}`);
  return m[1]!;
}

describe("invite lifecycle", () => {
  let app: FastifyInstance;
  let mailer: ReturnType<typeof createMailer>;
  const email = `invite-test+${Date.now()}@assessmentos.dev`;
  const password = "password12345";
  let cookies = "";
  let assessmentId = "";

  async function requestOtp(token: string, candidateEmail: string) {
    mailer.sent!.length = 0;
    const res = await app.inject({
      method: "POST",
      url: `/invites/${token}/otp`,
      payload: { candidateEmail },
    });
    return res;
  }

  async function startWithOtp(args: {
    token: string;
    candidateName: string;
    candidateEmail: string;
  }) {
    const otpRes = await requestOtp(args.token, args.candidateEmail);
    if (otpRes.statusCode !== 200) return otpRes;
    const otp = otpFromMailer(mailer);
    return app.inject({
      method: "POST",
      url: `/invites/${args.token}/start`,
      payload: {
        candidateName: args.candidateName,
        candidateEmail: args.candidateEmail,
        otp,
      },
    });
  }

  beforeAll(async () => {
    mailer = createMailer({});
    app = await buildApp({
      databaseUrl,
      corsOrigin: "http://localhost:3000",
      sessionSecret: "test-secret",
      useMockRunner: true,
      webOrigin: "http://localhost:3000",
      mailer,
      inviteOtpIpLimit: 10_000,
      inviteStartIpLimit: 10_000,
      allowPublicRegister: true,
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
    const q = await app.inject({
      method: "POST",
      url: `/assessments/${assessmentId}/questions`,
      headers: { cookie: cookies },
      payload: {
        type: "mcq",
        title: "Q1",
        prompt: "Pick one",
        timeLimitSeconds: 60,
        points: 1,
        config: {
          multiSelect: false,
          options: [
            { id: "a", label: "A" },
            { id: "b", label: "B" },
          ],
          correctOptionIds: ["a"],
        },
      },
    });
    expect(q.statusCode).toBe(200);
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

  it("GET invite never returns candidate email or name", async () => {
    const created = await app.inject({
      method: "POST",
      url: `/assessments/${assessmentId}/invites`,
      headers: { cookie: cookies },
      payload: {
        candidateEmail: "secret@example.com",
        candidateName: "Secret Name",
        sendEmail: false,
      },
    });
    const token = (created.json() as { token: string }).token;
    const get = await app.inject({ method: "GET", url: `/invites/${token}` });
    expect(get.statusCode).toBe(200);
    const body = get.json() as Record<string, unknown>;
    expect(body.emailBound).toBe(true);
    expect(body).not.toHaveProperty("candidateEmail");
    expect(body).not.toHaveProperty("candidateName");
    expect(JSON.stringify(body)).not.toContain("secret@example.com");
    expect(JSON.stringify(body)).not.toContain("Secret Name");
  });

  it("requires OTP before start", async () => {
    const created = await app.inject({
      method: "POST",
      url: `/assessments/${assessmentId}/invites`,
      headers: { cookie: cookies },
      payload: { sendEmail: false },
    });
    const token = (created.json() as { token: string }).token;
    const candEmail = `otp-req+${Date.now()}@example.com`;

    const noOtp = await app.inject({
      method: "POST",
      url: `/invites/${token}/start`,
      payload: {
        candidateName: "No Code",
        candidateEmail: candEmail,
      },
    });
    expect(noOtp.statusCode).toBe(400);

    const missing = await app.inject({
      method: "POST",
      url: `/invites/${token}/start`,
      payload: {
        candidateName: "No Code",
        candidateEmail: candEmail,
        otp: "123456",
      },
    });
    expect(missing.statusCode).toBe(401);

    const wrong = await requestOtp(token, candEmail);
    expect(wrong.statusCode).toBe(200);
    const bad = await app.inject({
      method: "POST",
      url: `/invites/${token}/start`,
      payload: {
        candidateName: "Wrong",
        candidateEmail: candEmail,
        otp: "000000",
      },
    });
    expect(bad.statusCode).toBe(401);

    const otp = otpFromMailer(mailer);
    const ok = await app.inject({
      method: "POST",
      url: `/invites/${token}/start`,
      payload: {
        candidateName: "Ok",
        candidateEmail: candEmail,
        otp,
      },
    });
    expect(ok.statusCode).toBe(200);
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
    const email1 = `one+${Date.now()}@example.com`;

    const start1 = await startWithOtp({
      token,
      candidateName: "One",
      candidateEmail: email1,
    });
    expect(start1.statusCode).toBe(200);

    const start2 = await startWithOtp({
      token,
      candidateName: "Two",
      candidateEmail: `two+${Date.now()}@example.com`,
    });
    expect(start2.statusCode).toBe(410);
  });

  it("enforces bound email on OTP request and start", async () => {
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

    const mismatchOtp = await requestOtp(token, "other@example.com");
    expect(mismatchOtp.statusCode).toBe(403);

    const ok = await startWithOtp({
      token,
      candidateName: "Bound",
      candidateEmail: "bound@example.com",
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

    const start = await startWithOtp({
      token,
      candidateName: "Late",
      candidateEmail: `late+${Date.now()}@example.com`,
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

    const start = await startWithOtp({
      token,
      candidateName: "X",
      candidateEmail: `x+${Date.now()}@example.com`,
    });
    expect(start.statusCode).toBe(410);
  });

  it("rejects a second pending invite for the same email", async () => {
    const addr = `dup+${Date.now()}@example.com`;
    const first = await app.inject({
      method: "POST",
      url: `/assessments/${assessmentId}/invites`,
      headers: { cookie: cookies },
      payload: { candidateEmail: addr, sendEmail: false },
    });
    expect(first.statusCode).toBe(200);

    const second = await app.inject({
      method: "POST",
      url: `/assessments/${assessmentId}/invites`,
      headers: { cookie: cookies },
      payload: { candidateEmail: addr, sendEmail: false },
    });
    expect(second.statusCode).toBe(409);
    expect((second.json() as { error: string }).error).toContain("pending invite");
  });

  it("lists expired pending invites with status expired", async () => {
    const created = await app.inject({
      method: "POST",
      url: `/assessments/${assessmentId}/invites`,
      headers: { cookie: cookies },
      payload: {
        candidateEmail: `exp-list+${Date.now()}@example.com`,
        sendEmail: false,
      },
    });
    expect(created.statusCode).toBe(200);
    const { id } = created.json() as { id: string };
    const db = createDb(databaseUrl);
    await db
      .update(invites)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(invites.id, id));

    const list = await app.inject({
      method: "GET",
      url: `/assessments/${assessmentId}/invites`,
      headers: { cookie: cookies },
    });
    expect(list.statusCode).toBe(200);
    const row = (list.json() as Array<{ id: string; status: string }>).find(
      (r) => r.id === id,
    );
    expect(row?.status).toBe("expired");
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
        await startWithOtp({
          token: token1,
          candidateName: "Retake",
          candidateEmail: emailAddr,
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
        await startWithOtp({
          token: token2,
          candidateName: "Retake",
          candidateEmail: emailAddr,
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

describe("invite captcha and IP rate limit", () => {
  let app: FastifyInstance;
  let mailer: ReturnType<typeof createMailer>;
  const email = `invite-rl+${Date.now()}@assessmentos.dev`;
  const password = "password12345";
  let cookies = "";
  let assessmentId = "";
  let verifyOk = true;

  beforeAll(async () => {
    mailer = createMailer({});
    app = await buildApp({
      databaseUrl,
      corsOrigin: "http://localhost:3000",
      sessionSecret: "test-secret",
      useMockRunner: true,
      webOrigin: "http://localhost:3000",
      mailer,
      turnstileSecretKey: "test-turnstile-secret",
      verifyTurnstile: async () => verifyOk,
      trustProxy: true,
      inviteOtpIpLimit: 2,
      inviteStartIpLimit: 2,
      inviteIpWindowMs: 15 * 60 * 1000,
      allowPublicRegister: true,
    });
    await app.ready();

    const register = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email, name: "RL Tester", password },
    });
    expect(register.statusCode).toBe(200);
    cookies = cookieFrom(register);

    const created = await app.inject({
      method: "POST",
      url: "/assessments",
      headers: { cookie: cookies },
      payload: {
        title: `Invite RL ${Date.now()}`,
        durationSeconds: 3600,
      },
    });
    assessmentId = (created.json() as { id: string }).id;
    const q = await app.inject({
      method: "POST",
      url: `/assessments/${assessmentId}/questions`,
      headers: { cookie: cookies },
      payload: {
        type: "mcq",
        title: "Q1",
        prompt: "Pick one",
        timeLimitSeconds: 60,
        points: 1,
        config: {
          multiSelect: false,
          options: [
            { id: "a", label: "A" },
            { id: "b", label: "B" },
          ],
          correctOptionIds: ["a"],
        },
      },
    });
    expect(q.statusCode).toBe(200);
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

  async function createInviteToken() {
    const candidateEmail = `rl-inv+${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;
    const created = await app.inject({
      method: "POST",
      url: `/assessments/${assessmentId}/invites`,
      headers: { cookie: cookies },
      payload: {
        candidateEmail,
        sendEmail: false,
      },
    });
    expect(created.statusCode).toBe(200);
    return {
      token: (created.json() as { token: string }).token,
      candidateEmail,
    };
  }

  it("rejects OTP when CAPTCHA fails", async () => {
    verifyOk = false;
    const { token, candidateEmail } = await createInviteToken();
    const res = await app.inject({
      method: "POST",
      url: `/invites/${token}/otp`,
      headers: { "x-forwarded-for": `203.0.113.${Date.now() % 200}` },
      payload: {
        candidateEmail,
        captchaToken: "bad",
      },
    });
    expect(res.statusCode).toBe(400);
    expect((res.json() as { error: string }).error).toContain("CAPTCHA");
    verifyOk = true;
  });

  it("accepts OTP when CAPTCHA passes", async () => {
    verifyOk = true;
    const { token, candidateEmail } = await createInviteToken();
    const res = await app.inject({
      method: "POST",
      url: `/invites/${token}/otp`,
      headers: { "x-forwarded-for": `198.51.100.${Date.now() % 200}` },
      payload: {
        candidateEmail,
        captchaToken: "good",
      },
    });
    expect(res.statusCode).toBe(200);
  });

  it("rate-limits OTP by IP", async () => {
    verifyOk = true;
    const ip = `192.0.2.${(Date.now() % 50) + 1}`;
    const first = await createInviteToken();

    expect(
      (
        await app.inject({
          method: "POST",
          url: `/invites/${first.token}/otp`,
          headers: { "x-forwarded-for": ip },
          payload: {
            candidateEmail: first.candidateEmail,
            captchaToken: "good",
          },
        })
      ).statusCode,
    ).toBe(200);

    // Resend cooldown would 429; use a fresh invite for second allowed call
    const second = await createInviteToken();
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/invites/${second.token}/otp`,
          headers: { "x-forwarded-for": ip },
          payload: {
            candidateEmail: second.candidateEmail,
            captchaToken: "good",
          },
        })
      ).statusCode,
    ).toBe(200);

    const third = await createInviteToken();
    const blocked = await app.inject({
      method: "POST",
      url: `/invites/${third.token}/otp`,
      headers: { "x-forwarded-for": ip },
      payload: {
        candidateEmail: third.candidateEmail,
        captchaToken: "good",
      },
    });
    expect(blocked.statusCode).toBe(429);
    expect((blocked.json() as { error: string }).error).toContain(
      "Too many requests",
    );
  });
});
