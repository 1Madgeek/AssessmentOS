import { z } from "zod";
import type { GradeResult, QuestionPlugin } from "@assessment-os/core";

export const sqlExpectedRowSchema = z.record(z.unknown());

export const sqlTestCaseSchema = z.object({
  id: z.string(),
  label: z.string().optional(),
  expectedRows: z.array(sqlExpectedRowSchema),
});

export const sqlConfigSchema = z.object({
  dialect: z.literal("sqlite").default("sqlite"),
  schemaSql: z.string().min(1),
  seedSql: z.string().default(""),
  visibleTests: z.array(sqlTestCaseSchema).default([]),
  hiddenTests: z.array(sqlTestCaseSchema).default([]),
  maxRows: z.number().int().positive().optional(),
  starterQuery: z.string().default("SELECT "),
});
export type SqlConfig = z.infer<typeof sqlConfigSchema>;
export type SqlTestCase = z.infer<typeof sqlTestCaseSchema>;

export const sqlAnswerSchema = z.object({
  query: z.string(),
});
export type SqlAnswer = z.infer<typeof sqlAnswerSchema>;

export const sqlWorkspaceSchema = z.object({
  query: z.string().optional(),
  lastVisibleResults: z
    .array(
      z.object({
        id: z.string(),
        passed: z.boolean(),
        rows: z.array(z.record(z.unknown())).optional(),
        error: z.string().optional(),
      }),
    )
    .optional(),
});
export type SqlWorkspace = z.infer<typeof sqlWorkspaceSchema>;

export function validateSqlConfig(input: unknown): SqlConfig {
  const config = sqlConfigSchema.parse(input);
  if (
    config.visibleTests.length === 0 &&
    config.hiddenTests.length === 0
  ) {
    throw new Error("SQL questions require visibleTests and/or hiddenTests");
  }
  return config;
}

function normalizeCell(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return Number(value);
  return String(value);
}

/** Column-name-case-insensitive row compare; row order matters. */
export function rowsMatch(
  actual: Array<Record<string, unknown>>,
  expected: Array<Record<string, unknown>>,
): boolean {
  if (actual.length !== expected.length) return false;
  for (let i = 0; i < actual.length; i++) {
    const a = Object.fromEntries(
      Object.entries(actual[i] ?? {}).map(([k, v]) => [
        k.toLowerCase(),
        normalizeCell(v),
      ]),
    );
    const b = Object.fromEntries(
      Object.entries(expected[i] ?? {}).map(([k, v]) => [
        k.toLowerCase(),
        normalizeCell(v),
      ]),
    );
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const key of keys) {
      if (a[key] !== b[key]) return false;
    }
  }
  return true;
}

/**
 * Grading uses runner results for hidden expected-row checks.
 */
export async function gradeSql(args: {
  config: SqlConfig;
  answer: SqlAnswer | null;
  points: number;
  hiddenResults?: Array<{ id: string; passed: boolean }>;
}): Promise<GradeResult> {
  const results = args.hiddenResults;
  const hasHidden = (args.config.hiddenTests?.length ?? 0) > 0;

  if (!results || results.length === 0) {
    if (!hasHidden) {
      const hasQuery = Boolean(args.answer?.query?.trim());
      return {
        score: hasQuery ? args.points : 0,
        maxScore: args.points,
        details: { mode: "no_hidden_tests", hasQuery },
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
    details: { passed, total, results, gradingMode: "sql" },
  };
}

export const sqlPlugin: QuestionPlugin<SqlConfig, SqlAnswer> = {
  type: "sql",
  validateConfig: validateSqlConfig,
  grade: async ({ config, answer, points }) =>
    gradeSql({ config, answer, points }),
};
