import { z } from "zod";
import type { GradeResult, QuestionPlugin } from "@assessment-os/core";

export const codingTestCaseSchema = z.object({
  id: z.string(),
  stdin: z.string().default(""),
  expectedStdout: z.string(),
  label: z.string().optional(),
});

export const starterFileSchema = z.object({
  path: z.string().min(1),
  content: z.string(),
});

export const codingConfigSchema = z.object({
  language: z.enum(["javascript", "python", "typescript", "java", "cpp"]),
  /** Judge0 language id override; if omitted, mapped from language. */
  judge0LanguageId: z.number().optional(),
  /** io = stdin/stdout cases; unit = pytest/Jest harness */
  mode: z.enum(["io", "unit"]).default("io"),
  starterCode: z.string().default(""),
  /** I/O mode */
  visibleTests: z.array(codingTestCaseSchema).default([]),
  hiddenTests: z.array(codingTestCaseSchema).default([]),
  /** Unit mode */
  entryFile: z.string().optional(),
  starterFiles: z.array(starterFileSchema).default([]),
  visibleTestCode: z.string().default(""),
  hiddenTestCode: z.string().default(""),
  framework: z.enum(["pytest", "jest"]).optional(),
  timeLimitMs: z.number().int().positive().optional(),
  memoryMb: z.number().int().positive().optional(),
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

export function defaultFramework(
  language: CodingConfig["language"],
): "pytest" | "jest" | undefined {
  if (language === "python") return "pytest";
  if (language === "javascript" || language === "typescript") return "jest";
  return undefined;
}

export function defaultEntryFile(language: CodingConfig["language"]): string {
  switch (language) {
    case "python":
      return "solution.py";
    case "typescript":
      return "solution.ts";
    case "javascript":
      return "solution.js";
    case "java":
      return "Solution.java";
    case "cpp":
      return "main.cpp";
  }
}

export function validateCodingConfig(input: unknown): CodingConfig {
  const config = codingConfigSchema.parse(input);
  if (config.mode === "unit") {
    const framework = config.framework ?? defaultFramework(config.language);
    if (!framework) {
      throw new Error(
        `Unit-test mode is only supported for Python, JavaScript, and TypeScript (got ${config.language})`,
      );
    }
    if (!config.visibleTestCode.trim() && !config.hiddenTestCode.trim()) {
      throw new Error("Unit-test mode requires visibleTestCode and/or hiddenTestCode");
    }
    return {
      ...config,
      framework,
      entryFile: config.entryFile ?? defaultEntryFile(config.language),
    };
  }
  return config;
}

/**
 * Grading uses runner results for hidden I/O cases or hidden unit tests.
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
  const mode = args.config.mode ?? "io";
  const hasHidden =
    mode === "unit"
      ? Boolean(args.config.hiddenTestCode?.trim())
      : (args.config.hiddenTests?.length ?? 0) > 0;

  if (!results || results.length === 0) {
    if (!hasHidden) {
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
    details: { passed, total, results, gradingMode: mode },
  };
}

export const codingPlugin: QuestionPlugin<CodingConfig, CodingAnswer> = {
  type: "coding",
  validateConfig: validateCodingConfig,
  grade: async ({ config, answer, workspace, points }) =>
    gradeCoding({ config, answer, workspace, points }),
};
