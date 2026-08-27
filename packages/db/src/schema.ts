import {
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const sessionStatusEnum = pgEnum("session_status", [
  "not_started",
  "in_progress",
  "submitted",
  "expired",
]);

export const attemptStatusEnum = pgEnum("attempt_status", [
  "locked",
  "not_started",
  "in_progress",
  "skipped",
  "submitted",
  "expired",
]);

export const activityEventTypeEnum = pgEnum("activity_event_type", [
  "focus_lost",
  "paste",
  "tab_hidden",
  "save",
  "submit",
  "skip",
  "open",
]);

export const recruiters = pgTable("recruiters", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const recruiterSessions = pgTable(
  "recruiter_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    recruiterId: uuid("recruiter_id")
      .notNull()
      .references(() => recruiters.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [uniqueIndex("recruiter_sessions_token_hash_idx").on(t.tokenHash)],
);

export const assessments = pgTable("assessments", {
  id: uuid("id").defaultRandom().primaryKey(),
  recruiterId: uuid("recruiter_id")
    .notNull()
    .references(() => recruiters.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  durationSeconds: integer("duration_seconds").notNull(),
  rules: jsonb("rules")
    .$type<{
      allowSkip: boolean;
      allowReturn: boolean;
      perQuestionTimers: boolean;
      linearLock: boolean;
      randomizeQuestionOrder?: boolean;
    }>()
    .notNull(),
  published: boolean("published").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const questions = pgTable("questions", {
  id: uuid("id").defaultRandom().primaryKey(),
  type: text("type").notNull(),
  title: text("title").notNull(),
  prompt: text("prompt").notNull().default(""),
  /** TipTap JSON document for rich prompts; null = derive from plain prompt. */
  promptDoc: jsonb("prompt_doc").$type<Record<string, unknown>>(),
  timeLimitSeconds: integer("time_limit_seconds").notNull(),
  points: integer("points").notNull().default(10),
  config: jsonb("config").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

/** Uploaded images (and later files) for rich-text prompts. */
export const assets = pgTable(
  "assets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    recruiterId: uuid("recruiter_id")
      .notNull()
      .references(() => recruiters.id, { onDelete: "cascade" }),
    filename: text("filename").notNull(),
    contentType: text("content_type").notNull(),
    byteSize: integer("byte_size").notNull(),
    storagePath: text("storage_path").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("assets_recruiter_idx").on(t.recruiterId)],
);

export const assessmentSections = pgTable(
  "assessment_sections",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    assessmentId: uuid("assessment_id")
      .notNull()
      .references(() => assessments.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    order: integer("order").notNull(),
    timeLimitSeconds: integer("time_limit_seconds"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("assessment_sections_assessment_idx").on(t.assessmentId)],
);

export const assessmentQuestions = pgTable(
  "assessment_questions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    assessmentId: uuid("assessment_id")
      .notNull()
      .references(() => assessments.id, { onDelete: "cascade" }),
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    order: integer("order").notNull(),
    sectionId: uuid("section_id").references(() => assessmentSections.id, {
      onDelete: "set null",
    }),
  },
  (t) => [
    index("assessment_questions_assessment_idx").on(t.assessmentId),
    uniqueIndex("assessment_questions_unique").on(t.assessmentId, t.questionId),
  ],
);

/** Recruiter-owned reusable question library. */
export const bankQuestions = pgTable(
  "bank_questions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    recruiterId: uuid("recruiter_id")
      .notNull()
      .references(() => recruiters.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    title: text("title").notNull(),
    prompt: text("prompt").notNull().default(""),
    promptDoc: jsonb("prompt_doc").$type<Record<string, unknown>>(),
    timeLimitSeconds: integer("time_limit_seconds").notNull(),
    points: integer("points").notNull().default(10),
    config: jsonb("config").$type<Record<string, unknown>>().notNull(),
    tags: text("tags")
      .array()
      .notNull()
      .default(sql`'{}'`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("bank_questions_recruiter_idx").on(t.recruiterId)],
);

export const assessmentPools = pgTable(
  "assessment_pools",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    assessmentId: uuid("assessment_id")
      .notNull()
      .references(() => assessments.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    drawCount: integer("draw_count").notNull(),
    order: integer("order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("assessment_pools_assessment_idx").on(t.assessmentId)],
);

export const assessmentPoolMembers = pgTable(
  "assessment_pool_members",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    poolId: uuid("pool_id")
      .notNull()
      .references(() => assessmentPools.id, { onDelete: "cascade" }),
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
  },
  (t) => [
    uniqueIndex("assessment_pool_members_unique").on(t.poolId, t.questionId),
  ],
);

export const inviteStatusEnum = pgEnum("invite_status", [
  "pending",
  "used",
  "revoked",
]);

export const inviteModeEnum = pgEnum("invite_mode", ["single", "multi"]);

export const invites = pgTable(
  "invites",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    assessmentId: uuid("assessment_id")
      .notNull()
      .references(() => assessments.id, { onDelete: "cascade" }),
    token: text("token").notNull(),
    candidateEmail: text("candidate_email"),
    candidateName: text("candidate_name"),
    status: inviteStatusEnum("status").notNull().default("pending"),
    mode: inviteModeEnum("mode").notNull().default("single"),
    maxUses: integer("max_uses").notNull().default(1),
    useCount: integer("use_count").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    usedAt: timestamp("used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    lastEmailedAt: timestamp("last_emailed_at", { withTimezone: true }),
    otpHash: text("otp_hash"),
    otpExpiresAt: timestamp("otp_expires_at", { withTimezone: true }),
    otpAttempts: integer("otp_attempts").notNull().default(0),
    otpSentAt: timestamp("otp_sent_at", { withTimezone: true }),
    otpEmail: text("otp_email"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("invites_token_idx").on(t.token),
    uniqueIndex("invites_pending_email_unique")
      .on(t.assessmentId, t.candidateEmail)
      .where(sql`status = 'pending' AND candidate_email IS NOT NULL`),
  ],
);

export const candidateSessions = pgTable(
  "candidate_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    assessmentId: uuid("assessment_id")
      .notNull()
      .references(() => assessments.id, { onDelete: "cascade" }),
    inviteId: uuid("invite_id")
      .notNull()
      .references(() => invites.id, { onDelete: "cascade" }),
    candidateName: text("candidate_name").notNull(),
    candidateEmail: text("candidate_email").notNull(),
    status: sessionStatusEnum("status").notNull().default("not_started"),
    remainingOverallMs: integer("remaining_overall_ms").notNull(),
    currentQuestionId: uuid("current_question_id"),
    overallClockStartedAt: timestamp("overall_clock_started_at", {
      withTimezone: true,
    }),
    questionClockStartedAt: timestamp("question_clock_started_at", {
      withTimezone: true,
    }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    sessionTokenHash: text("session_token_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("candidate_sessions_token_idx").on(t.sessionTokenHash),
    index("candidate_sessions_invite_idx").on(t.inviteId),
    index("candidate_sessions_assessment_idx").on(t.assessmentId),
  ],
);

export const questionAttempts = pgTable(
  "question_attempts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => candidateSessions.id, { onDelete: "cascade" }),
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    order: integer("order").notNull(),
    status: attemptStatusEnum("status").notNull().default("not_started"),
    remainingMs: integer("remaining_ms").notNull(),
    answer: jsonb("answer"),
    workspace: jsonb("workspace"),
    score: integer("score"),
    gradeDetails: jsonb("grade_details").$type<Record<string, unknown>>(),
    gradedAt: timestamp("graded_at", { withTimezone: true }),
  },
  (t) => [
    index("question_attempts_session_idx").on(t.sessionId),
    uniqueIndex("question_attempts_unique").on(t.sessionId, t.questionId),
  ],
);

export const activityEvents = pgTable(
  "activity_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => candidateSessions.id, { onDelete: "cascade" }),
    questionId: uuid("question_id").references(() => questions.id, {
      onDelete: "set null",
    }),
    type: activityEventTypeEnum("type").notNull(),
    meta: jsonb("meta").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("activity_events_session_idx").on(t.sessionId)],
);

export const apiTokens = pgTable(
  "api_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    recruiterId: uuid("recruiter_id")
      .notNull()
      .references(() => recruiters.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    tokenHash: text("token_hash").notNull(),
    /** First/last chars for display; never store the full token. */
    tokenPrefix: text("token_prefix").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("api_tokens_token_hash_idx").on(t.tokenHash),
    index("api_tokens_recruiter_idx").on(t.recruiterId),
  ],
);

export const emailTemplates = pgTable(
  "email_templates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    recruiterId: uuid("recruiter_id")
      .notNull()
      .references(() => recruiters.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    name: text("name").notNull(),
    subject: text("subject").notNull(),
    bodyHtml: text("body_html").notNull(),
    bodyText: text("body_text").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("email_templates_recruiter_key_idx").on(t.recruiterId, t.key),
    index("email_templates_recruiter_idx").on(t.recruiterId),
  ],
);

/** Per-IP counters for public invite OTP / start endpoints. */
export const inviteIpRateLimits = pgTable(
  "invite_ip_rate_limits",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ip: text("ip").notNull(),
    action: text("action").notNull(),
    windowStartedAt: timestamp("window_started_at", { withTimezone: true })
      .notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [uniqueIndex("invite_ip_rate_limits_ip_action_idx").on(t.ip, t.action)],
);
