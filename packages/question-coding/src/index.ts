import { z } from "zod";
import type { GradeResult, QuestionPlugin } from "@assessment-os/core";

export const codingTestCaseSchema = z.object({
  id: z.string(),
  stdin: z.string().default(""),
  expectedStdout: z.string(),
  label: z.string().optional(),
});

export const codingConfigSchema = z.object({
  language: z.enum(["javascript", "python", "typescript", "java", "cpp"]),
  /** Judge0 language id override; if omitted, mapped from language. */
  judge0LanguageId: z.number().optional(),
  starterCode: z.string().default(""),
  visibleTests: z.array(codingTestCaseSchema).default([]),
  hiddenTests: z.array(codingTestCaseSchema).default([]),
});
export type CodingConfig = z.infer<typeof codingConfigSchema>;

export const codingAnswerSchema = z.object({
  source: z.string(),
});
export type CodingAnswer = z.infer<typeof codingAnswerSchema>;

export const codingWorkspaceSchema = z.object({
  source: z.string(),
  lastVisibleResults: z
    .array(
      z.object({
        id: z.string(),
        passed: z.boolean(),
        stdout: z.string().optional(),
        stderr: z.string().optional(),
        status: z.string().optional(),
      }),
    )
    .optional(),
});
export type CodingWorkspace = z.infer<typeof codingWorkspaceSchema>;

export const JUDGE0_LANGUAGE_IDS: Record<CodingConfig["language"], number> = {
  javascript: 63, // Node.js
  typescript: 74,
  python: 71, // Python 3
  java: 62,
  cpp: 54,
};

export function validateCodingConfig(input: unknown): CodingConfig {
  return codingConfigSchema.parse(input);
}

/**
 * Grading for coding requires Judge0. The API injects a grade function
 * that runs hidden tests. This default grades from precomputed details
 * when provided via workspace.lastHiddenResults pattern, else 0.
 */
export async function gradeCoding(args: {
  config: CodingConfig;
  answer: CodingAnswer | null;
  workspace?: unknown;
  points: number;
  /** Injected by API when Runner results are available */
  hiddenResults?: Array<{ id: string; passed: boolean }>;
}): Promise<GradeResult> {
  const results = args.hiddenResults;
  if (!results || results.length === 0) {
    // If no hidden tests, award full points when source present
    if ((args.config.hiddenTests?.length ?? 0) === 0) {
      const hasSource = Boolean(args.answer?.source?.trim());
      return {
        score: hasSource ? args.points : 0,
        maxScore: args.points,
        details: { mode: "no_hidden_tests", hasSource },
      };
    }
    return {
      score: 0,
      maxScore: args.points,
      details: { mode: "pending_runner" },
    };
  }
  const passed = results.filter((r) => r.passed).length;
  const total = results.length;
  const score =
    total === 0 ? 0 : Math.round((passed / total) * args.points);
  return {
    score,
    maxScore: args.points,
    details: { passed, total, results },
  };
}

export const codingPlugin: QuestionPlugin<CodingConfig, CodingAnswer> = {
  type: "coding",
  validateConfig: validateCodingConfig,
  grade: async ({ config, answer, workspace, points }) =>
    gradeCoding({ config, answer, workspace, points }),
};
