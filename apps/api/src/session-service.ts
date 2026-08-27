import {
  createInitialAttempts,
  openQuestion,
  saveAttempt,
  skipQuestion,
  submitQuestion,
  submitSession,
  tickTimers,
  type AssessmentRules,
  type AttemptStatus,
  PluginRegistry,
  type QuestionAttemptState,
  type SessionState,
  type SessionStatus,
} from "@assessment-os/core";
import type { Db } from "@assessment-os/db";
import {
  activityEvents,
  assessmentQuestions,
  assessments,
  candidateSessions,
  questionAttempts,
  questions,
} from "@assessment-os/db";
import { and, asc, eq, inArray } from "drizzle-orm";
import {
  gradeCoding,
  JUDGE0_LANGUAGE_IDS,
  type CodingConfig,
} from "@assessment-os/question-coding";
import type { CodeRunner } from "@assessment-os/runner";
import { candidateSafeConfig } from "./plugins-registry.js";

function toSessionState(
  row: typeof candidateSessions.$inferSelect,
  attempts: Array<typeof questionAttempts.$inferSelect>,
  rules: AssessmentRules,
): SessionState {
  return {
    status: row.status as SessionStatus,
    remainingOverallMs: row.remainingOverallMs,
    currentQuestionId: row.currentQuestionId,
    overallClockStartedAt: row.overallClockStartedAt?.getTime() ?? null,
    questionClockStartedAt: row.questionClockStartedAt?.getTime() ?? null,
    rules,
    attempts: attempts.map(
      (a): QuestionAttemptState => ({
        id: a.id,
        questionId: a.questionId,
        order: a.order,
        status: a.status as AttemptStatus,
        remainingMs: a.remainingMs,
        answer: a.answer,
        workspace: a.workspace,
        score: a.score,
      }),
    ),
  };
}

async function persistSessionState(
  db: Db,
  sessionId: string,
  state: SessionState,
): Promise<void> {
  const existing = (
    await db
      .select()
      .from(candidateSessions)
      .where(eq(candidateSessions.id, sessionId))
      .limit(1)
  )[0];

  await db
    .update(candidateSessions)
    .set({
      status: state.status,
      remainingOverallMs: state.remainingOverallMs,
      currentQuestionId: state.currentQuestionId,
      overallClockStartedAt:
        state.overallClockStartedAt != null
          ? new Date(state.overallClockStartedAt)
          : null,
      questionClockStartedAt:
        state.questionClockStartedAt != null
          ? new Date(state.questionClockStartedAt)
          : null,
      startedAt:
        existing && !existing.startedAt && state.status === "in_progress"
          ? new Date()
          : existing?.startedAt,
      submittedAt:
        existing &&
        !existing.submittedAt &&
        (state.status === "submitted" || state.status === "expired")
          ? new Date()
          : existing?.submittedAt,
    })
    .where(eq(candidateSessions.id, sessionId));

  for (const a of state.attempts) {
    await db
      .update(questionAttempts)
      .set({
        status: a.status,
        remainingMs: a.remainingMs,
        answer: a.answer as Record<string, unknown> | null,
        workspace: a.workspace as Record<string, unknown> | null,
        score: a.score,
      })
      .where(eq(questionAttempts.id, a.id));
  }
}

async function loadRules(db: Db, assessmentId: string): Promise<AssessmentRules> {
  const rows = await db
    .select({ rules: assessments.rules })
    .from(assessments)
    .where(eq(assessments.id, assessmentId))
    .limit(1);
  if (!rows[0]) throw new Error("Assessment not found");
  return rows[0].rules as AssessmentRules;
}

export async function loadAndTick(db: Db, sessionId: string, nowMs = Date.now()) {
  const session = (
    await db
      .select()
      .from(candidateSessions)
      .where(eq(candidateSessions.id, sessionId))
      .limit(1)
  )[0];
  if (!session) throw new Error("Session not found");

  const attempts = await db
    .select()
    .from(questionAttempts)
    .where(eq(questionAttempts.sessionId, sessionId))
    .orderBy(asc(questionAttempts.order));

  const rules = await loadRules(db, session.assessmentId);
  let state = toSessionState(session, attempts, rules);
  state = tickTimers(state, nowMs);
  await persistSessionState(db, sessionId, state);

  const refreshedSession = (
    await db
      .select()
      .from(candidateSessions)
      .where(eq(candidateSessions.id, sessionId))
      .limit(1)
  )[0]!;
  const refreshedAttempts = await db
    .select()
    .from(questionAttempts)
    .where(eq(questionAttempts.sessionId, sessionId))
    .orderBy(asc(questionAttempts.order));

  return {
    session: refreshedSession,
    attempts: refreshedAttempts,
    state: toSessionState(refreshedSession, refreshedAttempts, rules),
    rules,
  };
}

export async function buildSessionView(
  db: Db,
  sessionId: string,
  forCandidate: boolean,
) {
  const { session, attempts } = await loadAndTick(db, sessionId);
  const assessment = (
    await db
      .select()
      .from(assessments)
      .where(eq(assessments.id, session.assessmentId))
      .limit(1)
  )[0]!;

  const questionIds = attempts.map((a) => a.questionId);
  const questionRows =
    questionIds.length === 0
      ? []
      : await db
          .select()
          .from(questions)
          .where(inArray(questions.id, questionIds));
  const qMap = new Map(questionRows.map((q) => [q.id, q]));

  return {
    id: session.id,
    status: session.status,
    remainingOverallMs: session.remainingOverallMs,
    currentQuestionId: session.currentQuestionId,
    candidateName: session.candidateName,
    candidateEmail: session.candidateEmail,
    assessment: {
      id: assessment.id,
      title: assessment.title,
      description: assessment.description,
      rules: assessment.rules,
    },
    attempts: attempts.map((a) => {
      const q = qMap.get(a.questionId)!;
      const config = forCandidate
        ? candidateSafeConfig(q.type, q.config as Record<string, unknown>)
        : (q.config as Record<string, unknown>);
      return {
        id: a.id,
        questionId: a.questionId,
        order: a.order,
        status: a.status,
        remainingMs: a.remainingMs,
        answer: a.answer,
        workspace: a.workspace,
        score: a.score,
        gradeDetails: forCandidate ? undefined : a.gradeDetails,
        question: {
          id: q.id,
          type: q.type,
          title: q.title,
          prompt: q.prompt,
          timeLimitSeconds: q.timeLimitSeconds,
          points: q.points,
          config,
        },
      };
    }),
  };
}

export async function initializeAttempts(
  db: Db,
  sessionId: string,
  assessmentId: string,
  rules: AssessmentRules,
): Promise<void> {
  const links = await db
    .select({
      questionId: assessmentQuestions.questionId,
      order: assessmentQuestions.order,
      timeLimitSeconds: questions.timeLimitSeconds,
    })
    .from(assessmentQuestions)
    .innerJoin(questions, eq(assessmentQuestions.questionId, questions.id))
    .where(eq(assessmentQuestions.assessmentId, assessmentId))
    .orderBy(asc(assessmentQuestions.order));

  const initial = createInitialAttempts(
    links.map((l) => ({
      id: crypto.randomUUID(),
      questionId: l.questionId,
      order: l.order,
      timeLimitSeconds: l.timeLimitSeconds,
    })),
    rules,
  );

  if (initial.length) {
    await db.insert(questionAttempts).values(
      initial.map((a) => ({
        id: a.id,
        sessionId,
        questionId: a.questionId,
        order: a.order,
        status: a.status,
        remainingMs: a.remainingMs,
        answer: null,
        workspace: null,
        score: null,
      })),
    );
  }
}

export async function applyOpen(
  db: Db,
  sessionId: string,
  questionId: string,
): Promise<void> {
  const { state } = await loadAndTick(db, sessionId);
  const next = openQuestion(state, questionId, Date.now());
  await persistSessionState(db, sessionId, next);
  await db.insert(activityEvents).values({
    sessionId,
    questionId,
    type: "open",
  });
}

export async function applySave(
  db: Db,
  sessionId: string,
  questionId: string,
  draft: { answer?: unknown; workspace?: unknown },
): Promise<void> {
  const { state } = await loadAndTick(db, sessionId);
  const next = saveAttempt(state, questionId, Date.now(), draft);
  await persistSessionState(db, sessionId, next);
  await db.insert(activityEvents).values({
    sessionId,
    questionId,
    type: "save",
  });
}

export async function applySkip(
  db: Db,
  sessionId: string,
  questionId: string,
  draft?: { answer?: unknown; workspace?: unknown },
): Promise<void> {
  const { state } = await loadAndTick(db, sessionId);
  const next = skipQuestion(state, questionId, Date.now(), draft);
  await persistSessionState(db, sessionId, next);
  await db.insert(activityEvents).values({
    sessionId,
    questionId,
    type: "skip",
  });
}

export async function applySubmitQuestion(
  db: Db,
  sessionId: string,
  questionId: string,
  draft: { answer?: unknown; workspace?: unknown },
  registry: PluginRegistry,
  runner: CodeRunner,
): Promise<void> {
  const { state } = await loadAndTick(db, sessionId);
  const q = (
    await db.select().from(questions).where(eq(questions.id, questionId)).limit(1)
  )[0];
  if (!q) throw new Error("Question not found");

  const current = state.attempts.find((a) => a.questionId === questionId);
  const answer =
    draft.answer !== undefined ? draft.answer : (current?.answer ?? null);
  const workspace =
    draft.workspace !== undefined
      ? draft.workspace
      : (current?.workspace ?? null);

  let score = 0;
  let gradeDetails: Record<string, unknown> | undefined;

  if (q.type === "coding") {
    const config = q.config as CodingConfig;
    const source =
      (answer as { source?: string } | null)?.source ??
      (workspace as { source?: string } | null)?.source ??
      "";
    const languageId =
      runner.languageId?.(config) ??
      config.judge0LanguageId ??
      JUDGE0_LANGUAGE_IDS[config.language];
    const results = await runner.runTests({
      source,
      languageId,
      tests: (config.hiddenTests ?? []).map((t) => ({
        id: t.id,
        stdin: t.stdin,
        expectedStdout: t.expectedStdout,
      })),
    });
    const grade = await gradeCoding({
      config,
      answer: { source },
      workspace,
      points: q.points,
      hiddenResults: results.map((r) => ({ id: r.id, passed: r.passed })),
    });
    score = grade.score;
    gradeDetails = { ...(grade.details ?? {}), results };
  } else {
    const plugin = registry.get(q.type);
    const grade = await plugin.grade({
      config: plugin.validateConfig(q.config),
      answer: answer as never,
      workspace,
      points: q.points,
    });
    score = grade.score;
    gradeDetails = grade.details as Record<string, unknown> | undefined;
  }

  const next = submitQuestion(
    state,
    questionId,
    Date.now(),
    { answer, workspace },
    score,
  );
  await persistSessionState(db, sessionId, next);
  await db
    .update(questionAttempts)
    .set({
      gradeDetails: gradeDetails ?? null,
      gradedAt: new Date(),
      score,
    })
    .where(
      and(
        eq(questionAttempts.sessionId, sessionId),
        eq(questionAttempts.questionId, questionId),
      ),
    );
  await db.insert(activityEvents).values({
    sessionId,
    questionId,
    type: "submit",
  });
}

export async function applySubmitSession(
  db: Db,
  sessionId: string,
): Promise<void> {
  const { state } = await loadAndTick(db, sessionId);
  const next = submitSession(state, Date.now());
  await persistSessionState(db, sessionId, next);
}
