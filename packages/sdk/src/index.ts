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

export type ApiTokenMeta = {
  id: string;
  name: string;
  tokenPrefix: string;
  createdAt: string;
  lastUsedAt: string | null;
};

export type InviteRecord = {
  id: string;
  token: string;
  url: string;
  status: string;
  candidateEmail: string | null;
  candidateName: string | null;
  expiresAt: string | null;
  usedAt: string | null;
  revokedAt: string | null;
  lastEmailedAt: string | null;
  createdAt: string;
  emailed?: boolean;
};

export type EmailTemplate = {
  id: string;
  recruiterId: string;
  key: string;
  name: string;
  subject: string;
  bodyHtml: string;
  bodyText: string;
  createdAt: string;
  updatedAt: string;
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

export type CreateClientOptions = {
  /** Bearer API token (MCP / agents). Cookie session still used when omitted. */
  apiToken?: string;
};

async function request<T>(
  baseUrl: string,
  path: string,
  init: RequestInit = {},
  apiToken?: string,
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
      ...(apiToken ? { Authorization: `Bearer ${apiToken}` } : {}),
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

export function createClient(
  baseUrl: string,
  options: CreateClientOptions = {},
) {
  const apiToken = options.apiToken;
  const call = <T>(path: string, init?: RequestInit) =>
    request<T>(baseUrl, path, init, apiToken);

  return {
    register(body: { email: string; name: string; password: string }) {
      return call<{ id: string; email: string; name: string }>(
        "/auth/register",
        { method: "POST", body: JSON.stringify(body) },
      );
    },
    login(body: { email: string; password: string }) {
      return call<{ id: string; email: string; name: string }>("/auth/login", {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    me() {
      return call<{ id: string; email: string; name: string } | null>(
        "/auth/me",
      );
    },
    logout() {
      return call<void>("/auth/logout", { method: "POST" });
    },
    listApiTokens() {
      return call<ApiTokenMeta[]>("/auth/tokens");
    },
    createApiToken(body: { name: string }) {
      return call<ApiTokenMeta & { token: string }>("/auth/tokens", {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    deleteApiToken(id: string) {
      return call<void>(`/auth/tokens/${id}`, { method: "DELETE" });
    },
    listAssessments() {
      return call<Assessment[]>("/assessments");
    },
    getAssessment(id: string) {
      return call<Assessment>(`/assessments/${id}`);
    },
    createAssessment(body: {
      title: string;
      description?: string;
      durationSeconds: number;
      rules?: Partial<AssessmentRules>;
    }) {
      return call<Assessment>("/assessments", {
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
      return call<Assessment>(`/assessments/${id}`, {
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
      return call<Assessment>(`/assessments/${assessmentId}/questions`, {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    reorderQuestions(assessmentId: string, order: string[]) {
      return call<Assessment>(`/assessments/${assessmentId}/questions/reorder`, {
        method: "PUT",
        body: JSON.stringify({ order }),
      });
    },
    createInvite(
      assessmentId: string,
      body?: {
        candidateEmail?: string;
        candidateName?: string;
        expiresInDays?: number;
        sendEmail?: boolean;
      },
    ) {
      return call<InviteRecord>(`/assessments/${assessmentId}/invites`, {
        method: "POST",
        body: JSON.stringify(body ?? {}),
      });
    },
    listInvites(assessmentId: string) {
      return call<InviteRecord[]>(`/assessments/${assessmentId}/invites`);
    },
    revokeInvite(assessmentId: string, inviteId: string) {
      return call<InviteRecord>(
        `/assessments/${assessmentId}/invites/${inviteId}/revoke`,
        { method: "POST" },
      );
    },
    resendInvite(assessmentId: string, inviteId: string) {
      return call<InviteRecord>(
        `/assessments/${assessmentId}/invites/${inviteId}/resend`,
        { method: "POST" },
      );
    },
    listEmailTemplates() {
      return call<EmailTemplate[]>("/email-templates");
    },
    getEmailTemplate(key: string) {
      return call<EmailTemplate>(`/email-templates/${key}`);
    },
    updateEmailTemplate(
      key: string,
      body: Partial<{
        name: string;
        subject: string;
        bodyHtml: string;
        bodyText: string;
      }>,
    ) {
      return call<EmailTemplate>(`/email-templates/${key}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
    },
    resetEmailTemplate(key: string) {
      return call<EmailTemplate>(`/email-templates/${key}/reset`, {
        method: "POST",
      });
    },
    getInvite(token: string) {
      return call<{
        token: string;
        status: string;
        candidateEmail: string | null;
        candidateName: string | null;
        expiresAt: string | null;
        assessment: {
          id: string;
          title: string;
          description: string;
          durationSeconds: number;
        };
      }>(`/invites/${token}`);
    },
    startSession(
      token: string,
      body: { candidateName: string; candidateEmail: string },
    ) {
      return call<SessionView>(`/invites/${token}/start`, {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    getSession() {
      return call<SessionView>("/sessions/current");
    },
    openQuestion(questionId: string) {
      return call<SessionView>(
        `/sessions/current/questions/${questionId}/open`,
        { method: "POST" },
      );
    },
    saveQuestion(
      questionId: string,
      body: { answer?: unknown; workspace?: unknown },
    ) {
      return call<SessionView>(
        `/sessions/current/questions/${questionId}/save`,
        { method: "POST", body: JSON.stringify(body) },
      );
    },
    skipQuestion(
      questionId: string,
      body?: { answer?: unknown; workspace?: unknown },
    ) {
      return call<SessionView>(
        `/sessions/current/questions/${questionId}/skip`,
        { method: "POST", body: JSON.stringify(body ?? {}) },
      );
    },
    submitQuestion(
      questionId: string,
      body?: { answer?: unknown; workspace?: unknown },
    ) {
      return call<SessionView>(
        `/sessions/current/questions/${questionId}/submit`,
        { method: "POST", body: JSON.stringify(body ?? {}) },
      );
    },
    submitSession() {
      return call<SessionView>("/sessions/current/submit", { method: "POST" });
    },
    runVisible(questionId: string, body: { source: string }) {
      return call<{ results: unknown[] }>(
        `/sessions/current/questions/${questionId}/run`,
        { method: "POST", body: JSON.stringify(body) },
      );
    },
    logEvent(body: {
      type: string;
      questionId?: string;
      meta?: Record<string, unknown>;
    }) {
      return call<void>("/sessions/current/events", {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    listSessions(assessmentId: string) {
      return call<
        Array<{
          id: string;
          candidateName: string;
          candidateEmail: string;
          status: string;
          totalScore: number;
          maxScore: number;
          submittedAt: string | null;
        }>
      >(`/assessments/${assessmentId}/sessions`);
    },
    getSessionReview(assessmentId: string, sessionId: string) {
      return call<{
        session: SessionView;
        events: Array<{
          id: string;
          type: string;
          questionId: string | null;
          meta: Record<string, unknown> | null;
          createdAt: string;
        }>;
      }>(`/assessments/${assessmentId}/sessions/${sessionId}`);
    },
  };
}

export type ApiClient = ReturnType<typeof createClient>;
