import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import { and, asc, count, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { assessmentRulesSchema } from "@assessment-os/core";
import { createDb } from "@assessment-os/db";
import {
  activityEvents,
  apiTokens,
  assessmentQuestions,
  assessments,
  candidateSessions,
  emailTemplates,
  invites,
  questionAttempts,
  questions,
  recruiters,
} from "@assessment-os/db";
import {
  JUDGE0_LANGUAGE_IDS,
  type CodingConfig,
} from "@assessment-os/question-coding";
import { createRunner, runSqlChecks, type CodeRunner } from "@assessment-os/runner";
import type { SqlConfig } from "@assessment-os/question-sql";
import {
  apiTokenPrefix,
  clearRecruiterSession,
  createRecruiterSession,
  getCandidateSessionId,
  getRecruiterFromRequest,
  hashPassword,
  hashToken,
  newApiToken,
  newToken,
  requireRecruiter,
  setCandidateSessionCookie,
  verifyPassword,
} from "./auth.js";
import {
  INVITE_OTP_TEMPLATE_KEY,
  INVITE_TEMPLATE_KEY,
  ensureDefaultInviteTemplate,
  getInviteOtpTemplate,
  getInviteTemplate,
  renderTemplate,
  resetInviteOtpTemplate,
  resetInviteTemplate,
} from "./email-templates.js";
import {
  OTP_EXPIRES_IN_SECONDS,
  OTP_MAX_ATTEMPTS,
  OTP_RESEND_COOLDOWN_MS,
  OTP_TTL_MS,
  clearedOtpFields,
  generateOtp,
  hashOtp,
  lockoutOtpFields,
  verifyOtpHash,
} from "./invite-otp.js";
import {
  INVITE_IP_WINDOW_MS,
  INVITE_OTP_IP_LIMIT,
  INVITE_START_IP_LIMIT,
  consumeInviteIpRateLimit,
} from "./invite-rate-limit.js";
import { createMailer, type Mailer } from "./mailer.js";
import { createPluginRegistry } from "./plugins-registry.js";
import {
  applyOpen,
  applySave,
  applySkip,
  applySubmitQuestion,
  applySubmitSession,
  buildSessionView,
  initializeAttempts,
} from "./session-service.js";
import {
  createTurnstileVerifier,
  type TurnstileVerifyFn,
} from "./turnstile.js";

export type AppEnv = {
  databaseUrl: string;
  corsOrigin: string;
  sessionSecret: string;
  judge0Url?: string;
  useMockRunner?: boolean;
  webOrigin: string;
  /** Injected for tests; defaults to createRunner(). */
  runner?: CodeRunner;
  resendApiKey?: string;
  emailFrom?: string;
  /** Injected for tests; defaults to createMailer(). */
  mailer?: Mailer;
  turnstileSecretKey?: string;
  /** Injected for tests; defaults to createTurnstileVerifier(). */
  verifyTurnstile?: TurnstileVerifyFn;
  trustProxy?: boolean;
  inviteOtpIpLimit?: number;
  inviteStartIpLimit?: number;
  inviteIpWindowMs?: number;
};

function inviteUrl(webOrigin: string, token: string): string {
  return `${webOrigin.replace(/\/$/, "")}/t/${token}`;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function inviteExpired(expiresAt: Date | null | undefined): boolean {
  return Boolean(expiresAt && expiresAt.getTime() < Date.now());
}

function isUniqueViolation(err: unknown): boolean {
  return Boolean(
    err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code?: string }).code === "23505",
  );
}

const OPEN_PENDING_INVITE_CAP = 5;

export async function buildApp(env: AppEnv) {
  const db = createDb(env.databaseUrl);
  const registry = createPluginRegistry();
  const runner =
    env.runner ??
    createRunner({
      judge0Url: env.judge0Url,
      useMock: env.useMockRunner ?? !env.judge0Url,
    });
  const mailer =
    env.mailer ??
    createMailer({
      resendApiKey: env.resendApiKey,
      emailFrom: env.emailFrom,
    });
  const verifyTurnstile =
    env.verifyTurnstile ?? createTurnstileVerifier(env.turnstileSecretKey);
  const captchaRequired = Boolean(env.turnstileSecretKey);
  const otpIpLimit = env.inviteOtpIpLimit ?? INVITE_OTP_IP_LIMIT;
  const startIpLimit = env.inviteStartIpLimit ?? INVITE_START_IP_LIMIT;
  const ipWindowMs = env.inviteIpWindowMs ?? INVITE_IP_WINDOW_MS;

  const app = Fastify({
    logger: true,
    trustProxy: env.trustProxy ?? false,
  });
  // Allow POST with Content-Type: application/json and an empty body.
  app.addContentTypeParser(
    "application/json",
    { parseAs: "string" },
    (_req, body, done) => {
      try {
        const text = typeof body === "string" ? body : "";
        done(null, text.length ? JSON.parse(text) : {});
      } catch (err) {
        done(err as Error, undefined);
      }
    },
  );
  await app.register(cors, { origin: env.corsOrigin, credentials: true });
  await app.register(cookie, { secret: env.sessionSecret });

  app.get("/health", async () => ({ ok: true }));

  // --- Auth ---
  app.post("/auth/register", async (req, reply) => {
    const body = z
      .object({
        email: z.string().email(),
        name: z.string().min(1),
        password: z.string().min(8),
      })
      .parse(req.body);
    const existing = await db
      .select()
      .from(recruiters)
      .where(eq(recruiters.email, body.email.toLowerCase()))
      .limit(1);
    if (existing[0]) {
      return reply.code(409).send({ error: "Email already registered" });
    }
    const passwordHash = await hashPassword(body.password);
    const user = (
      await db
        .insert(recruiters)
        .values({
          email: body.email.toLowerCase(),
          name: body.name,
          passwordHash,
        })
        .returning()
    )[0]!;
    await ensureDefaultInviteTemplate(db, user.id);
    await createRecruiterSession(db, user.id, reply);
    return { id: user.id, email: user.email, name: user.name };
  });

  app.post("/auth/login", async (req, reply) => {
    const body = z
      .object({ email: z.string().email(), password: z.string() })
      .parse(req.body);
    const user = (
      await db
        .select()
        .from(recruiters)
        .where(eq(recruiters.email, body.email.toLowerCase()))
        .limit(1)
    )[0];
    if (!user || !(await verifyPassword(user.passwordHash, body.password))) {
      return reply.code(401).send({ error: "Invalid credentials" });
    }
    await createRecruiterSession(db, user.id, reply);
    return { id: user.id, email: user.email, name: user.name };
  });

  app.get("/auth/me", async (req) => getRecruiterFromRequest(db, req));

  app.post("/auth/logout", async (req, reply) => {
    await clearRecruiterSession(db, req, reply);
    return reply.code(204).send();
  });

  // --- API tokens (recruiter session cookie; for MCP / agents) ---
  app.get("/auth/tokens", async (req, reply) => {
    const user = await requireRecruiter(db, req, reply);
    if (!user) return;
    const rows = await db
      .select({
        id: apiTokens.id,
        name: apiTokens.name,
        tokenPrefix: apiTokens.tokenPrefix,
        createdAt: apiTokens.createdAt,
        lastUsedAt: apiTokens.lastUsedAt,
      })
      .from(apiTokens)
      .where(eq(apiTokens.recruiterId, user.id))
      .orderBy(asc(apiTokens.createdAt));
    return rows;
  });

  app.post("/auth/tokens", async (req, reply) => {
    const user = await requireRecruiter(db, req, reply);
    if (!user) return;
    const body = z
      .object({ name: z.string().min(1).max(120) })
      .parse(req.body);
    const token = newApiToken();
    const row = (
      await db
        .insert(apiTokens)
        .values({
          recruiterId: user.id,
          name: body.name,
          tokenHash: hashToken(token),
          tokenPrefix: apiTokenPrefix(token),
        })
        .returning({
          id: apiTokens.id,
          name: apiTokens.name,
          tokenPrefix: apiTokens.tokenPrefix,
          createdAt: apiTokens.createdAt,
        })
    )[0]!;
    return { ...row, token };
  });

  app.delete("/auth/tokens/:id", async (req, reply) => {
    const user = await requireRecruiter(db, req, reply);
    if (!user) return;
    const { id } = req.params as { id: string };
    const deleted = await db
      .delete(apiTokens)
      .where(and(eq(apiTokens.id, id), eq(apiTokens.recruiterId, user.id)))
      .returning({ id: apiTokens.id });
    if (!deleted[0]) return reply.code(404).send({ error: "Not found" });
    return reply.code(204).send();
  });

  // --- Assessments ---
  async function loadAssessment(id: string, recruiterId?: string) {
    const rows = await db
      .select()
      .from(assessments)
      .where(
        recruiterId
          ? and(eq(assessments.id, id), eq(assessments.recruiterId, recruiterId))
          : eq(assessments.id, id),
      )
      .limit(1);
    const assessment = rows[0];
    if (!assessment) return null;
    const links = await db
      .select({
        id: assessmentQuestions.id,
        order: assessmentQuestions.order,
        question: questions,
      })
      .from(assessmentQuestions)
      .innerJoin(questions, eq(assessmentQuestions.questionId, questions.id))
      .where(eq(assessmentQuestions.assessmentId, id))
      .orderBy(asc(assessmentQuestions.order));
    return {
      ...assessment,
      questions: links.map((l) => ({
        id: l.id,
        order: l.order,
        question: l.question,
      })),
    };
  }

  app.get("/assessments", async (req, reply) => {
    const user = await requireRecruiter(db, req, reply);
    if (!user) return;
    return db
      .select()
      .from(assessments)
      .where(eq(assessments.recruiterId, user.id))
      .orderBy(asc(assessments.createdAt));
  });

  app.get("/assessments/:id", async (req, reply) => {
    const user = await requireRecruiter(db, req, reply);
    if (!user) return;
    const { id } = req.params as { id: string };
    const assessment = await loadAssessment(id, user.id);
    if (!assessment) return reply.code(404).send({ error: "Not found" });
    return assessment;
  });

  app.post("/assessments", async (req, reply) => {
    const user = await requireRecruiter(db, req, reply);
    if (!user) return;
    const body = z
      .object({
        title: z.string().min(1),
        description: z.string().optional(),
        durationSeconds: z.number().int().positive(),
        rules: assessmentRulesSchema.partial().optional(),
      })
      .parse(req.body);
    const rules = assessmentRulesSchema.parse(body.rules ?? {});
    const inserted = await db
      .insert(assessments)
      .values({
        recruiterId: user.id,
        title: body.title,
        description: body.description ?? "",
        durationSeconds: body.durationSeconds,
        rules,
      })
      .returning();
    return inserted[0];
  });

  app.patch("/assessments/:id", async (req, reply) => {
    const user = await requireRecruiter(db, req, reply);
    if (!user) return;
    const { id } = req.params as { id: string };
    const body = z
      .object({
        title: z.string().min(1).optional(),
        description: z.string().optional(),
        durationSeconds: z.number().int().positive().optional(),
        rules: assessmentRulesSchema.optional(),
        published: z.boolean().optional(),
      })
      .parse(req.body);
    const updated = await db
      .update(assessments)
      .set({ ...body, updatedAt: new Date() })
      .where(and(eq(assessments.id, id), eq(assessments.recruiterId, user.id)))
      .returning();
    if (!updated[0]) return reply.code(404).send({ error: "Not found" });
    return loadAssessment(id, user.id);
  });

  app.post("/assessments/:id/questions", async (req, reply) => {
    const user = await requireRecruiter(db, req, reply);
    if (!user) return;
    const { id } = req.params as { id: string };
    const assessment = await loadAssessment(id, user.id);
    if (!assessment) return reply.code(404).send({ error: "Not found" });

    const body = z
      .object({
        type: z.string(),
        title: z.string().min(1),
        prompt: z.string().optional(),
        timeLimitSeconds: z.number().int().positive(),
        points: z.number().int().positive().optional(),
        config: z.record(z.unknown()),
      })
      .parse(req.body);

    if (!registry.has(body.type)) {
      return reply.code(400).send({ error: `Unknown question type: ${body.type}` });
    }
    try {
      if (
        body.type === "mcq" ||
        body.type === "coding" ||
        body.type === "sql" ||
        body.type === "text"
      ) {
        registry.get(body.type).validateConfig(body.config);
      }
    } catch (err) {
      return reply.code(400).send({
        error: err instanceof Error ? err.message : "Invalid config",
      });
    }

    const q = (
      await db
        .insert(questions)
        .values({
          type: body.type,
          title: body.title,
          prompt: body.prompt ?? "",
          timeLimitSeconds: body.timeLimitSeconds,
          points: body.points ?? 10,
          config: body.config,
        })
        .returning()
    )[0]!;

    await db.insert(assessmentQuestions).values({
      assessmentId: id,
      questionId: q.id,
      order: assessment.questions?.length ?? 0,
    });
    return loadAssessment(id, user.id);
  });

  app.patch("/assessments/:id/questions/:questionId", async (req, reply) => {
    const user = await requireRecruiter(db, req, reply);
    if (!user) return;
    const { id, questionId } = req.params as { id: string; questionId: string };
    const assessment = await loadAssessment(id, user.id);
    if (!assessment) return reply.code(404).send({ error: "Not found" });

    const link = assessment.questions?.find((q) => q.question.id === questionId);
    if (!link) return reply.code(404).send({ error: "Question not found" });

    const body = z
      .object({
        title: z.string().min(1).optional(),
        prompt: z.string().optional(),
        timeLimitSeconds: z.number().int().positive().optional(),
        points: z.number().int().positive().optional(),
        config: z.record(z.unknown()).optional(),
      })
      .parse(req.body ?? {});

    if (body.config) {
      const type = link.question.type;
      try {
        if (
          type === "mcq" ||
          type === "coding" ||
          type === "sql" ||
          type === "text"
        ) {
          registry.get(type).validateConfig(body.config);
        }
      } catch (err) {
        return reply.code(400).send({
          error: err instanceof Error ? err.message : "Invalid config",
        });
      }
    }

    await db
      .update(questions)
      .set({
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.prompt !== undefined ? { prompt: body.prompt } : {}),
        ...(body.timeLimitSeconds !== undefined
          ? { timeLimitSeconds: body.timeLimitSeconds }
          : {}),
        ...(body.points !== undefined ? { points: body.points } : {}),
        ...(body.config !== undefined ? { config: body.config } : {}),
        updatedAt: new Date(),
      })
      .where(eq(questions.id, questionId));

    return loadAssessment(id, user.id);
  });

  app.delete("/assessments/:id/questions/:questionId", async (req, reply) => {
    const user = await requireRecruiter(db, req, reply);
    if (!user) return;
    const { id, questionId } = req.params as { id: string; questionId: string };
    const assessment = await loadAssessment(id, user.id);
    if (!assessment) return reply.code(404).send({ error: "Not found" });

    const link = assessment.questions?.find((q) => q.question.id === questionId);
    if (!link) return reply.code(404).send({ error: "Question not found" });

    await db
      .delete(assessmentQuestions)
      .where(
        and(
          eq(assessmentQuestions.assessmentId, id),
          eq(assessmentQuestions.questionId, questionId),
        ),
      );
    await db.delete(questions).where(eq(questions.id, questionId));

    const remaining = (assessment.questions ?? [])
      .filter((q) => q.question.id !== questionId)
      .sort((a, b) => a.order - b.order);
    for (let i = 0; i < remaining.length; i++) {
      await db
        .update(assessmentQuestions)
        .set({ order: i })
        .where(
          and(
            eq(assessmentQuestions.assessmentId, id),
            eq(assessmentQuestions.questionId, remaining[i]!.question.id),
          ),
        );
    }

    return loadAssessment(id, user.id);
  });

  app.put("/assessments/:id/questions/reorder", async (req, reply) => {
    const user = await requireRecruiter(db, req, reply);
    if (!user) return;
    const { id } = req.params as { id: string };
    const assessment = await loadAssessment(id, user.id);
    if (!assessment) return reply.code(404).send({ error: "Not found" });
    const body = z.object({ order: z.array(z.string().uuid()) }).parse(req.body);
    for (let i = 0; i < body.order.length; i++) {
      await db
        .update(assessmentQuestions)
        .set({ order: i })
        .where(
          and(
            eq(assessmentQuestions.assessmentId, id),
            eq(assessmentQuestions.questionId, body.order[i]!),
          ),
        );
    }
    return loadAssessment(id, user.id);
  });

  app.post("/assessments/:id/invites", async (req, reply) => {
    const user = await requireRecruiter(db, req, reply);
    if (!user) return;
    const { id } = req.params as { id: string };
    const assessment = await loadAssessment(id, user.id);
    if (!assessment) return reply.code(404).send({ error: "Not found" });
    if (!assessment.published) {
      return reply
        .code(400)
        .send({ error: "Publish the assessment before creating invites" });
    }
    const questionCount = (
      await db
        .select({ value: count() })
        .from(assessmentQuestions)
        .where(eq(assessmentQuestions.assessmentId, id))
    )[0]?.value;
    if (!questionCount) {
      return reply
        .code(400)
        .send({ error: "Add at least one question before creating invites" });
    }

    const body = z
      .object({
        candidateEmail: z.string().email().optional(),
        candidateName: z.string().max(200).optional(),
        expiresInDays: z.number().int().positive().max(365).optional(),
        sendEmail: z.boolean().optional(),
      })
      .parse(req.body ?? {});

    const email = body.candidateEmail
      ? normalizeEmail(body.candidateEmail)
      : undefined;
    const shouldSend = body.sendEmail ?? Boolean(email);
    if (shouldSend && !email) {
      return reply
        .code(400)
        .send({ error: "candidateEmail is required when sendEmail is true" });
    }

    if (email) {
      const existingPending = await db
        .select()
        .from(invites)
        .where(
          and(
            eq(invites.assessmentId, id),
            eq(invites.candidateEmail, email),
            eq(invites.status, "pending"),
          ),
        );
      for (const row of existingPending) {
        if (!inviteExpired(row.expiresAt)) {
          return reply.code(409).send({
            error:
              "A pending invite already exists for this email — resend or revoke it first",
          });
        }
        await db
          .update(invites)
          .set({
            status: "revoked",
            revokedAt: new Date(),
            ...clearedOtpFields,
          })
          .where(eq(invites.id, row.id));
      }
    } else {
      const openPending = await db
        .select()
        .from(invites)
        .where(
          and(
            eq(invites.assessmentId, id),
            eq(invites.status, "pending"),
            isNull(invites.candidateEmail),
          ),
        );
      const activeOpen = openPending.filter((r) => !inviteExpired(r.expiresAt));
      if (activeOpen.length >= OPEN_PENDING_INVITE_CAP) {
        return reply.code(409).send({
          error: `At most ${OPEN_PENDING_INVITE_CAP} open pending invites are allowed per assessment`,
        });
      }
    }

    const expiresInDays = body.expiresInDays ?? 14;
    const expiresAt = new Date(
      Date.now() + expiresInDays * 24 * 60 * 60 * 1000,
    );
    const token = newToken();
    let inserted: typeof invites.$inferSelect;
    try {
      inserted = (
        await db
          .insert(invites)
          .values({
            assessmentId: id,
            token,
            candidateEmail: email,
            candidateName: body.candidateName?.trim() || null,
            status: "pending",
            expiresAt,
          })
          .returning()
      )[0]!;
    } catch (err) {
      if (isUniqueViolation(err)) {
        return reply.code(409).send({
          error:
            "A pending invite already exists for this email — resend or revoke it first",
        });
      }
      throw err;
    }

    const url = inviteUrl(env.webOrigin, token);
    let emailed = false;
    let inviteRow = inserted;
    if (shouldSend && email) {
      try {
        await sendInviteEmail({
          recruiterId: user.id,
          recruiterName: user.name,
          assessmentTitle: assessment.title,
          invite: inserted,
          url,
        });
        emailed = true;
        inviteRow = (
          await db
            .select()
            .from(invites)
            .where(eq(invites.id, inserted.id))
            .limit(1)
        )[0]!;
      } catch (err) {
        app.log.error({ err }, "invite email send failed");
        emailed = false;
      }
    }

    return serializeInvite(inviteRow, url, emailed);
  });

  app.get("/assessments/:id/invites", async (req, reply) => {
    const user = await requireRecruiter(db, req, reply);
    if (!user) return;
    const { id } = req.params as { id: string };
    const assessment = await loadAssessment(id, user.id);
    if (!assessment) return reply.code(404).send({ error: "Not found" });
    const rows = await db
      .select()
      .from(invites)
      .where(eq(invites.assessmentId, id))
      .orderBy(desc(invites.createdAt));
    return rows.map((row) =>
      serializeInvite(row, inviteUrl(env.webOrigin, row.token)),
    );
  });

  app.post("/assessments/:id/invites/:inviteId/revoke", async (req, reply) => {
    const user = await requireRecruiter(db, req, reply);
    if (!user) return;
    const { id, inviteId } = req.params as { id: string; inviteId: string };
    const assessment = await loadAssessment(id, user.id);
    if (!assessment) return reply.code(404).send({ error: "Not found" });
    const row = (
      await db
        .select()
        .from(invites)
        .where(and(eq(invites.id, inviteId), eq(invites.assessmentId, id)))
        .limit(1)
    )[0];
    if (!row) return reply.code(404).send({ error: "Invite not found" });
    if (row.status === "used") {
      return reply.code(409).send({ error: "Cannot revoke a used invite" });
    }
    if (row.status === "revoked") {
      return serializeInvite(row, inviteUrl(env.webOrigin, row.token));
    }
    const updated = (
      await db
        .update(invites)
        .set({
          status: "revoked",
          revokedAt: new Date(),
          ...clearedOtpFields,
        })
        .where(eq(invites.id, inviteId))
        .returning()
    )[0]!;
    return serializeInvite(updated, inviteUrl(env.webOrigin, updated.token));
  });

  app.post("/assessments/:id/invites/:inviteId/resend", async (req, reply) => {
    const user = await requireRecruiter(db, req, reply);
    if (!user) return;
    const { id, inviteId } = req.params as { id: string; inviteId: string };
    const assessment = await loadAssessment(id, user.id);
    if (!assessment) return reply.code(404).send({ error: "Not found" });
    const row = (
      await db
        .select()
        .from(invites)
        .where(and(eq(invites.id, inviteId), eq(invites.assessmentId, id)))
        .limit(1)
    )[0];
    if (!row) return reply.code(404).send({ error: "Invite not found" });
    if (!row.candidateEmail) {
      return reply.code(400).send({ error: "Invite has no candidate email" });
    }
    if (row.status !== "pending") {
      return reply
        .code(409)
        .send({ error: `Cannot resend a ${row.status} invite` });
    }
    if (inviteExpired(row.expiresAt)) {
      return reply.code(410).send({ error: "Invite expired" });
    }
    const url = inviteUrl(env.webOrigin, row.token);
    await sendInviteEmail({
      recruiterId: user.id,
      recruiterName: user.name,
      assessmentTitle: assessment.title,
      invite: row,
      url,
    });
    const updated = (
      await db.select().from(invites).where(eq(invites.id, inviteId)).limit(1)
    )[0]!;
    return serializeInvite(updated, url, true);
  });

  // --- Email templates ---
  app.get("/email-templates", async (req, reply) => {
    const user = await requireRecruiter(db, req, reply);
    if (!user) return;
    await ensureDefaultInviteTemplate(db, user.id);
    return db
      .select()
      .from(emailTemplates)
      .where(eq(emailTemplates.recruiterId, user.id))
      .orderBy(asc(emailTemplates.key));
  });

  app.get("/email-templates/:key", async (req, reply) => {
    const user = await requireRecruiter(db, req, reply);
    if (!user) return;
    const { key } = req.params as { key: string };
    if (key === INVITE_TEMPLATE_KEY) {
      return getInviteTemplate(db, user.id);
    }
    if (key === INVITE_OTP_TEMPLATE_KEY) {
      return getInviteOtpTemplate(db, user.id);
    }
    return reply.code(404).send({ error: "Template not found" });
  });

  app.patch("/email-templates/:key", async (req, reply) => {
    const user = await requireRecruiter(db, req, reply);
    if (!user) return;
    const { key } = req.params as { key: string };
    if (key !== INVITE_TEMPLATE_KEY && key !== INVITE_OTP_TEMPLATE_KEY) {
      return reply.code(404).send({ error: "Template not found" });
    }
    await ensureDefaultInviteTemplate(db, user.id);
    const body = z
      .object({
        name: z.string().min(1).optional(),
        subject: z.string().min(1).optional(),
        bodyHtml: z.string().min(1).optional(),
        bodyText: z.string().min(1).optional(),
      })
      .parse(req.body ?? {});
    const updated = (
      await db
        .update(emailTemplates)
        .set({ ...body, updatedAt: new Date() })
        .where(
          and(
            eq(emailTemplates.recruiterId, user.id),
            eq(emailTemplates.key, key),
          ),
        )
        .returning()
    )[0];
    if (!updated) return reply.code(404).send({ error: "Template not found" });
    return updated;
  });

  app.post("/email-templates/:key/reset", async (req, reply) => {
    const user = await requireRecruiter(db, req, reply);
    if (!user) return;
    const { key } = req.params as { key: string };
    if (key === INVITE_TEMPLATE_KEY) {
      return resetInviteTemplate(db, user.id);
    }
    if (key === INVITE_OTP_TEMPLATE_KEY) {
      return resetInviteOtpTemplate(db, user.id);
    }
    return reply.code(404).send({ error: "Template not found" });
  });

  // --- Candidate ---
  async function loadPendingInvite(token: string) {
    const row = (
      await db
        .select({ invite: invites, assessment: assessments })
        .from(invites)
        .innerJoin(assessments, eq(invites.assessmentId, assessments.id))
        .where(eq(invites.token, token))
        .limit(1)
    )[0];
    return row;
  }

  function inviteAccessError(
    reply: Parameters<typeof requireRecruiter>[2],
    row: Awaited<ReturnType<typeof loadPendingInvite>>,
  ): boolean {
    if (!row) {
      reply.code(404).send({ error: "Invite not found" });
      return true;
    }
    if (!row.assessment.published) {
      reply.code(403).send({ error: "Assessment is not published" });
      return true;
    }
    if (row.invite.status === "revoked") {
      reply.code(410).send({ error: "Invite revoked" });
      return true;
    }
    if (row.invite.status === "used") {
      reply.code(410).send({ error: "Invite already used" });
      return true;
    }
    if (inviteExpired(row.invite.expiresAt)) {
      reply.code(410).send({ error: "Invite expired" });
      return true;
    }
    return false;
  }

  app.get("/invites/:token", async (req, reply) => {
    const { token } = req.params as { token: string };
    const row = await loadPendingInvite(token);
    if (inviteAccessError(reply, row)) return;
    return {
      token,
      status: row!.invite.status,
      emailBound: Boolean(row!.invite.candidateEmail),
      expiresAt: row!.invite.expiresAt,
      assessment: {
        id: row!.assessment.id,
        title: row!.assessment.title,
        description: row!.assessment.description,
        durationSeconds: row!.assessment.durationSeconds,
      },
    };
  });

  app.post("/invites/:token/otp", async (req, reply) => {
    const { token } = req.params as { token: string };
    const body = z
      .object({
        candidateEmail: z.string().email(),
        captchaToken: z.string().optional(),
      })
      .parse(req.body ?? {});

    const row = await loadPendingInvite(token);
    if (inviteAccessError(reply, row)) return;

    const clientIp = req.ip || "unknown";
    if (captchaRequired) {
      const ok = await verifyTurnstile(body.captchaToken ?? "", clientIp);
      if (!ok) {
        return reply.code(400).send({ error: "CAPTCHA verification failed" });
      }
    }

    const ipOk = await consumeInviteIpRateLimit({
      db,
      ip: clientIp,
      action: "otp",
      limit: otpIpLimit,
      windowMs: ipWindowMs,
    });
    if (!ipOk.allowed) {
      if (ipOk.retryAfterSeconds) {
        reply.header("Retry-After", String(ipOk.retryAfterSeconds));
      }
      return reply
        .code(429)
        .send({ error: "Too many requests. Try again later." });
    }

    const email = normalizeEmail(body.candidateEmail);
    if (
      row!.invite.candidateEmail &&
      normalizeEmail(row!.invite.candidateEmail) !== email
    ) {
      return reply.code(403).send({ error: "Email does not match this invite" });
    }

    if (
      row!.invite.otpSentAt &&
      Date.now() - row!.invite.otpSentAt.getTime() < OTP_RESEND_COOLDOWN_MS
    ) {
      return reply.code(429).send({
        error: "Please wait before requesting another code",
      });
    }

    const otp = generateOtp();
    const otpHash = hashOtp({
      otp,
      inviteId: row!.invite.id,
      secret: env.sessionSecret,
    });
    const otpExpiresAt = new Date(Date.now() + OTP_TTL_MS);
    await db
      .update(invites)
      .set({
        otpHash,
        otpExpiresAt,
        otpAttempts: 0,
        otpSentAt: new Date(),
        otpEmail: email,
      })
      .where(eq(invites.id, row!.invite.id));

    const template = await getInviteOtpTemplate(db, row!.assessment.recruiterId);
    const vars = {
      otp,
      assessmentTitle: row!.assessment.title,
      expiresAt: otpExpiresAt.toISOString(),
      candidateEmail: email,
      candidateName: row!.invite.candidateName?.trim() || "there",
    };
    try {
      await mailer.send({
        to: email,
        subject: renderTemplate(template.subject, vars),
        html: renderTemplate(template.bodyHtml, vars),
        text: renderTemplate(template.bodyText, vars),
      });
    } catch (err) {
      app.log.error({ err }, "OTP email send failed");
      await db
        .update(invites)
        .set(clearedOtpFields)
        .where(eq(invites.id, row!.invite.id));
      return reply
        .code(502)
        .send({ error: "Could not send verification email. Try again." });
    }

    return { sent: true, expiresInSeconds: OTP_EXPIRES_IN_SECONDS };
  });

  app.post("/invites/:token/start", async (req, reply) => {
    const { token } = req.params as { token: string };
    const body = z
      .object({
        candidateName: z.string().trim().min(1).max(200),
        candidateEmail: z.string().email(),
        otp: z.string().regex(/^\d{6}$/),
        captchaToken: z.string().optional(),
      })
      .parse(req.body);

    const row = await loadPendingInvite(token);
    if (inviteAccessError(reply, row)) return;

    const clientIp = req.ip || "unknown";
    if (captchaRequired) {
      const ok = await verifyTurnstile(body.captchaToken ?? "", clientIp);
      if (!ok) {
        return reply.code(400).send({ error: "CAPTCHA verification failed" });
      }
    }

    const ipOk = await consumeInviteIpRateLimit({
      db,
      ip: clientIp,
      action: "start",
      limit: startIpLimit,
      windowMs: ipWindowMs,
    });
    if (!ipOk.allowed) {
      if (ipOk.retryAfterSeconds) {
        reply.header("Retry-After", String(ipOk.retryAfterSeconds));
      }
      return reply
        .code(429)
        .send({ error: "Too many requests. Try again later." });
    }

    const email = normalizeEmail(body.candidateEmail);
    if (
      row!.invite.candidateEmail &&
      normalizeEmail(row!.invite.candidateEmail) !== email
    ) {
      return reply.code(403).send({
        error: "Email does not match this invite",
      });
    }

    if (
      !row!.invite.otpHash ||
      !row!.invite.otpExpiresAt ||
      !row!.invite.otpEmail
    ) {
      return reply
        .code(401)
        .send({ error: "Verification code required. Request a new code." });
    }
    if (normalizeEmail(row!.invite.otpEmail) !== email) {
      return reply.code(401).send({
        error: "Verification code was sent to a different email. Request a new code.",
      });
    }
    if (row!.invite.otpExpiresAt.getTime() < Date.now()) {
      await db
        .update(invites)
        .set(clearedOtpFields)
        .where(eq(invites.id, row!.invite.id));
      return reply
        .code(401)
        .send({ error: "Verification code expired. Request a new code." });
    }

    const ok = verifyOtpHash({
      otp: body.otp.trim(),
      inviteId: row!.invite.id,
      secret: env.sessionSecret,
      expectedHash: row!.invite.otpHash,
    });
    if (!ok) {
      const updated = (
        await db
          .update(invites)
          .set({ otpAttempts: sql`${invites.otpAttempts} + 1` })
          .where(eq(invites.id, row!.invite.id))
          .returning({ otpAttempts: invites.otpAttempts })
      )[0];
      const attempts = updated?.otpAttempts ?? OTP_MAX_ATTEMPTS;
      if (attempts >= OTP_MAX_ATTEMPTS) {
        await db
          .update(invites)
          .set(lockoutOtpFields())
          .where(eq(invites.id, row!.invite.id));
        return reply.code(401).send({
          error: "Too many invalid codes. Request a new code.",
        });
      }
      return reply.code(401).send({ error: "Invalid verification code" });
    }

    const sessionToken = newToken();
    let sessionId: string;
    try {
      sessionId = await db.transaction(async (tx) => {
        const existingSession = (
          await tx
            .select({ id: candidateSessions.id })
            .from(candidateSessions)
            .where(eq(candidateSessions.inviteId, row!.invite.id))
            .limit(1)
        )[0];
        if (existingSession) {
          throw Object.assign(new Error("Invite already used"), {
            code: "INVITE_USED",
          });
        }

        const claimed = (
          await tx
            .update(invites)
            .set({
              status: "used",
              usedAt: new Date(),
              ...clearedOtpFields,
            })
            .where(
              and(eq(invites.id, row!.invite.id), eq(invites.status, "pending")),
            )
            .returning({ id: invites.id })
        )[0];
        if (!claimed) {
          throw Object.assign(new Error("Invite already used"), {
            code: "INVITE_USED",
          });
        }

        const session = (
          await tx
            .insert(candidateSessions)
            .values({
              assessmentId: row!.assessment.id,
              inviteId: row!.invite.id,
              candidateName: body.candidateName.trim(),
              candidateEmail: email,
              status: "not_started",
              remainingOverallMs: row!.assessment.durationSeconds * 1000,
              sessionTokenHash: hashToken(sessionToken),
            })
            .returning()
        )[0]!;

        await initializeAttempts(
          tx as unknown as typeof db,
          session.id,
          row!.assessment.id,
          row!.assessment.rules as z.infer<typeof assessmentRulesSchema>,
        );
        return session.id;
      });
    } catch (err) {
      if (
        (err &&
          typeof err === "object" &&
          "code" in err &&
          (err as { code?: string }).code === "INVITE_USED") ||
        isUniqueViolation(err)
      ) {
        return reply.code(410).send({ error: "Invite already used" });
      }
      throw err;
    }

    await setCandidateSessionCookie(reply, sessionToken);
    return buildSessionView(db, sessionId, true);
  });

  async function sendInviteEmail(args: {
    recruiterId: string;
    recruiterName: string;
    assessmentTitle: string;
    invite: typeof invites.$inferSelect;
    url: string;
  }) {
    const template = await getInviteTemplate(db, args.recruiterId);
    const vars = {
      candidateName: args.invite.candidateName?.trim() || "there",
      candidateEmail: args.invite.candidateEmail ?? "",
      assessmentTitle: args.assessmentTitle,
      inviteUrl: args.url,
      expiresAt: args.invite.expiresAt
        ? args.invite.expiresAt.toISOString()
        : "n/a",
      recruiterName: args.recruiterName,
    };
    await mailer.send({
      to: args.invite.candidateEmail!,
      subject: renderTemplate(template.subject, vars),
      html: renderTemplate(template.bodyHtml, vars),
      text: renderTemplate(template.bodyText, vars),
    });
    await db
      .update(invites)
      .set({ lastEmailedAt: new Date() })
      .where(eq(invites.id, args.invite.id));
  }

  function serializeInvite(
    row: typeof invites.$inferSelect,
    url: string,
    emailed?: boolean,
  ) {
    const effectiveStatus =
      row.status === "pending" && inviteExpired(row.expiresAt)
        ? "expired"
        : row.status;
    return {
      id: row.id,
      token: row.token,
      url,
      status: effectiveStatus,
      candidateEmail: row.candidateEmail,
      candidateName: row.candidateName,
      expiresAt: row.expiresAt,
      usedAt: row.usedAt,
      revokedAt: row.revokedAt,
      lastEmailedAt: row.lastEmailedAt,
      createdAt: row.createdAt,
      emailed: emailed ?? Boolean(row.lastEmailedAt),
    };
  }

  async function requireCandidate(req: Parameters<typeof getCandidateSessionId>[1], reply: Parameters<typeof requireRecruiter>[2]) {
    const id = await getCandidateSessionId(db, req);
    if (!id) {
      reply.code(401).send({ error: "No candidate session" });
      return null;
    }
    return id;
  }

  app.get("/sessions/current", async (req, reply) => {
    const id = await requireCandidate(req, reply);
    if (!id) return;
    return buildSessionView(db, id, true);
  });

  app.post("/sessions/current/questions/:questionId/open", async (req, reply) => {
    const id = await requireCandidate(req, reply);
    if (!id) return;
    const { questionId } = req.params as { questionId: string };
    try {
      await applyOpen(db, id, questionId);
    } catch (err) {
      return reply.code(400).send({
        error: err instanceof Error ? err.message : "Cannot open",
      });
    }
    return buildSessionView(db, id, true);
  });

  app.post("/sessions/current/questions/:questionId/save", async (req, reply) => {
    const id = await requireCandidate(req, reply);
    if (!id) return;
    const { questionId } = req.params as { questionId: string };
    const body = z
      .object({ answer: z.unknown().optional(), workspace: z.unknown().optional() })
      .parse(req.body ?? {});
    try {
      await applySave(db, id, questionId, body);
    } catch (err) {
      return reply.code(400).send({
        error: err instanceof Error ? err.message : "Cannot save",
      });
    }
    return buildSessionView(db, id, true);
  });

  app.post("/sessions/current/questions/:questionId/skip", async (req, reply) => {
    const id = await requireCandidate(req, reply);
    if (!id) return;
    const { questionId } = req.params as { questionId: string };
    const body = z
      .object({ answer: z.unknown().optional(), workspace: z.unknown().optional() })
      .parse(req.body ?? {});
    try {
      await applySkip(db, id, questionId, body);
    } catch (err) {
      return reply.code(400).send({
        error: err instanceof Error ? err.message : "Cannot skip",
      });
    }
    return buildSessionView(db, id, true);
  });

  app.post("/sessions/current/questions/:questionId/submit", async (req, reply) => {
    const id = await requireCandidate(req, reply);
    if (!id) return;
    const { questionId } = req.params as { questionId: string };
    const body = z
      .object({ answer: z.unknown().optional(), workspace: z.unknown().optional() })
      .parse(req.body ?? {});
    try {
      await applySubmitQuestion(db, id, questionId, body, registry, runner);
    } catch (err) {
      return reply.code(400).send({
        error: err instanceof Error ? err.message : "Cannot submit",
      });
    }
    return buildSessionView(db, id, true);
  });

  app.post("/sessions/current/questions/:questionId/run", async (req, reply) => {
    const id = await requireCandidate(req, reply);
    if (!id) return;
    const { questionId } = req.params as { questionId: string };
    const body = z
      .object({
        source: z.string().optional(),
        query: z.string().optional(),
      })
      .parse(req.body ?? {});
    const q = (
      await db.select().from(questions).where(eq(questions.id, questionId)).limit(1)
    )[0];
    if (!q) {
      return reply.code(404).send({ error: "Question not found" });
    }

    if (q.type === "coding") {
      const config = q.config as CodingConfig;
      const source = body.source ?? "";
      const mode = config.mode ?? "io";
      let results;

      if (mode === "unit") {
        if (!runner.runUnitTests) {
          return reply.code(500).send({ error: "Runner does not support unit tests" });
        }
        results = await runner.runUnitTests({
          language: config.language,
          entrySource: source,
          entryFile: config.entryFile,
          starterFiles: config.starterFiles,
          testCode: config.visibleTestCode ?? "",
          framework: config.framework,
          timeLimitMs: config.timeLimitMs,
        });
      } else {
        const languageId =
          runner.languageId?.(config) ??
          config.judge0LanguageId ??
          JUDGE0_LANGUAGE_IDS[config.language];
        results = await runner.runTests({
          source,
          languageId,
          tests: (config.visibleTests ?? []).map((t) => ({
            id: t.id,
            stdin: t.stdin,
            expectedStdout: t.expectedStdout,
          })),
        });
      }

      await applySave(db, id, questionId, {
        answer: { source },
        workspace: { source, lastVisibleResults: results },
      });
      return { results };
    }

    if (q.type === "sql") {
      const config = q.config as SqlConfig;
      const query = body.query ?? "";
      const results = await runSqlChecks({
        schemaSql: config.schemaSql,
        seedSql: config.seedSql,
        query,
        tests: config.visibleTests ?? [],
        maxRows: config.maxRows,
      });
      await applySave(db, id, questionId, {
        answer: { query },
        workspace: { query, lastVisibleResults: results },
      });
      return { results };
    }

    return reply.code(400).send({ error: "Run is only supported for coding and sql questions" });
  });

  app.post("/sessions/current/submit", async (req, reply) => {
    const id = await requireCandidate(req, reply);
    if (!id) return;
    await applySubmitSession(db, id);
    return buildSessionView(db, id, true);
  });

  app.post("/sessions/current/events", async (req, reply) => {
    const id = await requireCandidate(req, reply);
    if (!id) return;
    const body = z
      .object({
        type: z.enum([
          "focus_lost",
          "paste",
          "tab_hidden",
          "save",
          "submit",
          "skip",
          "open",
        ]),
        questionId: z.string().uuid().optional(),
        meta: z.record(z.unknown()).optional(),
      })
      .parse(req.body);
    await db.insert(activityEvents).values({
      sessionId: id,
      questionId: body.questionId,
      type: body.type,
      meta: body.meta,
    });
    return reply.code(204).send();
  });

  // --- Results ---
  app.get("/assessments/:id/sessions", async (req, reply) => {
    const user = await requireRecruiter(db, req, reply);
    if (!user) return;
    const { id } = req.params as { id: string };
    const assessment = await loadAssessment(id, user.id);
    if (!assessment) return reply.code(404).send({ error: "Not found" });

    const sessions = await db
      .select()
      .from(candidateSessions)
      .where(eq(candidateSessions.assessmentId, id));

    const maxScore =
      assessment.questions?.reduce((s, q) => s + q.question.points, 0) ?? 0;

    const result = [];
    for (const s of sessions) {
      const attempts = await db
        .select()
        .from(questionAttempts)
        .where(eq(questionAttempts.sessionId, s.id));
      const totalScore = attempts.reduce((sum, a) => sum + (a.score ?? 0), 0);
      result.push({
        id: s.id,
        candidateName: s.candidateName,
        candidateEmail: s.candidateEmail,
        status: s.status,
        totalScore,
        maxScore,
        submittedAt: s.submittedAt?.toISOString() ?? null,
      });
    }
    return result;
  });

  app.get("/assessments/:id/sessions/:sessionId", async (req, reply) => {
    const user = await requireRecruiter(db, req, reply);
    if (!user) return;
    const { id, sessionId } = req.params as { id: string; sessionId: string };
    const assessment = await loadAssessment(id, user.id);
    if (!assessment) return reply.code(404).send({ error: "Not found" });
    const sessions = await db
      .select()
      .from(candidateSessions)
      .where(
        and(
          eq(candidateSessions.id, sessionId),
          eq(candidateSessions.assessmentId, id),
        ),
      )
      .limit(1);
    if (!sessions[0]) return reply.code(404).send({ error: "Not found" });

    const session = await buildSessionView(db, sessionId, false);
    const events = await db
      .select()
      .from(activityEvents)
      .where(eq(activityEvents.sessionId, sessionId))
      .orderBy(asc(activityEvents.createdAt));

    return {
      session,
      events: events.map((e) => ({
        id: e.id,
        type: e.type,
        questionId: e.questionId,
        meta: e.meta,
        createdAt: e.createdAt.toISOString(),
      })),
    };
  });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof z.ZodError) {
      return reply.code(400).send({ error: err.flatten() });
    }
    app.log.error(err);
    return reply.code(500).send({ error: "Internal Server Error" });
  });

  return app;
}
