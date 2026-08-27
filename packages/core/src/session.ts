import type { AssessmentRules, AttemptStatus, SessionStatus } from "./types.js";

export type QuestionAttemptState = {
  id: string;
  questionId: string;
  order: number;
  status: AttemptStatus;
  remainingMs: number;
  answer: unknown;
  workspace: unknown;
  score: number | null;
};

export type SessionState = {
  status: SessionStatus;
  remainingOverallMs: number;
  currentQuestionId: string | null;
  /** Wall-clock ms when overall timer last started ticking (open question / session). */
  overallClockStartedAt: number | null;
  /** Wall-clock ms when current question timer started. */
  questionClockStartedAt: number | null;
  attempts: QuestionAttemptState[];
  rules: AssessmentRules;
};

export function clampMs(ms: number): number {
  return Math.max(0, Math.floor(ms));
}

/** Apply elapsed wall time to overall and open question timers. */
export function tickTimers(
  session: SessionState,
  nowMs: number,
): SessionState {
  if (session.status !== "in_progress") {
    return session;
  }

  let remainingOverallMs = session.remainingOverallMs;
  let overallClockStartedAt = session.overallClockStartedAt;
  let questionClockStartedAt = session.questionClockStartedAt;
  let attempts = session.attempts.map((a) => ({ ...a }));
  let status: SessionStatus = session.status;

  if (overallClockStartedAt != null) {
    const elapsed = nowMs - overallClockStartedAt;
    remainingOverallMs = clampMs(remainingOverallMs - elapsed);
    overallClockStartedAt = nowMs;
  }

  if (session.currentQuestionId && questionClockStartedAt != null) {
    const idx = attempts.findIndex(
      (a) => a.questionId === session.currentQuestionId,
    );
    if (idx >= 0 && attempts[idx].status === "in_progress") {
      const elapsed = nowMs - questionClockStartedAt;
      attempts[idx] = {
        ...attempts[idx],
        remainingMs: clampMs(attempts[idx].remainingMs - elapsed),
      };
      questionClockStartedAt = nowMs;

      if (attempts[idx].remainingMs === 0) {
        attempts[idx] = { ...attempts[idx], status: "expired" };
        questionClockStartedAt = null;
      }
    }
  }

  if (remainingOverallMs === 0) {
    status = "expired";
    overallClockStartedAt = null;
    questionClockStartedAt = null;
  }

  return {
    ...session,
    status,
    remainingOverallMs,
    overallClockStartedAt,
    questionClockStartedAt,
    attempts,
    currentQuestionId:
      status === "expired" ? null : session.currentQuestionId,
  };
}

function isAccessible(
  attempt: QuestionAttemptState,
  rules: AssessmentRules,
): boolean {
  if (attempt.status === "locked") return false;
  if (
    !rules.allowReturn &&
    (attempt.status === "submitted" ||
      attempt.status === "skipped" ||
      attempt.status === "expired")
  ) {
    return false;
  }
  return true;
}

function unlockLinear(attempts: QuestionAttemptState[]): QuestionAttemptState[] {
  const sorted = [...attempts].sort((a, b) => a.order - b.order);
  let unlockNext = true;
  return sorted.map((a) => {
    const closed =
      a.status === "submitted" ||
      a.status === "skipped" ||
      a.status === "expired";
    if (!unlockNext) {
      return a.status === "locked" ? a : { ...a, status: "locked" as const };
    }
    if (a.status === "locked") {
      const next = { ...a, status: "not_started" as const };
      unlockNext = false;
      return next;
    }
    if (!closed && a.status !== "not_started") {
      unlockNext = false;
    } else if (a.status === "not_started" || a.status === "in_progress") {
      unlockNext = false;
    }
    return a;
  });
}

export function openQuestion(
  session: SessionState,
  questionId: string,
  nowMs: number,
): SessionState {
  let next = tickTimers(session, nowMs);
  if (next.status !== "in_progress" && next.status !== "not_started") {
    throw new Error("Session is not active");
  }

  if (next.status === "not_started") {
    next = {
      ...next,
      status: "in_progress",
      overallClockStartedAt: nowMs,
    };
  }

  let attempts = next.attempts.map((a) => ({ ...a }));
  if (next.rules.linearLock) {
    attempts = unlockLinear(attempts);
  }

  const idx = attempts.findIndex((a) => a.questionId === questionId);
  if (idx < 0) throw new Error("Question not found in session");
  const attempt = attempts[idx];
  if (!isAccessible(attempt, next.rules)) {
    throw new Error("Question is not accessible");
  }
  if (attempt.status === "locked") {
    throw new Error("Question is locked");
  }

  // Pause previous open question (preserve remaining time)
  if (next.currentQuestionId && next.currentQuestionId !== questionId) {
    const prevIdx = attempts.findIndex(
      (a) => a.questionId === next.currentQuestionId,
    );
    if (prevIdx >= 0 && attempts[prevIdx].status === "in_progress") {
      // already ticked; leave as in_progress draft
    }
  }

  const reopenable =
    attempt.status === "not_started" ||
    attempt.status === "in_progress" ||
    attempt.status === "skipped" ||
    (next.rules.allowReturn && attempt.status === "submitted");

  if (!reopenable) {
    throw new Error("Cannot open this question");
  }

  attempts[idx] = {
    ...attempt,
    status: "in_progress",
  };

  return {
    ...next,
    attempts,
    currentQuestionId: questionId,
    questionClockStartedAt: nowMs,
    overallClockStartedAt: next.overallClockStartedAt ?? nowMs,
  };
}

export function skipQuestion(
  session: SessionState,
  questionId: string,
  nowMs: number,
  draft?: { answer?: unknown; workspace?: unknown },
): SessionState {
  let next = tickTimers(session, nowMs);
  if (!next.rules.allowSkip) throw new Error("Skip is not allowed");
  if (next.status !== "in_progress") throw new Error("Session is not active");

  const attempts = next.attempts.map((a) => ({ ...a }));
  const idx = attempts.findIndex((a) => a.questionId === questionId);
  if (idx < 0) throw new Error("Question not found");
  if (attempts[idx].status !== "in_progress") {
    throw new Error("Only an open question can be skipped");
  }

  attempts[idx] = {
    ...attempts[idx],
    status: "skipped",
    answer: draft?.answer !== undefined ? draft.answer : attempts[idx].answer,
    workspace:
      draft?.workspace !== undefined
        ? draft.workspace
        : attempts[idx].workspace,
  };

  if (next.rules.linearLock) {
    const unlocked = unlockLinear(attempts);
    return {
      ...next,
      attempts: unlocked,
      currentQuestionId: null,
      questionClockStartedAt: null,
    };
  }

  return {
    ...next,
    attempts,
    currentQuestionId: null,
    questionClockStartedAt: null,
  };
}

export function saveAttempt(
  session: SessionState,
  questionId: string,
  nowMs: number,
  draft: { answer?: unknown; workspace?: unknown },
): SessionState {
  const next = tickTimers(session, nowMs);
  if (next.status !== "in_progress") throw new Error("Session is not active");

  const attempts = next.attempts.map((a) => {
    if (a.questionId !== questionId) return a;
    return {
      ...a,
      answer: draft.answer !== undefined ? draft.answer : a.answer,
      workspace:
        draft.workspace !== undefined ? draft.workspace : a.workspace,
    };
  });

  return { ...next, attempts };
}

export function submitQuestion(
  session: SessionState,
  questionId: string,
  nowMs: number,
  draft: { answer?: unknown; workspace?: unknown },
  score: number | null,
): SessionState {
  let next = tickTimers(session, nowMs);
  if (next.status !== "in_progress") throw new Error("Session is not active");

  let attempts = next.attempts.map((a) => ({ ...a }));
  const idx = attempts.findIndex((a) => a.questionId === questionId);
  if (idx < 0) throw new Error("Question not found");
  if (
    attempts[idx].status !== "in_progress" &&
    !(next.rules.allowReturn && attempts[idx].status === "submitted")
  ) {
    throw new Error("Question cannot be submitted");
  }

  attempts[idx] = {
    ...attempts[idx],
    status: "submitted",
    answer: draft.answer !== undefined ? draft.answer : attempts[idx].answer,
    workspace:
      draft.workspace !== undefined
        ? draft.workspace
        : attempts[idx].workspace,
    score,
  };

  if (next.rules.linearLock) {
    attempts = unlockLinear(attempts);
  }

  return {
    ...next,
    attempts,
    currentQuestionId: null,
    questionClockStartedAt: null,
  };
}

export function submitSession(
  session: SessionState,
  nowMs: number,
): SessionState {
  const next = tickTimers(session, nowMs);
  return {
    ...next,
    status: next.remainingOverallMs === 0 ? "expired" : "submitted",
    currentQuestionId: null,
    overallClockStartedAt: null,
    questionClockStartedAt: null,
  };
}

export function createInitialAttempts(
  questions: Array<{
    id: string;
    questionId: string;
    order: number;
    timeLimitSeconds: number;
  }>,
  rules: AssessmentRules,
): QuestionAttemptState[] {
  const sorted = [...questions].sort((a, b) => a.order - b.order);
  return sorted.map((q, i) => {
    let status: AttemptStatus = "not_started";
    if (rules.linearLock && i > 0) status = "locked";
    return {
      id: q.id,
      questionId: q.questionId,
      order: q.order,
      status,
      remainingMs: q.timeLimitSeconds * 1000,
      answer: null,
      workspace: null,
      score: null,
    };
  });
}
