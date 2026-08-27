#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createClient } from "@assessment-os/sdk";
import { z } from "zod";

function env(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `Missing required env ${name}. Set ASSESSMENTOS_API_URL and ASSESSMENTOS_API_TOKEN.`,
    );
  }
  return value;
}

function text(data: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text:
          typeof data === "string" ? data : JSON.stringify(data, null, 2),
      },
    ],
  };
}

async function main() {
  const apiUrl = env("ASSESSMENTOS_API_URL").replace(/\/$/, "");
  const apiToken = env("ASSESSMENTOS_API_TOKEN");
  const client = createClient(apiUrl, { apiToken });

  const server = new McpServer({
    name: "assessmentos",
    version: "0.1.0",
  });

  server.tool(
    "list_assessments",
    "List assessments owned by the authenticated recruiter.",
    {},
    async () => text(await client.listAssessments()),
  );

  server.tool(
    "get_assessment",
    "Get one assessment including its questions.",
    { assessment_id: z.string().uuid() },
    async ({ assessment_id }) =>
      text(await client.getAssessment(assessment_id)),
  );

  server.tool(
    "create_assessment",
    "Create a draft assessment.",
    {
      title: z.string().min(1),
      description: z.string().optional(),
      duration_seconds: z.number().int().positive(),
      allow_skip: z.boolean().optional(),
      allow_return: z.boolean().optional(),
      per_question_timers: z.boolean().optional(),
      linear_lock: z.boolean().optional(),
    },
    async (args) =>
      text(
        await client.createAssessment({
          title: args.title,
          description: args.description,
          durationSeconds: args.duration_seconds,
          rules: {
            allowSkip: args.allow_skip,
            allowReturn: args.allow_return,
            perQuestionTimers: args.per_question_timers,
            linearLock: args.linear_lock,
          },
        }),
      ),
  );

  server.tool(
    "update_assessment",
    "Update assessment metadata and/or publish it.",
    {
      assessment_id: z.string().uuid(),
      title: z.string().min(1).optional(),
      description: z.string().optional(),
      duration_seconds: z.number().int().positive().optional(),
      published: z.boolean().optional(),
      allow_skip: z.boolean().optional(),
      allow_return: z.boolean().optional(),
      per_question_timers: z.boolean().optional(),
      linear_lock: z.boolean().optional(),
    },
    async (args) => {
      const rulesDefined =
        args.allow_skip !== undefined ||
        args.allow_return !== undefined ||
        args.per_question_timers !== undefined ||
        args.linear_lock !== undefined;
      return text(
        await client.updateAssessment(args.assessment_id, {
          title: args.title,
          description: args.description,
          durationSeconds: args.duration_seconds,
          published: args.published,
          ...(rulesDefined
            ? {
                rules: {
                  allowSkip: args.allow_skip ?? true,
                  allowReturn: args.allow_return ?? true,
                  perQuestionTimers: args.per_question_timers ?? true,
                  linearLock: args.linear_lock ?? false,
                },
              }
            : {}),
        }),
      );
    },
  );

  server.tool(
    "add_mcq_question",
    "Add a multiple-choice question to an assessment.",
    {
      assessment_id: z.string().uuid(),
      title: z.string().min(1),
      prompt: z.string().min(1),
      time_limit_seconds: z.number().int().positive(),
      points: z.number().int().positive().optional(),
      multi_select: z.boolean().optional(),
      options: z
        .array(
          z.object({
            id: z.string().min(1),
            label: z.string().min(1),
          }),
        )
        .min(2),
      correct_option_ids: z.array(z.string().min(1)).min(1),
    },
    async (args) =>
      text(
        await client.addQuestion(args.assessment_id, {
          type: "mcq",
          title: args.title,
          prompt: args.prompt,
          timeLimitSeconds: args.time_limit_seconds,
          points: args.points ?? 10,
          config: {
            multiSelect: args.multi_select ?? false,
            options: args.options,
            correctOptionIds: args.correct_option_ids,
          },
        }),
      ),
  );

  server.tool(
    "add_coding_question",
    "Add a coding question (unit-test or stdin/stdout mode). Prefer mode=unit with visible_test_code + hidden_test_code for Python/JS/TS.",
    {
      assessment_id: z.string().uuid(),
      title: z.string().min(1),
      prompt: z.string().min(1),
      time_limit_seconds: z.number().int().positive(),
      points: z.number().int().positive().optional(),
      language: z.enum([
        "python",
        "javascript",
        "typescript",
        "java",
        "cpp",
      ]),
      mode: z.enum(["unit", "io"]).default("unit"),
      starter_code: z.string().default(""),
      entry_file: z.string().optional(),
      framework: z.enum(["pytest", "jest"]).optional(),
      visible_test_code: z.string().optional(),
      hidden_test_code: z.string().optional(),
      visible_tests: z
        .array(
          z.object({
            id: z.string(),
            stdin: z.string().default(""),
            expected_stdout: z.string(),
            label: z.string().optional(),
          }),
        )
        .optional(),
      hidden_tests: z
        .array(
          z.object({
            id: z.string(),
            stdin: z.string().default(""),
            expected_stdout: z.string(),
            label: z.string().optional(),
          }),
        )
        .optional(),
    },
    async (args) => {
      const mode = args.mode ?? "unit";
      const config: Record<string, unknown> = {
        language: args.language,
        mode,
        starterCode: args.starter_code,
      };
      if (mode === "unit") {
        config.framework =
          args.framework ??
          (args.language === "python"
            ? "pytest"
            : args.language === "javascript" || args.language === "typescript"
              ? "jest"
              : undefined);
        config.entryFile =
          args.entry_file ??
          (args.language === "python"
            ? "solution.py"
            : args.language === "typescript"
              ? "solution.ts"
              : "solution.js");
        config.visibleTestCode = args.visible_test_code ?? "";
        config.hiddenTestCode = args.hidden_test_code ?? "";
        config.visibleTests = [];
        config.hiddenTests = [];
      } else {
        config.visibleTests = (args.visible_tests ?? []).map((t) => ({
          id: t.id,
          stdin: t.stdin,
          expectedStdout: t.expected_stdout,
          label: t.label,
        }));
        config.hiddenTests = (args.hidden_tests ?? []).map((t) => ({
          id: t.id,
          stdin: t.stdin,
          expectedStdout: t.expected_stdout,
          label: t.label,
        }));
      }
      return text(
        await client.addQuestion(args.assessment_id, {
          type: "coding",
          title: args.title,
          prompt: args.prompt,
          timeLimitSeconds: args.time_limit_seconds,
          points: args.points ?? 40,
          config,
        }),
      );
    },
  );

  server.tool(
    "create_invite",
    "Create a candidate invite link for an assessment.",
    {
      assessment_id: z.string().uuid(),
      candidate_email: z.string().email().optional(),
      candidate_name: z.string().optional(),
    },
    async (args) =>
      text(
        await client.createInvite(args.assessment_id, {
          candidateEmail: args.candidate_email,
          candidateName: args.candidate_name,
        }),
      ),
  );

  server.tool(
    "list_sessions",
    "List candidate sessions (scores) for an assessment.",
    { assessment_id: z.string().uuid() },
    async ({ assessment_id }) =>
      text(await client.listSessions(assessment_id)),
  );

  server.tool(
    "get_session_results",
    "Get detailed results and activity events for one candidate session.",
    {
      assessment_id: z.string().uuid(),
      session_id: z.string().uuid(),
    },
    async ({ assessment_id, session_id }) =>
      text(await client.getSessionReview(assessment_id, session_id)),
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
