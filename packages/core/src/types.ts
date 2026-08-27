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

export const assessmentRulesSchema = z.object({
  allowSkip: z.boolean().default(true),
  allowReturn: z.boolean().default(true),
  perQuestionTimers: z.boolean().default(true),
  linearLock: z.boolean().default(false),
});
export type AssessmentRules = z.infer<typeof assessmentRulesSchema>;

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
  "paste",
  "tab_hidden",
  "save",
  "submit",
  "skip",
  "open",
]);
export type ActivityEventType = z.infer<typeof activityEventTypeSchema>;

export const gradeResultSchema = z.object({
  score: z.number().min(0),
  maxScore: z.number().min(0),
  details: z.record(z.unknown()).optional(),
});
export type GradeResult = z.infer<typeof gradeResultSchema>;
