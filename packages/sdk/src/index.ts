export type AssessmentRules = {
  allowSkip: boolean;
  allowReturn: boolean;
  perQuestionTimers: boolean;
  linearLock: boolean;
};

export type Assessment = {
  id: string;
  title: string;
  description: string;
  durationSeconds: number;
  rules: AssessmentRules;
  published: boolean;
  questions?: AssessmentQuestion[];
};

export type AssessmentQuestion = {
  id: string;
  order: number;
  question: {
    id: string;
    type: string;
    title: string;
    prompt: string;
    timeLimitSeconds: number;
    points: number;
    config: Record<string, unknown>;
  };
};

export type SessionView = {
  id: string;
  status: string;
  remainingOverallMs: number;
  currentQuestionId: string | null;
  candidateName: string;
  candidateEmail: string;
  assessment: {
    id: string;
    title: string;
    description: string;
    rules: AssessmentRules;
  };
  attempts: Array<{
    id: string;
    questionId: string;
    order: number;
    status: string;
    remainingMs: number;
    answer: unknown;
    workspace: unknown;
    score: number | null;
    gradeDetails?: Record<string, unknown> | null;
    question: {
      id: string;
      type: string;
      title: string;
      prompt: string;
      timeLimitSeconds: number;
      points: number;
      /** Candidate-safe config (hidden tests stripped for coding). */
      config: Record<string, unknown>;
    };
  }>;
};

async function request<T>(
  baseUrl: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const method = (init.method ?? "GET").toUpperCase();
  const needsJsonBody =
    method === "POST" || method === "PUT" || method === "PATCH";
  // Fastify rejects Content-Type: application/json with an empty body.
  const body =
    init.body ?? (needsJsonBody ? JSON.stringify({}) : undefined);

  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    method,
    body,
    credentials: "include",
    headers: {
      ...(needsJsonBody ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${text}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export function createClient(baseUrl: string) {
  return {
    register(body: { email: string; name: string; password: string }) {
      return request<{ id: string; email: string; name: string }>(
        baseUrl,
        "/auth/register",
        { method: "POST", body: JSON.stringify(body) },
      );
    },
    login(body: { email: string; password: string }) {
      return request<{ id: string; email: string; name: string }>(
        baseUrl,
        "/auth/login",
        { method: "POST", body: JSON.stringify(body) },
      );
    },
    me() {
      return request<{ id: string; email: string; name: string } | null>(
        baseUrl,
        "/auth/me",
      );
    },
    logout() {
      return request<void>(baseUrl, "/auth/logout", { method: "POST" });
    },
    listAssessments() {
      return request<Assessment[]>(baseUrl, "/assessments");
    },
    getAssessment(id: string) {
      return request<Assessment>(baseUrl, `/assessments/${id}`);
    },
    createAssessment(body: {
      title: string;
      description?: string;
      durationSeconds: number;
      rules?: Partial<AssessmentRules>;
    }) {
      return request<Assessment>(baseUrl, "/assessments", {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    updateAssessment(
      id: string,
      body: Partial<{
        title: string;
        description: string;
        durationSeconds: number;
        rules: AssessmentRules;
        published: boolean;
      }>,
    ) {
      return request<Assessment>(baseUrl, `/assessments/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
    },
    addQuestion(
      assessmentId: string,
      body: {
        type: string;
        title: string;
        prompt?: string;
        timeLimitSeconds: number;
        points?: number;
        config: Record<string, unknown>;
      },
    ) {
      return request<Assessment>(baseUrl, `/assessments/${assessmentId}/questions`, {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    reorderQuestions(assessmentId: string, order: string[]) {
      return request<Assessment>(baseUrl, `/assessments/${assessmentId}/questions/reorder`, {
        method: "PUT",
        body: JSON.stringify({ order }),
      });
    },
    createInvite(assessmentId: string, body?: { candidateEmail?: string; candidateName?: string }) {
      return request<{ id: string; token: string; url: string }>(
        baseUrl,
        `/assessments/${assessmentId}/invites`,
        { method: "POST", body: JSON.stringify(body ?? {}) },
      );
    },
    getInvite(token: string) {
      return request<{
        token: string;
        assessment: { id: string; title: string; description: string; durationSeconds: number };
      }>(baseUrl, `/invites/${token}`);
    },
    startSession(token: string, body: { candidateName: string; candidateEmail: string }) {
      return request<SessionView>(baseUrl, `/invites/${token}/start`, {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    getSession() {
      return request<SessionView>(baseUrl, "/sessions/current");
    },
    openQuestion(questionId: string) {
      return request<SessionView>(baseUrl, `/sessions/current/questions/${questionId}/open`, {
        method: "POST",
      });
    },
    saveQuestion(
      questionId: string,
      body: { answer?: unknown; workspace?: unknown },
    ) {
      return request<SessionView>(baseUrl, `/sessions/current/questions/${questionId}/save`, {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    skipQuestion(
      questionId: string,
      body?: { answer?: unknown; workspace?: unknown },
    ) {
      return request<SessionView>(baseUrl, `/sessions/current/questions/${questionId}/skip`, {
        method: "POST",
        body: JSON.stringify(body ?? {}),
      });
    },
    submitQuestion(
      questionId: string,
      body?: { answer?: unknown; workspace?: unknown },
    ) {
      return request<SessionView>(baseUrl, `/sessions/current/questions/${questionId}/submit`, {
        method: "POST",
        body: JSON.stringify(body ?? {}),
      });
    },
    submitSession() {
      return request<SessionView>(baseUrl, "/sessions/current/submit", {
        method: "POST",
      });
    },
    runVisible(questionId: string, body: { source: string }) {
      return request<{ results: unknown[] }>(
        baseUrl,
        `/sessions/current/questions/${questionId}/run`,
        { method: "POST", body: JSON.stringify(body) },
      );
    },
    logEvent(body: {
      type: string;
      questionId?: string;
      meta?: Record<string, unknown>;
    }) {
      return request<void>(baseUrl, "/sessions/current/events", {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    listSessions(assessmentId: string) {
      return request<
        Array<{
          id: string;
          candidateName: string;
          candidateEmail: string;
          status: string;
          totalScore: number;
          maxScore: number;
          submittedAt: string | null;
        }>
      >(baseUrl, `/assessments/${assessmentId}/sessions`);
    },
    getSessionReview(assessmentId: string, sessionId: string) {
      return request<{
        session: SessionView;
        events: Array<{
          id: string;
          type: string;
          questionId: string | null;
          meta: Record<string, unknown> | null;
          createdAt: string;
        }>;
      }>(baseUrl, `/assessments/${assessmentId}/sessions/${sessionId}`);
    },
  };
}

export type ApiClient = ReturnType<typeof createClient>;
