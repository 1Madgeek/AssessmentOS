export type AssessmentRules = {
  allowSkip: boolean;
  allowReturn: boolean;
  perQuestionTimers: boolean;
  linearLock: boolean;
  randomizeQuestionOrder?: boolean;
};

export type Assessment = {
  id: string;
  title: string;
  description: string;
  durationSeconds: number;
  rules: AssessmentRules;
  published: boolean;
  questions?: AssessmentQuestion[];
  sections?: AssessmentSection[];
  pools?: AssessmentPool[];
};

export type AssessmentQuestion = {
  id: string;
  order: number;
  sectionId?: string | null;
  question: {
    id: string;
    type: string;
    title: string;
    prompt: string;
    promptDoc?: Record<string, unknown> | null;
    timeLimitSeconds: number;
    points: number;
    config: Record<string, unknown>;
  };
};

export type AssessmentSection = {
  id: string;
  assessmentId: string;
  title: string;
  order: number;
  timeLimitSeconds: number | null;
};

export type AssessmentPoolMember = {
  id: string;
  questionId: string;
  question: {
    id: string;
    type: string;
    title: string;
    points: number;
  };
};

export type AssessmentPool = {
  id: string;
  assessmentId: string;
  name: string;
  drawCount: number;
  order: number;
  members: AssessmentPoolMember[];
};

export type BankQuestion = {
  id: string;
  type: string;
  title: string;
  prompt: string;
  promptDoc?: Record<string, unknown> | null;
  timeLimitSeconds: number;
  points: number;
  config: Record<string, unknown>;
  tags: string[];
  createdAt: string;
  updatedAt: string;
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
  mode?: "single" | "multi";
  maxUses?: number;
  useCount?: number;
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
    section?: { id: string; title: string; order: number } | null;
    question: {
      id: string;
      type: string;
      title: string;
      prompt: string;
      promptDoc?: Record<string, unknown> | null;
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

export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError;
}

/** Human-readable message from any thrown value (prefers ApiError). */
export function getErrorMessage(err: unknown, fallback = "Request failed"): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

function parseApiError(status: number, text: string): ApiError {
  const trimmed = text.trim();
  if (!trimmed) {
    return new ApiError(status, `Request failed (${status})`);
  }
  try {
    const json = JSON.parse(trimmed) as {
      error?: unknown;
    };
    if (typeof json.error === "string" && json.error.trim()) {
      return new ApiError(status, json.error.trim(), json);
    }
    if (json.error && typeof json.error === "object") {
      const flat = json.error as {
        formErrors?: unknown;
        fieldErrors?: Record<string, unknown>;
      };
      const parts: string[] = [];
      if (Array.isArray(flat.formErrors)) {
        for (const m of flat.formErrors) {
          if (typeof m === "string" && m.trim()) parts.push(m.trim());
        }
      }
      if (flat.fieldErrors && typeof flat.fieldErrors === "object") {
        for (const [field, msgs] of Object.entries(flat.fieldErrors)) {
          if (!Array.isArray(msgs)) continue;
          for (const m of msgs) {
            if (typeof m === "string" && m.trim()) {
              parts.push(`${field}: ${m.trim()}`);
            }
          }
        }
      }
      return new ApiError(
        status,
        parts.length ? parts.join("; ") : "Invalid request",
        json,
      );
    }
  } catch {
    // not JSON
  }
  return new ApiError(status, trimmed, trimmed);
}

async function request<T>(
  baseUrl: string,
  path: string,
  init: RequestInit = {},
  apiToken?: string,
): Promise<T> {
  const method = (init.method ?? "GET").toUpperCase();
  const isFormData =
    typeof FormData !== "undefined" && init.body instanceof FormData;
  const needsJsonBody =
    !isFormData &&
    (method === "POST" || method === "PUT" || method === "PATCH");
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
    throw parseApiError(res.status, text);
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
        promptDoc?: Record<string, unknown>;
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
    updateQuestion(
      assessmentId: string,
      questionId: string,
      body: {
        title?: string;
        prompt?: string;
        promptDoc?: Record<string, unknown>;
        timeLimitSeconds?: number;
        points?: number;
        config?: Record<string, unknown>;
      },
    ) {
      return call<Assessment>(
        `/assessments/${assessmentId}/questions/${questionId}`,
        { method: "PATCH", body: JSON.stringify(body) },
      );
    },
    async uploadAsset(file: File | Blob, filename = "image.png") {
      const form = new FormData();
      form.append("file", file, filename);
      const row = await call<{
        id: string;
        url: string;
        filename: string;
        contentType: string;
        byteSize: number;
      }>("/assets", { method: "POST", body: form });
      return {
        ...row,
        url: row.url.startsWith("http") ? row.url : `${baseUrl}${row.url}`,
      };
    },
    deleteQuestion(assessmentId: string, questionId: string) {
      return call<Assessment>(
        `/assessments/${assessmentId}/questions/${questionId}`,
        { method: "DELETE" },
      );
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
        mode?: "single" | "multi";
        maxUses?: number;
      },
    ) {
      return call<InviteRecord>(`/assessments/${assessmentId}/invites`, {
        method: "POST",
        body: JSON.stringify(body ?? {}),
      });
    },
    listBankQuestions() {
      return call<BankQuestion[]>("/bank/questions");
    },
    createBankQuestion(body: {
      type: string;
      title: string;
      prompt?: string;
      promptDoc?: Record<string, unknown>;
      timeLimitSeconds: number;
      points?: number;
      config: Record<string, unknown>;
      tags?: string[];
    }) {
      return call<BankQuestion>("/bank/questions", {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    updateBankQuestion(
      bankId: string,
      body: Partial<{
        title: string;
        prompt: string;
        promptDoc: Record<string, unknown>;
        timeLimitSeconds: number;
        points: number;
        config: Record<string, unknown>;
        tags: string[];
      }>,
    ) {
      return call<BankQuestion>(`/bank/questions/${bankId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
    },
    deleteBankQuestion(bankId: string) {
      return call<void>(`/bank/questions/${bankId}`, { method: "DELETE" });
    },
    addQuestionFromBank(
      assessmentId: string,
      body: { bankQuestionId: string; sectionId?: string },
    ) {
      return call<Assessment>(
        `/assessments/${assessmentId}/questions/from-bank`,
        { method: "POST", body: JSON.stringify(body) },
      );
    },
    createSection(
      assessmentId: string,
      body: { title: string; timeLimitSeconds?: number | null },
    ) {
      return call<Assessment>(`/assessments/${assessmentId}/sections`, {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    updateSection(
      assessmentId: string,
      sectionId: string,
      body: Partial<{
        title: string;
        timeLimitSeconds: number | null;
        order: number;
      }>,
    ) {
      return call<Assessment>(
        `/assessments/${assessmentId}/sections/${sectionId}`,
        { method: "PATCH", body: JSON.stringify(body) },
      );
    },
    deleteSection(assessmentId: string, sectionId: string) {
      return call<Assessment>(
        `/assessments/${assessmentId}/sections/${sectionId}`,
        { method: "DELETE" },
      );
    },
    setQuestionSection(
      assessmentId: string,
      questionId: string,
      sectionId: string | null,
    ) {
      return call<Assessment>(
        `/assessments/${assessmentId}/questions/${questionId}/section`,
        { method: "PATCH", body: JSON.stringify({ sectionId }) },
      );
    },
    createPool(
      assessmentId: string,
      body: { name: string; drawCount: number },
    ) {
      return call<Assessment>(`/assessments/${assessmentId}/pools`, {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    updatePool(
      assessmentId: string,
      poolId: string,
      body: Partial<{ name: string; drawCount: number; order: number }>,
    ) {
      return call<Assessment>(`/assessments/${assessmentId}/pools/${poolId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
    },
    deletePool(assessmentId: string, poolId: string) {
      return call<Assessment>(`/assessments/${assessmentId}/pools/${poolId}`, {
        method: "DELETE",
      });
    },
    addPoolMember(
      assessmentId: string,
      poolId: string,
      body: { bankQuestionId?: string; questionId?: string },
    ) {
      return call<Assessment>(
        `/assessments/${assessmentId}/pools/${poolId}/members`,
        { method: "POST", body: JSON.stringify(body) },
      );
    },
    removePoolMember(assessmentId: string, poolId: string, memberId: string) {
      return call<Assessment>(
        `/assessments/${assessmentId}/pools/${poolId}/members/${memberId}`,
        { method: "DELETE" },
      );
    },
    previewPools(assessmentId: string) {
      return call<{
        preview: Array<{
          questionId: string;
          title: string;
          source: string;
        }>;
      }>(`/assessments/${assessmentId}/pools/preview`);
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
        emailBound: boolean;
        expiresAt: string | null;
        assessment: {
          id: string;
          title: string;
          description: string;
          durationSeconds: number;
        };
      }>(`/invites/${token}`);
    },
    requestInviteOtp(
      token: string,
      body: { candidateEmail: string; captchaToken?: string },
    ) {
      return call<{ sent: boolean; expiresInSeconds: number }>(
        `/invites/${token}/otp`,
        { method: "POST", body: JSON.stringify(body) },
      );
    },
    startSession(
      token: string,
      body: {
        candidateName: string;
        candidateEmail: string;
        otp: string;
        captchaToken?: string;
      },
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
    runVisible(
      questionId: string,
      body: { source?: string; files?: Record<string, string>; query?: string },
    ) {
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
    listSessions(assessmentId: string, opts?: { collapse?: "best" }) {
      const q =
        opts?.collapse === "best" ? "?collapse=best" : "";
      return call<
        | Array<{
            id: string;
            candidateName: string;
            candidateEmail: string;
            status: string;
            totalScore: number;
            maxScore: number;
            submittedAt: string | null;
          }>
        | Array<{
            candidateEmail: string;
            candidateName: string;
            bestScore: number;
            maxScore: number;
            bestSessionId: string;
            attemptCount: number;
            attempts: Array<{
              id: string;
              candidateName: string;
              candidateEmail: string;
              status: string;
              totalScore: number;
              maxScore: number;
              submittedAt: string | null;
            }>;
          }>
      >(`/assessments/${assessmentId}/sessions${q}`);
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
