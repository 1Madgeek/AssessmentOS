import { describe, expect, it } from "vitest";
import {
  createInitialAttempts,
  openQuestion,
  saveAttempt,
  skipQuestion,
  submitQuestion,
  submitSession,
  tickTimers,
  type SessionState,
} from "./session.js";

const rules = {
  allowSkip: true,
  allowReturn: true,
  perQuestionTimers: true,
  linearLock: false,
  randomizeQuestionOrder: false,
};

function baseSession(overrides: Partial<SessionState> = {}): SessionState {
  const attempts = createInitialAttempts(
    [
      { id: "a1", questionId: "q1", order: 0, timeLimitSeconds: 60 },
      { id: "a2", questionId: "q2", order: 1, timeLimitSeconds: 120 },
    ],
    rules,
  );
  return {
    status: "not_started",
    remainingOverallMs: 90 * 60 * 1000,
    currentQuestionId: null,
    overallClockStartedAt: null,
    questionClockStartedAt: null,
    attempts,
    rules,
    ...overrides,
  };
}

describe("createInitialAttempts", () => {
  it("locks later questions when linearLock is true", () => {
    const attempts = createInitialAttempts(
      [
        { id: "a1", questionId: "q1", order: 0, timeLimitSeconds: 60 },
        { id: "a2", questionId: "q2", order: 1, timeLimitSeconds: 60 },
      ],
      { ...rules, linearLock: true },
    );
    expect(attempts[0].status).toBe("not_started");
    expect(attempts[1].status).toBe("locked");
  });
});

describe("openQuestion / skip / timers", () => {
  it("starts session and question timers on open", () => {
    const t0 = 1_000_000;
    const opened = openQuestion(baseSession(), "q1", t0);
    expect(opened.status).toBe("in_progress");
    expect(opened.currentQuestionId).toBe("q1");
    expect(opened.attempts[0].status).toBe("in_progress");
    expect(opened.overallClockStartedAt).toBe(t0);
    expect(opened.questionClockStartedAt).toBe(t0);
  });

  it("preserves remaining time when skipping", () => {
    const t0 = 1_000_000;
    let s = openQuestion(baseSession(), "q1", t0);
    s = tickTimers(s, t0 + 10_000);
    s = skipQuestion(s, "q1", t0 + 10_000);
    expect(s.attempts[0].status).toBe("skipped");
    expect(s.attempts[0].remainingMs).toBe(50_000);
    expect(s.currentQuestionId).toBeNull();
  });

  it("allows return to skipped question when allowReturn", () => {
    const t0 = 1_000_000;
    let s = openQuestion(baseSession(), "q1", t0);
    s = skipQuestion(s, "q1", t0 + 5_000, { answer: { selected: ["a"] } });
    s = openQuestion(s, "q1", t0 + 20_000);
    expect(s.attempts[0].status).toBe("in_progress");
    expect(s.attempts[0].answer).toEqual({ selected: ["a"] });
  });

  it("expires question when per-question timer hits zero", () => {
    const t0 = 1_000_000;
    let s = openQuestion(baseSession(), "q1", t0);
    s = tickTimers(s, t0 + 60_000);
    expect(s.attempts[0].remainingMs).toBe(0);
    expect(s.attempts[0].status).toBe("expired");
  });

  it("expires session when overall timer hits zero", () => {
    const t0 = 1_000_000;
    let s = openQuestion(
      baseSession({ remainingOverallMs: 5_000 }),
      "q1",
      t0,
    );
    s = tickTimers(s, t0 + 5_000);
    expect(s.status).toBe("expired");
    expect(s.remainingOverallMs).toBe(0);
  });

  it("saves draft answers", () => {
    const t0 = 1_000_000;
    let s = openQuestion(baseSession(), "q1", t0);
    s = saveAttempt(s, "q1", t0 + 1000, { answer: { selected: ["b"] } });
    expect(s.attempts[0].answer).toEqual({ selected: ["b"] });
  });

  it("submits question with score", () => {
    const t0 = 1_000_000;
    let s = openQuestion(baseSession(), "q1", t0);
    s = submitQuestion(s, "q1", t0 + 1000, { answer: { selected: ["a"] } }, 5);
    expect(s.attempts[0].status).toBe("submitted");
    expect(s.attempts[0].score).toBe(5);
    expect(s.currentQuestionId).toBeNull();
  });

  it("submits entire session", () => {
    const t0 = 1_000_000;
    let s = openQuestion(baseSession(), "q1", t0);
    s = submitSession(s, t0 + 1000);
    expect(s.status).toBe("submitted");
  });

  it("unlocks next question after skip when linearLock", () => {
    const t0 = 1_000_000;
    const lockedRules = { ...rules, linearLock: true };
    let s = baseSession({
      rules: lockedRules,
      attempts: createInitialAttempts(
        [
          { id: "a1", questionId: "q1", order: 0, timeLimitSeconds: 60 },
          { id: "a2", questionId: "q2", order: 1, timeLimitSeconds: 60 },
        ],
        lockedRules,
      ),
    });
    s = openQuestion(s, "q1", t0);
    s = skipQuestion(s, "q1", t0 + 1000);
    expect(s.attempts[1].status).toBe("not_started");
  });
});
