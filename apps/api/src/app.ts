import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import { and, asc, eq } from "drizzle-orm";
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
import { createRunner, type CodeRunner } from "@assessment-os/runner";
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
  INVITE_TEMPLATE_KEY,
  ensureDefaultInviteTemplate,
  getInviteTemplate,
  renderTemplate,
  resetInviteTemplate,
} from "./email-templates.js";
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

  const app = Fastify({ logger: true });
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
      if (body.type === "mcq" || body.type === "coding") {
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
    const body = z
      .object({
        candidateEmail: z.string().email().optional(),
        candidateName: z.string().optional(),
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

    const expiresInDays = body.expiresInDays ?? 14;
    const expiresAt = new Date(
      Date.now() + expiresInDays * 24 * 60 * 60 * 1000,
    );
    const token = newToken();
    const inserted = (
      await db
        .insert(invites)
        .values({
          assessmentId: id,
          token,
          candidateEmail: email,
          candidateName: body.candidateName,
          status: "pending",
          expiresAt,
        })
        .returning()
    )[0]!;

    const url = inviteUrl(env.webOrigin, token);
    let emailed = false;
    let inviteRow = inserted;
    if (shouldSend && email) {
      await sendInviteEmail({
        recruiterId: user.id,
        recruiterName: user.name,
        assessmentTitle: assessment.title,
        invite: inserted,
        url,
      });
      emailed = true;
      inviteRow = (
        await db.select().from(invites).where(eq(invites.id, inserted.id)).limit(1)
      )[0]!;
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
      .orderBy(asc(invites.createdAt));
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
        .set({ status: "revoked", revokedAt: new Date() })
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
    if (key !== INVITE_TEMPLATE_KEY) {
      return reply.code(404).send({ error: "Template not found" });
    }
    return getInviteTemplate(db, user.id);
  });

  app.patch("/email-templates/:key", async (req, reply) => {
    const user = await requireRecruiter(db, req, reply);
    if (!user) return;
    const { key } = req.params as { key: string };
    if (key !== INVITE_TEMPLATE_KEY) {
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
    if (key !== INVITE_TEMPLATE_KEY) {
      return reply.code(404).send({ error: "Template not found" });
    }
    return resetInviteTemplate(db, user.id);
  });

  // --- Candidate ---
  app.get("/invites/:token", async (req, reply) => {
    const { token } = req.params as { token: string };
    const row = (
      await db
        .select({ invite: invites, assessment: assessments })
        .from(invites)
        .innerJoin(assessments, eq(invites.assessmentId, assessments.id))
        .where(eq(invites.token, token))
        .limit(1)
    )[0];
    if (!row) return reply.code(404).send({ error: "Invite not found" });
    if (!row.assessment.published) {
      return reply.code(403).send({ error: "Assessment is not published" });
    }
    if (row.invite.status === "revoked") {
      return reply.code(410).send({ error: "Invite revoked" });
    }
    if (row.invite.status === "used") {
      return reply.code(410).send({ error: "Invite already used" });
    }
    if (inviteExpired(row.invite.expiresAt)) {
      return reply.code(410).send({ error: "Invite expired" });
    }
    return {
      token,
      status: row.invite.status,
      candidateEmail: row.invite.candidateEmail,
      candidateName: row.invite.candidateName,
      expiresAt: row.invite.expiresAt,
      assessment: {
        id: row.assessment.id,
        title: row.assessment.title,
        description: row.assessment.description,
        durationSeconds: row.assessment.durationSeconds,
      },
    };
  });

  app.post("/invites/:token/start", async (req, reply) => {
    const { token } = req.params as { token: string };
    const body = z
      .object({
        candidateName: z.string().min(1),
        candidateEmail: z.string().email(),
      })
      .parse(req.body);

    const row = (
      await db
        .select({ invite: invites, assessment: assessments })
        .from(invites)
        .innerJoin(assessments, eq(invites.assessmentId, assessments.id))
        .where(eq(invites.token, token))
        .limit(1)
    )[0];
    if (!row) return reply.code(404).send({ error: "Invite not found" });
    if (!row.assessment.published) {
      return reply.code(403).send({ error: "Assessment is not published" });
    }
    if (row.invite.status === "revoked") {
      return reply.code(410).send({ error: "Invite revoked" });
    }
    if (row.invite.status === "used") {
      return reply.code(410).send({ error: "Invite already used" });
    }
    if (inviteExpired(row.invite.expiresAt)) {
      return reply.code(410).send({ error: "Invite expired" });
    }

    const email = normalizeEmail(body.candidateEmail);
    if (
      row.invite.candidateEmail &&
      normalizeEmail(row.invite.candidateEmail) !== email
    ) {
      return reply.code(403).send({
        error: "Email does not match this invite",
      });
    }

    const existingSession = (
      await db
        .select({ id: candidateSessions.id })
        .from(candidateSessions)
        .where(eq(candidateSessions.inviteId, row.invite.id))
        .limit(1)
    )[0];
    if (existingSession) {
      return reply.code(409).send({ error: "Invite already used" });
    }

    const sessionToken = newToken();
    const session = (
      await db
        .insert(candidateSessions)
        .values({
          assessmentId: row.assessment.id,
          inviteId: row.invite.id,
          candidateName: body.candidateName.trim(),
          candidateEmail: email,
          status: "not_started",
          remainingOverallMs: row.assessment.durationSeconds * 1000,
          sessionTokenHash: hashToken(sessionToken),
        })
        .returning()
    )[0]!;

    await db
      .update(invites)
      .set({ status: "used", usedAt: new Date() })
      .where(eq(invites.id, row.invite.id));

    await initializeAttempts(
      db,
      session.id,
      row.assessment.id,
      row.assessment.rules as z.infer<typeof assessmentRulesSchema>,
    );
    await setCandidateSessionCookie(reply, sessionToken);
    return buildSessionView(db, session.id, true);
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
    return {
      id: row.id,
      token: row.token,
      url,
      status: row.status,
      candidateEmail: row.candidateEmail,
      candidateName: row.candidateName,
      expiresAt: row.expiresAt,
      usedAt: row.usedAt,
      revokedAt: row.revokedAt,
      lastEmailedAt: row.lastEmailedAt,
      createdAt: row.createdAt,
      emailed: emailed ?? false,
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
    const body = z.object({ source: z.string() }).parse(req.body);
    const q = (
      await db.select().from(questions).where(eq(questions.id, questionId)).limit(1)
    )[0];
    if (!q || q.type !== "coding") {
      return reply.code(400).send({ error: "Not a coding question" });
    }
    const config = q.config as CodingConfig;
    const mode = config.mode ?? "io";
    let results;

    if (mode === "unit") {
      if (!runner.runUnitTests) {
        return reply.code(500).send({ error: "Runner does not support unit tests" });
      }
      results = await runner.runUnitTests({
        language: config.language,
        entrySource: body.source,
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
        source: body.source,
        languageId,
        tests: (config.visibleTests ?? []).map((t) => ({
          id: t.id,
          stdin: t.stdin,
          expectedStdout: t.expectedStdout,
        })),
      });
    }

    await applySave(db, id, questionId, {
      answer: { source: body.source },
      workspace: { source: body.source, lastVisibleResults: results },
    });
    return { results };
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
