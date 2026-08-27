import { z } from "zod";
import type { GradeResult, QuestionPlugin } from "@assessment-os/core";

export const MAX_STARTER_FILES = 20;
export const MAX_WORKSPACE_BYTES = 256 * 1024;

export const codingTestCaseSchema = z.object({
  id: z.string(),
  stdin: z.string().default(""),
  expectedStdout: z.string().default(""),
  label: z.string().optional(),
});

export const starterFileSchema = z.object({
  path: z.string().min(1).max(200),
  content: z.string(),
});

export const unitFrameworkSchema = z.enum([
  "pytest",
  "jest",
  "phpunit",
  "junit",
  "googletest",
]);
export type UnitFramework = z.infer<typeof unitFrameworkSchema>;

export const scoringModeSchema = z.enum(["proportional", "all_or_nothing"]);
export type ScoringMode = z.infer<typeof scoringModeSchema>;

export const codingConfigSchema = z.object({
  language: z.enum([
    "javascript",
    "python",
    "typescript",
    "java",
    "cpp",
    "php",
  ]),
  /** Judge0 language id override; if omitted, mapped from language. */
  judge0LanguageId: z.number().optional(),
  /** io = stdin/stdout cases; unit = framework harness (pytest/Jest/…) */
  mode: z.enum(["io", "unit"]).default("io"),
  starterCode: z.string().default(""),
  /** I/O mode */
  visibleTests: z.array(codingTestCaseSchema).default([]),
  hiddenTests: z.array(codingTestCaseSchema).default([]),
  /**
   * Optional Python checker for I/O mode. Receives candidate stdout on stdin
   * and EXPECTED_STDOUT / TEST_STDIN env vars; exit 0 = pass, else fail.
   */
  checkerCode: z.string().optional(),
  /** Unit mode */
  entryFile: z.string().optional(),
  starterFiles: z.array(starterFileSchema).default([]),
  visibleTestCode: z.string().default(""),
  hiddenTestCode: z.string().default(""),
  framework: unitFrameworkSchema.optional(),
  timeLimitMs: z.number().int().positive().optional(),
  memoryMb: z.number().int().positive().optional(),
  /** Default proportional for coding. */
  scoring: scoringModeSchema.default("proportional"),
});
export type CodingConfig = z.infer<typeof codingConfigSchema>;

export const codingAnswerSchema = z.object({
  /** Entry-file source (back-compat). Prefer `files` when multi-file. */
  source: z.string().optional(),
  /** path → content map for multi-file projects */
  files: z.record(z.string()).optional(),
});
export type CodingAnswer = z.infer<typeof codingAnswerSchema>;

export const codingWorkspaceSchema = z.object({
  source: z.string().optional(),
  files: z.record(z.string()).optional(),
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
  php: 68, // PHP 8.x (Judge0 CE)
};

export function defaultFramework(
  language: CodingConfig["language"],
): UnitFramework | undefined {
  if (language === "python") return "pytest";
  if (language === "javascript" || language === "typescript") return "jest";
  if (language === "php") return "phpunit";
  if (language === "java") return "junit";
  if (language === "cpp") return "googletest";
  return undefined;
}

export function defaultEntryFile(
  language: CodingConfig["language"],
  mode: "io" | "unit" = "io",
): string {
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
      return mode === "unit" ? "solution.cpp" : "main.cpp";
    case "php":
      return "solution.php";
  }
}

/** Total UTF-8 byte size of a path→content map. */
export function workspaceByteSize(files: Record<string, string>): number {
  let total = 0;
  const encoder = new TextEncoder();
  for (const [path, content] of Object.entries(files)) {
    total += encoder.encode(path).length + encoder.encode(content).length;
  }
  return total;
}

export function assertWorkspaceLimits(files: Record<string, string>): void {
  const paths = Object.keys(files);
  if (paths.length > MAX_STARTER_FILES) {
    throw new Error(`At most ${MAX_STARTER_FILES} files allowed`);
  }
  if (workspaceByteSize(files) > MAX_WORKSPACE_BYTES) {
    throw new Error(`Workspace exceeds ${MAX_WORKSPACE_BYTES} bytes`);
  }
}

/**
 * Build editable file map from config + candidate answer/workspace.
 * Entry file content prefers answer/workspace over starterCode.
 */
export function resolveWorkspaceFiles(args: {
  config: CodingConfig;
  answer?: CodingAnswer | null;
  workspace?: CodingWorkspace | null;
}): { files: Record<string, string>; entryFile: string; entrySource: string } {
  const mode = args.config.mode ?? "io";
  const entryFile =
    args.config.entryFile ?? defaultEntryFile(args.config.language, mode);

  const files: Record<string, string> = {};
  for (const f of args.config.starterFiles ?? []) {
    files[f.path] = f.content;
  }

  // Single-file starterCode seeds the entry file when no starterFiles entry.
  if (!(entryFile in files) && args.config.starterCode) {
    files[entryFile] = args.config.starterCode;
  }

  const fromAnswer = args.answer?.files;
  const fromWorkspace = args.workspace?.files;
  if (fromAnswer && Object.keys(fromAnswer).length > 0) {
    Object.assign(files, fromAnswer);
  } else if (fromWorkspace && Object.keys(fromWorkspace).length > 0) {
    Object.assign(files, fromWorkspace);
  }

  const source =
    args.answer?.source ??
    args.workspace?.source ??
    files[entryFile] ??
    args.config.starterCode ??
    "";
  files[entryFile] = source;

  assertWorkspaceLimits(files);
  return { files, entryFile, entrySource: files[entryFile] ?? "" };
}

export function filesToStarterList(
  files: Record<string, string>,
  entryFile: string,
): Array<{ path: string; content: string }> {
  return Object.entries(files)
    .filter(([path]) => path !== entryFile)
    .map(([path, content]) => ({ path, content }));
}

function validateStarterFiles(files: Array<{ path: string; content: string }>) {
  if (files.length > MAX_STARTER_FILES) {
    throw new Error(`At most ${MAX_STARTER_FILES} starter files allowed`);
  }
  const map: Record<string, string> = {};
  for (const f of files) {
    if (!f.path.trim()) throw new Error("Starter file path cannot be empty");
    if (map[f.path] !== undefined) {
      throw new Error(`Duplicate starter file path: ${f.path}`);
    }
    map[f.path] = f.content;
  }
  if (workspaceByteSize(map) > MAX_WORKSPACE_BYTES) {
    throw new Error(`Starter files exceed ${MAX_WORKSPACE_BYTES} bytes total`);
  }
}

export function validateCodingConfig(input: unknown): CodingConfig {
  const config = codingConfigSchema.parse(input);
  validateStarterFiles(config.starterFiles ?? []);

  if (config.mode === "unit") {
    const framework = config.framework ?? defaultFramework(config.language);
    if (!framework) {
      throw new Error(
        `Unit-test mode is not supported for language ${config.language}`,
      );
    }
    if (!config.visibleTestCode.trim() && !config.hiddenTestCode.trim()) {
      throw new Error("Unit-test mode requires visibleTestCode and/or hiddenTestCode");
    }
    return {
      ...config,
      framework,
      entryFile: config.entryFile ?? defaultEntryFile(config.language, "unit"),
      scoring: config.scoring ?? "proportional",
    };
  }

  if (config.checkerCode?.trim() && config.language !== "python" && config.mode === "io") {
    // Checker itself is always Python; candidate language can differ.
  }

  return {
    ...config,
    entryFile: config.entryFile ?? defaultEntryFile(config.language, "io"),
    scoring: config.scoring ?? "proportional",
  };
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
  const scoring = args.config.scoring ?? "proportional";
  const hasHidden =
    mode === "unit"
      ? Boolean(args.config.hiddenTestCode?.trim())
      : (args.config.hiddenTests?.length ?? 0) > 0 ||
        Boolean(args.config.checkerCode?.trim());

  const hasSource = Boolean(
    args.answer?.source?.trim() ||
      (args.answer?.files &&
        Object.values(args.answer.files).some((c) => c.trim())),
  );

  if (!results || results.length === 0) {
    if (!hasHidden) {
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
  let score = 0;
  if (total > 0) {
    if (scoring === "all_or_nothing") {
      score = passed === total ? args.points : 0;
    } else {
      score = Math.round((passed / total) * args.points);
    }
  }
  const perTestPoints =
    total > 0 ? args.points / total : 0;
  return {
    score,
    maxScore: args.points,
    details: {
      passed,
      total,
      results: results.map((r) => ({
        ...r,
        awardedPoints: r.passed
          ? scoring === "all_or_nothing"
            ? passed === total
              ? perTestPoints
              : 0
            : perTestPoints
          : 0,
      })),
      gradingMode: mode,
      scoring,
    },
  };
}

export const codingPlugin: QuestionPlugin<CodingConfig, CodingAnswer> = {
  type: "coding",
  validateConfig: validateCodingConfig,
  grade: async ({ config, answer, workspace, points }) =>
    gradeCoding({ config, answer, workspace, points }),
};
