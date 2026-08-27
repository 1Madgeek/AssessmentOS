import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
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

describe("API golden path (unit coding + bearer tokens)", () => {
  let app: FastifyInstance;
  let mailer: ReturnType<typeof createMailer>;
  const email = `test+${Date.now()}@assessmentos.dev`;
  const password = "password12345";

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
    });
    await app.ready();
  }, 30_000);

  afterAll(async () => {
    await app.close();
  });

  async function startWithOtp(
    token: string,
    candidateName: string,
    candidateEmail: string,
  ) {
    mailer.sent!.length = 0;
    const otpRes = await app.inject({
      method: "POST",
      url: `/invites/${token}/otp`,
      payload: { candidateEmail },
    });
    expect(otpRes.statusCode).toBe(200);
    const otp = otpFromMailer(mailer);
    return app.inject({
      method: "POST",
      url: `/invites/${token}/start`,
      payload: { candidateName, candidateEmail, otp },
    });
  }
  it("registers, creates token, authors unit question, grades candidate submit", async () => {
    const register = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email, name: "Test Recruiter", password },
    });
    expect(register.statusCode).toBe(200);
    let cookies = cookieFrom(register);

    const meRes = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { cookie: cookies },
    });
    expect(meRes.statusCode).toBe(200);
    const me = meRes.json() as {
      activeOrganization: { id: string } | null;
      organizations: Array<{ id: string }>;
    };
    const organizationId =
      me.activeOrganization?.id ?? me.organizations[0]?.id;
    expect(organizationId).toBeTruthy();

    const tokenRes = await app.inject({
      method: "POST",
      url: "/auth/tokens",
      headers: { cookie: cookies },
      payload: {
        name: "ci",
        organizationId,
        scopes: [
          "assessments:read",
          "assessments:write",
          "bank:read",
          "bank:write",
          "invites:write",
          "sessions:read",
          "org:read",
        ],
      },
    });
    expect(tokenRes.statusCode).toBe(200);
    const { token: apiToken } = tokenRes.json() as { token: string };
    expect(apiToken.startsWith("aos_")).toBe(true);

    const listViaBearer = await app.inject({
      method: "GET",
      url: "/assessments",
      headers: { authorization: `Bearer ${apiToken}` },
    });
    expect(listViaBearer.statusCode).toBe(200);
    expect(listViaBearer.json()).toEqual([]);

    const created = await app.inject({
      method: "POST",
      url: "/assessments",
      headers: { authorization: `Bearer ${apiToken}` },
      payload: {
        title: `Unit path ${Date.now()}`,
        durationSeconds: 3600,
        rules: {
          allowSkip: true,
          allowReturn: true,
          perQuestionTimers: true,
          linearLock: false,
        },
      },
    });
    expect(created.statusCode).toBe(200);
    const assessmentId = (created.json() as { id: string }).id;

    const publish = await app.inject({
      method: "PATCH",
      url: `/assessments/${assessmentId}`,
      headers: { authorization: `Bearer ${apiToken}` },
      payload: { published: true },
    });
    expect(publish.statusCode).toBe(200);

    const addQ = await app.inject({
      method: "POST",
      url: `/assessments/${assessmentId}/questions`,
      headers: { authorization: `Bearer ${apiToken}` },
      payload: {
        type: "coding",
        title: "add",
        prompt: "Implement add",
        timeLimitSeconds: 600,
        points: 40,
        config: {
          language: "python",
          mode: "unit",
          framework: "pytest",
          entryFile: "solution.py",
          starterCode: "def add(a, b):\n    pass\n",
          visibleTestCode: `from solution import add

def test_visible():
    assert add(1, 1) == 2
`,
          hiddenTestCode: `from solution import add

def test_hidden_neg():
    assert add(-1, 1) == 0

def test_hidden_big():
    assert add(10, 20) == 30
`,
        },
      },
    });
    expect(addQ.statusCode).toBe(200);
    const assessment = addQ.json() as {
      questions: Array<{
        question: { id: string; title: string; config: Record<string, unknown> };
      }>;
    };
    const questionId = assessment.questions[0]!.question.id;

    const updatedQ = await app.inject({
      method: "PATCH",
      url: `/assessments/${assessmentId}/questions/${questionId}`,
      headers: { authorization: `Bearer ${apiToken}` },
      payload: { title: "add (updated)", points: 45 },
    });
    expect(updatedQ.statusCode).toBe(200);
    const updatedAssessment = updatedQ.json() as {
      questions: Array<{ question: { id: string; title: string; points: number } }>;
    };
    expect(updatedAssessment.questions[0]!.question.title).toBe("add (updated)");
    expect(updatedAssessment.questions[0]!.question.points).toBe(45);

    const invite = await app.inject({
      method: "POST",
      url: `/assessments/${assessmentId}/invites`,
      headers: { authorization: `Bearer ${apiToken}` },
      payload: { sendEmail: false },
    });
    expect(invite.statusCode).toBe(200);
    const inviteToken = (invite.json() as { token: string }).token;

    const start = await startWithOtp(
      inviteToken,
      "Cand",
      `cand+${Date.now()}@example.com`,
    );
    expect(start.statusCode).toBe(200);
    cookies = cookieFrom(start);
    const session = start.json() as {
      attempts: Array<{
        questionId: string;
        question: { config: Record<string, unknown> };
      }>;
    };
    const attempt = session.attempts.find((a) => a.questionId === questionId)!;
    expect(attempt.question.config.hiddenTestCode).toBe("");
    expect(attempt.question.config.visibleTestCode).toContain("test_visible");
    expect(JSON.stringify(attempt.question.config)).not.toContain("test_hidden");

    const open = await app.inject({
      method: "POST",
      url: `/sessions/current/questions/${questionId}/open`,
      headers: { cookie: cookies },
      payload: {},
    });
    expect(open.statusCode).toBe(200);

    const runVisible = await app.inject({
      method: "POST",
      url: `/sessions/current/questions/${questionId}/run`,
      headers: { cookie: cookies },
      payload: {
        source: "def add(a, b):\n    return a + b\n",
      },
    });
    expect(runVisible.statusCode).toBe(200);
    const visible = runVisible.json() as {
      results: Array<{ passed: boolean }>;
    };
    expect(visible.results.every((r) => r.passed)).toBe(true);

    const wrongSubmit = await app.inject({
      method: "POST",
      url: `/sessions/current/questions/${questionId}/submit`,
      headers: { cookie: cookies },
      payload: {
        answer: { source: "def add(a, b):\n    return a - b\n" },
      },
    });
    // Wrong solution on this session (score 0). A second independent session
    // (new invite + different email) verifies the correct solution scores 40.
    expect(wrongSubmit.statusCode).toBe(200);
    const wrongView = wrongSubmit.json() as {
      attempts: Array<{ questionId: string; score: number | null }>;
    };
    const wrongAttempt = wrongView.attempts.find(
      (a) => a.questionId === questionId,
    )!;
    expect(wrongAttempt.score).toBe(0);

    // Second invite — invites are single-use; grading isolation needs a new token
    const invite2 = await app.inject({
      method: "POST",
      url: `/assessments/${assessmentId}/invites`,
      headers: { authorization: `Bearer ${apiToken}` },
      payload: { sendEmail: false },
    });
    const token2 = (invite2.json() as { token: string }).token;
    const start2 = await startWithOtp(
      token2,
      "Cand2",
      `cand2+${Date.now()}@example.com`,
    );
    expect(start2.statusCode).toBe(200);
    const cookies2 = cookieFrom(start2);
    await app.inject({
      method: "POST",
      url: `/sessions/current/questions/${questionId}/open`,
      headers: { cookie: cookies2 },
      payload: {},
    });
    const goodSubmit = await app.inject({
      method: "POST",
      url: `/sessions/current/questions/${questionId}/submit`,
      headers: { cookie: cookies2 },
      payload: {
        answer: { source: "def add(a, b):\n    return a + b\n" },
      },
    });
    expect(goodSubmit.statusCode).toBe(200);
    const goodView = goodSubmit.json() as {
      id: string;
      attempts: Array<{ questionId: string; score: number | null }>;
    };
    const goodAttempt = goodView.attempts.find(
      (a) => a.questionId === questionId,
    )!;
    expect(goodAttempt.score).toBe(45);

    const sessions = await app.inject({
      method: "GET",
      url: `/assessments/${assessmentId}/sessions`,
      headers: { authorization: `Bearer ${apiToken}` },
    });
    expect(sessions.statusCode).toBe(200);
    expect((sessions.json() as unknown[]).length).toBeGreaterThanOrEqual(2);

    const review = await app.inject({
      method: "GET",
      url: `/assessments/${assessmentId}/sessions/${goodView.id}`,
      headers: { authorization: `Bearer ${apiToken}` },
    });
    expect(review.statusCode).toBe(200);

    const del = await app.inject({
      method: "DELETE",
      url: `/auth/tokens/${(tokenRes.json() as { id: string }).id}`,
      headers: { cookie: cookieFrom(register) },
    });
    // register cookie may be stale; re-login
    if (del.statusCode !== 204) {
      const login = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email, password },
      });
      const del2 = await app.inject({
        method: "DELETE",
        url: `/auth/tokens/${(tokenRes.json() as { id: string }).id}`,
        headers: { cookie: cookieFrom(login) },
      });
      expect(del2.statusCode).toBe(204);
    }

    const denied = await app.inject({
      method: "GET",
      url: "/assessments",
      headers: { authorization: `Bearer ${apiToken}` },
    });
    expect(denied.statusCode).toBe(401);
  }, 120_000);
});
