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
  },
  (t) => [
    index("assessment_questions_assessment_idx").on(t.assessmentId),
    uniqueIndex("assessment_questions_unique").on(t.assessmentId, t.questionId),
  ],
);

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
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [uniqueIndex("invites_token_idx").on(t.token)],
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
