import { z } from "zod";

export const questionTypeSchema = z.enum([
  "mcq",
  "coding",
  "sql",
  "text",
  "video",
  "design",
  "file",
]);
export type QuestionType = z.infer<typeof questionTypeSchema>;

export const integrityNoticeSchema = z.object({
  enabled: z.boolean().default(false),
  forbidAiAssistance: z.boolean().default(true),
  legalWatermark: z.boolean().default(true),
  canaryTokens: z.boolean().default(true),
  liabilityLanguage: z.boolean().default(true),
});
export type IntegrityNotice = z.infer<typeof integrityNoticeSchema>;

export const integritySignalsSchema = z.object({
  trackPasteSize: z.boolean().default(true),
  flagCopy: z.boolean().default(true),
  requireFullscreen: z.boolean().default(false),
  trackTypingStats: z.boolean().default(true),
});
export type IntegritySignals = z.infer<typeof integritySignalsSchema>;

export const proctoringSchema = z.object({
  webcamSnapshots: z.boolean().default(false),
  snapshotIntervalMinSeconds: z.number().int().min(15).max(600).default(45),
  snapshotIntervalMaxSeconds: z.number().int().min(30).max(900).default(120),
  snapshotOnFocusLoss: z.boolean().default(true),
  retainDays: z.number().int().min(1).max(365).default(30),
});
export type ProctoringRules = z.infer<typeof proctoringSchema>;

export const assessmentRulesObjectSchema = z.object({
  allowSkip: z.boolean().default(true),
  allowReturn: z.boolean().default(true),
  perQuestionTimers: z.boolean().default(true),
  linearLock: z.boolean().default(false),
  randomizeQuestionOrder: z.boolean().default(false),
  integrityNotice: integrityNoticeSchema.optional(),
  integrity: integritySignalsSchema.optional(),
  proctoring: proctoringSchema.optional(),
});

export const assessmentRulesSchema = assessmentRulesObjectSchema.superRefine(
  (val, ctx) => {
    const p = val.proctoring;
    if (
      p &&
      p.snapshotIntervalMaxSeconds < p.snapshotIntervalMinSeconds
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "snapshotIntervalMaxSeconds must be >= min",
        path: ["proctoring", "snapshotIntervalMaxSeconds"],
      });
    }
  },
);
export type AssessmentRules = z.infer<typeof assessmentRulesSchema>;

/** Current version of candidate integrity clickwrap terms. */
export const INTEGRITY_TERMS_VERSION = "2026-08-28";

export const sessionStatusSchema = z.enum([
  "not_started",
  "in_progress",
  "submitted",
  "expired",
]);
export type SessionStatus = z.infer<typeof sessionStatusSchema>;

export const attemptStatusSchema = z.enum([
  "locked",
  "not_started",
  "in_progress",
  "skipped",
  "submitted",
  "expired",
]);
export type AttemptStatus = z.infer<typeof attemptStatusSchema>;

export const activityEventTypeSchema = z.enum([
  "focus_lost",
  "focus_gained",
  "paste",
  "copy",
  "cut",
  "tab_hidden",
  "tab_visible",
  "save",
  "submit",
  "skip",
  "open",
  "webcam_snapshot",
  "webcam_denied",
  "typing_stats",
  "answer_burst",
  "fullscreen_exit",
  "integrity_accepted",
]);
export type ActivityEventType = z.infer<typeof activityEventTypeSchema>;

export const gradeResultSchema = z.object({
  score: z.number().min(0),
  maxScore: z.number().min(0),
  details: z.record(z.unknown()).optional(),
});
export type GradeResult = z.infer<typeof gradeResultSchema>;
