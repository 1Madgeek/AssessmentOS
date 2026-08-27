#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  createClient,
  type Assessment,
  type AssessmentQuestion,
} from "@assessment-os/sdk";
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

function latestQuestion(assessment: Assessment): AssessmentQuestion | undefined {
  const qs = assessment.questions ?? [];
  if (!qs.length) return undefined;
  return qs.slice().sort((a, b) => b.order - a.order)[0];
}

const starterFileSchema = z.object({
  path: z.string().min(1),
  content: z.string(),
});

type CodingArgs = {
  language:
    | "python"
    | "javascript"
    | "typescript"
    | "java"
    | "cpp"
    | "php";
  mode?: "unit" | "io";
  starter_code?: string;
  entry_file?: string;
  framework?: "pytest" | "jest" | "phpunit" | "junit" | "googletest";
  visible_test_code?: string;
  hidden_test_code?: string;
  visible_tests?: Array<{
    id: string;
    stdin: string;
    expected_stdout: string;
    label?: string;
  }>;
  hidden_tests?: Array<{
    id: string;
    stdin: string;
    expected_stdout: string;
    label?: string;
  }>;
  starter_files?: Array<{ path: string; content: string }>;
  time_limit_ms?: number;
  memory_mb?: number;
  scoring?: "proportional" | "all_or_nothing";
  checker_code?: string;
};

function buildCodingConfig(args: CodingArgs): Record<string, unknown> {
  const mode = args.mode ?? "unit";
  const config: Record<string, unknown> = {
    language: args.language,
    mode,
    starterCode: args.starter_code ?? "",
  };
  if (args.starter_files?.length) {
    config.starterFiles = args.starter_files;
  }
  if (args.time_limit_ms != null) config.timeLimitMs = args.time_limit_ms;
  if (args.memory_mb != null) config.memoryMb = args.memory_mb;
  if (args.scoring) config.scoring = args.scoring;
  if (args.checker_code?.trim()) config.checkerCode = args.checker_code;

  if (mode === "unit") {
    config.framework =
      args.framework ??
      (args.language === "python"
        ? "pytest"
        : args.language === "javascript" || args.language === "typescript"
          ? "jest"
          : args.language === "php"
            ? "phpunit"
            : args.language === "java"
              ? "junit"
              : args.language === "cpp"
                ? "googletest"
                : undefined);
    config.entryFile =
      args.entry_file ??
      (args.language === "python"
        ? "solution.py"
        : args.language === "typescript"
          ? "solution.ts"
          : args.language === "php"
            ? "solution.php"
            : args.language === "java"
              ? "Solution.java"
              : args.language === "cpp"
                ? "solution.cpp"
                : "solution.js");
    config.visibleTestCode = args.visible_test_code ?? "";
    config.hiddenTestCode = args.hidden_test_code ?? "";
    config.visibleTests = [];
    config.hiddenTests = [];
  } else {
    if (args.entry_file) config.entryFile = args.entry_file;
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
  return config;
}

const codingFields = {
  language: z.enum([
    "python",
    "javascript",
    "typescript",
    "java",
    "cpp",
    "php",
  ]),
  mode: z.enum(["unit", "io"]).default("unit"),
  starter_code: z.string().default(""),
  entry_file: z.string().optional(),
  framework: z
    .enum(["pytest", "jest", "phpunit", "junit", "googletest"])
    .optional(),
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
  starter_files: z.array(starterFileSchema).optional(),
  time_limit_ms: z.number().int().positive().optional(),
  memory_mb: z.number().int().positive().optional(),
  scoring: z.enum(["proportional", "all_or_nothing"]).optional(),
  checker_code: z.string().optional(),
};

async function main() {
  const apiUrl = env("ASSESSMENTOS_API_URL").replace(/\/$/, "");
  const apiToken = env("ASSESSMENTOS_API_TOKEN");

  let organizationId = process.env.ASSESSMENTOS_ORG_ID?.trim() || undefined;
  const bootstrap = createClient(apiUrl, { apiToken });
  if (!organizationId) {
    const orgs = await bootstrap.listOrgs();
    if (orgs.length === 1) {
      organizationId = orgs[0]!.id;
    } else if (orgs.length === 0) {
      throw new Error(
        "No organization memberships for this token. Create an org or set ASSESSMENTOS_ORG_ID.",
      );
    } else {
      throw new Error(
        `Multiple organizations found (${orgs.map((o) => `${o.slug}:${o.id}`).join(", ")}). Set ASSESSMENTOS_ORG_ID.`,
      );
    }
  }

  const client = createClient(apiUrl, { apiToken, organizationId });

  const server = new McpServer({
    name: "assessmentos",
    version: "0.1.0",
  });

  async function addThenMaybeSection(
    assessmentId: string,
    sectionId: string | undefined,
    add: () => Promise<Assessment>,
  ): Promise<Assessment> {
    let assessment = await add();
    if (!sectionId) return assessment;
    const q = latestQuestion(assessment);
    if (!q) return assessment;
    assessment = await client.setQuestionSection(
      assessmentId,
      q.question.id,
      sectionId,
    );
    return assessment;
  }

  server.tool(
    "list_assessments",
    "List assessments owned by the authenticated recruiter.",
    {},
    async () => text(await client.listAssessments()),
  );

  server.tool(
    "get_assessment",
    "Get one assessment including its questions, sections, and pools.",
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
      randomize_question_order: z.boolean().optional(),
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
            randomizeQuestionOrder: args.randomize_question_order,
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
      randomize_question_order: z.boolean().optional(),
    },
    async (args) => {
      const rulesDefined =
        args.allow_skip !== undefined ||
        args.allow_return !== undefined ||
        args.per_question_timers !== undefined ||
        args.linear_lock !== undefined ||
        args.randomize_question_order !== undefined;
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
                  randomizeQuestionOrder:
                    args.randomize_question_order ?? false,
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
      section_id: z.string().uuid().optional(),
    },
    async (args) =>
      text(
        await addThenMaybeSection(args.assessment_id, args.section_id, () =>
          client.addQuestion(args.assessment_id, {
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
      ),
  );

  server.tool(
    "add_coding_question",
    "Add a coding question (unit-test or stdin/stdout mode). Prefer mode=unit with visible_test_code + hidden_test_code for Python/JS/TS/PHP/Java/C++. Supports starter_files, time_limit_ms, memory_mb, scoring, checker_code.",
    {
      assessment_id: z.string().uuid(),
      title: z.string().min(1),
      prompt: z.string().min(1),
      time_limit_seconds: z.number().int().positive(),
      points: z.number().int().positive().optional(),
      section_id: z.string().uuid().optional(),
      ...codingFields,
    },
    async (args) =>
      text(
        await addThenMaybeSection(args.assessment_id, args.section_id, () =>
          client.addQuestion(args.assessment_id, {
            type: "coding",
            title: args.title,
            prompt: args.prompt,
            timeLimitSeconds: args.time_limit_seconds,
            points: args.points ?? 40,
            config: buildCodingConfig(args),
          }),
        ),
      ),
  );

  server.tool(
    "add_sql_question",
    "Add a SQLite SQL question with schema/seed and expected result-row checks.",
    {
      assessment_id: z.string().uuid(),
      title: z.string().min(1),
      prompt: z.string().min(1),
      time_limit_seconds: z.number().int().positive(),
      points: z.number().int().positive().optional(),
      schema_sql: z.string().min(1),
      seed_sql: z.string().default(""),
      starter_query: z.string().optional(),
      visible_tests: z
        .array(
          z.object({
            id: z.string(),
            label: z.string().optional(),
            expected_rows: z.array(z.record(z.unknown())),
          }),
        )
        .default([]),
      hidden_tests: z
        .array(
          z.object({
            id: z.string(),
            label: z.string().optional(),
            expected_rows: z.array(z.record(z.unknown())),
          }),
        )
        .default([]),
      section_id: z.string().uuid().optional(),
    },
    async (args) =>
      text(
        await addThenMaybeSection(args.assessment_id, args.section_id, () =>
          client.addQuestion(args.assessment_id, {
            type: "sql",
            title: args.title,
            prompt: args.prompt,
            timeLimitSeconds: args.time_limit_seconds,
            points: args.points ?? 25,
            config: {
              dialect: "sqlite",
              schemaSql: args.schema_sql,
              seedSql: args.seed_sql,
              starterQuery: args.starter_query ?? "SELECT ",
              visibleTests: args.visible_tests.map((t) => ({
                id: t.id,
                label: t.label,
                expectedRows: t.expected_rows,
              })),
              hiddenTests: args.hidden_tests.map((t) => ({
                id: t.id,
                label: t.label,
                expectedRows: t.expected_rows,
              })),
            },
          }),
        ),
      ),
  );

  server.tool(
    "add_text_question",
    "Add a short-answer/text question with exact/contains/manual grading.",
    {
      assessment_id: z.string().uuid(),
      title: z.string().min(1),
      prompt: z.string().min(1),
      time_limit_seconds: z.number().int().positive(),
      points: z.number().int().positive().optional(),
      grading_mode: z
        .enum(["exact", "contains_any", "contains_all", "manual"])
        .default("exact"),
      accepted_answers: z.array(z.string()).default([]),
      case_sensitive: z.boolean().optional(),
      normalize_whitespace: z.boolean().optional(),
      max_length: z.number().int().positive().optional(),
      section_id: z.string().uuid().optional(),
    },
    async (args) =>
      text(
        await addThenMaybeSection(args.assessment_id, args.section_id, () =>
          client.addQuestion(args.assessment_id, {
            type: "text",
            title: args.title,
            prompt: args.prompt,
            timeLimitSeconds: args.time_limit_seconds,
            points: args.points ?? 10,
            config: {
              gradingMode: args.grading_mode,
              acceptedAnswers: args.accepted_answers,
              caseSensitive: args.case_sensitive ?? false,
              normalizeWhitespace: args.normalize_whitespace ?? true,
              maxLength: args.max_length,
            },
          }),
        ),
      ),
  );

  server.tool(
    "update_question",
    "Patch an assessment question (title, prompt, points, time, and/or config). Pass config matching the question type shape used by add_* tools.",
    {
      assessment_id: z.string().uuid(),
      question_id: z.string().uuid(),
      title: z.string().min(1).optional(),
      prompt: z.string().optional(),
      time_limit_seconds: z.number().int().positive().optional(),
      points: z.number().int().positive().optional(),
      config: z.record(z.unknown()).optional(),
    },
    async (args) =>
      text(
        await client.updateQuestion(args.assessment_id, args.question_id, {
          title: args.title,
          prompt: args.prompt,
          timeLimitSeconds: args.time_limit_seconds,
          points: args.points,
          config: args.config,
        }),
      ),
  );

  server.tool(
    "delete_question",
    "Remove a question from an assessment.",
    {
      assessment_id: z.string().uuid(),
      question_id: z.string().uuid(),
    },
    async (args) =>
      text(
        await client.deleteQuestion(args.assessment_id, args.question_id),
      ),
  );

  server.tool(
    "reorder_questions",
    "Set question order by question UUID array (first = order 0).",
    {
      assessment_id: z.string().uuid(),
      question_ids: z.array(z.string().uuid()).min(1),
    },
    async (args) =>
      text(
        await client.reorderQuestions(args.assessment_id, args.question_ids),
      ),
  );

  server.tool(
    "list_bank_items",
    "List recruiter question bank items.",
    {},
    async () => text(await client.listBankQuestions()),
  );

  server.tool(
    "create_bank_item",
    "Create a bank item. Pass type + config using the same config shapes as add_mcq/add_coding/add_sql/add_text (API validates).",
    {
      type: z.enum(["mcq", "coding", "sql", "text"]),
      title: z.string().min(1),
      prompt: z.string().optional(),
      time_limit_seconds: z.number().int().positive(),
      points: z.number().int().positive().optional(),
      config: z.record(z.unknown()),
      tags: z.array(z.string()).optional(),
    },
    async (args) =>
      text(
        await client.createBankQuestion({
          type: args.type,
          title: args.title,
          prompt: args.prompt,
          timeLimitSeconds: args.time_limit_seconds,
          points: args.points,
          config: args.config,
          tags: args.tags,
        }),
      ),
  );

  server.tool(
    "update_bank_item",
    "Update a bank item. Config should match the question type shape.",
    {
      bank_question_id: z.string().uuid(),
      title: z.string().min(1).optional(),
      prompt: z.string().optional(),
      time_limit_seconds: z.number().int().positive().optional(),
      points: z.number().int().positive().optional(),
      config: z.record(z.unknown()).optional(),
      tags: z.array(z.string()).optional(),
    },
    async (args) =>
      text(
        await client.updateBankQuestion(args.bank_question_id, {
          title: args.title,
          prompt: args.prompt,
          timeLimitSeconds: args.time_limit_seconds,
          points: args.points,
          config: args.config,
          tags: args.tags,
        }),
      ),
  );

  server.tool(
    "delete_bank_item",
    "Delete a bank item.",
    { bank_question_id: z.string().uuid() },
    async ({ bank_question_id }) =>
      text(await client.deleteBankQuestion(bank_question_id)),
  );

  server.tool(
    "add_question_from_bank",
    "Clone a bank item into an assessment (snapshot at add-time).",
    {
      assessment_id: z.string().uuid(),
      bank_question_id: z.string().uuid(),
      section_id: z.string().uuid().optional(),
    },
    async (args) =>
      text(
        await client.addQuestionFromBank(args.assessment_id, {
          bankQuestionId: args.bank_question_id,
          sectionId: args.section_id,
        }),
      ),
  );

  server.tool(
    "create_section",
    "Create an assessment section (optional section timer).",
    {
      assessment_id: z.string().uuid(),
      title: z.string().min(1),
      time_limit_seconds: z.number().int().positive().nullable().optional(),
    },
    async (args) =>
      text(
        await client.createSection(args.assessment_id, {
          title: args.title,
          timeLimitSeconds: args.time_limit_seconds,
        }),
      ),
  );

  server.tool(
    "update_section",
    "Update a section title, timer, or order.",
    {
      assessment_id: z.string().uuid(),
      section_id: z.string().uuid(),
      title: z.string().min(1).optional(),
      time_limit_seconds: z.number().int().positive().nullable().optional(),
      order: z.number().int().nonnegative().optional(),
    },
    async (args) =>
      text(
        await client.updateSection(args.assessment_id, args.section_id, {
          title: args.title,
          timeLimitSeconds: args.time_limit_seconds,
          order: args.order,
        }),
      ),
  );

  server.tool(
    "delete_section",
    "Delete a section (questions become unsectioned).",
    {
      assessment_id: z.string().uuid(),
      section_id: z.string().uuid(),
    },
    async (args) =>
      text(
        await client.deleteSection(args.assessment_id, args.section_id),
      ),
  );

  server.tool(
    "set_question_section",
    "Assign a question to a section, or pass section_id null to clear.",
    {
      assessment_id: z.string().uuid(),
      question_id: z.string().uuid(),
      section_id: z.string().uuid().nullable(),
    },
    async (args) =>
      text(
        await client.setQuestionSection(
          args.assessment_id,
          args.question_id,
          args.section_id,
        ),
      ),
  );

  server.tool(
    "create_pool",
    "Create a question pool (random draw of draw_count members on session start).",
    {
      assessment_id: z.string().uuid(),
      name: z.string().min(1),
      draw_count: z.number().int().positive(),
    },
    async (args) =>
      text(
        await client.createPool(args.assessment_id, {
          name: args.name,
          drawCount: args.draw_count,
        }),
      ),
  );

  server.tool(
    "update_pool",
    "Update a pool name, draw_count, or order.",
    {
      assessment_id: z.string().uuid(),
      pool_id: z.string().uuid(),
      name: z.string().min(1).optional(),
      draw_count: z.number().int().positive().optional(),
      order: z.number().int().nonnegative().optional(),
    },
    async (args) =>
      text(
        await client.updatePool(args.assessment_id, args.pool_id, {
          name: args.name,
          drawCount: args.draw_count,
          order: args.order,
        }),
      ),
  );

  server.tool(
    "delete_pool",
    "Delete a question pool.",
    {
      assessment_id: z.string().uuid(),
      pool_id: z.string().uuid(),
    },
    async (args) =>
      text(await client.deletePool(args.assessment_id, args.pool_id)),
  );

  server.tool(
    "add_pool_member",
    "Add a bank item or assessment question to a pool (provide exactly one of bank_question_id or question_id).",
    {
      assessment_id: z.string().uuid(),
      pool_id: z.string().uuid(),
      bank_question_id: z.string().uuid().optional(),
      question_id: z.string().uuid().optional(),
    },
    async (args) =>
      text(
        await client.addPoolMember(args.assessment_id, args.pool_id, {
          bankQuestionId: args.bank_question_id,
          questionId: args.question_id,
        }),
      ),
  );

  server.tool(
    "remove_pool_member",
    "Remove a member from a pool.",
    {
      assessment_id: z.string().uuid(),
      pool_id: z.string().uuid(),
      member_id: z.string().uuid(),
    },
    async (args) =>
      text(
        await client.removePoolMember(
          args.assessment_id,
          args.pool_id,
          args.member_id,
        ),
      ),
  );

  server.tool(
    "preview_pools",
    "Preview one random draw from assessment pools (does not persist).",
    { assessment_id: z.string().uuid() },
    async ({ assessment_id }) =>
      text(await client.previewPools(assessment_id)),
  );

  server.tool(
    "create_invite",
    "Create a candidate invite. Default mode is single-use; set mode=multi with max_uses for open links.",
    {
      assessment_id: z.string().uuid(),
      candidate_email: z.string().email().optional(),
      candidate_name: z.string().optional(),
      expires_in_days: z.number().int().positive().max(365).optional(),
      send_email: z.boolean().optional(),
      mode: z.enum(["single", "multi"]).optional(),
      max_uses: z.number().int().positive().max(10_000).optional(),
    },
    async (args) =>
      text(
        await client.createInvite(args.assessment_id, {
          candidateEmail: args.candidate_email,
          candidateName: args.candidate_name,
          expiresInDays: args.expires_in_days,
          sendEmail: args.send_email,
          mode: args.mode,
          maxUses: args.max_uses,
        }),
      ),
  );

  server.tool(
    "list_invites",
    "List invites for an assessment.",
    { assessment_id: z.string().uuid() },
    async ({ assessment_id }) =>
      text(await client.listInvites(assessment_id)),
  );

  server.tool(
    "revoke_invite",
    "Revoke a pending invite.",
    {
      assessment_id: z.string().uuid(),
      invite_id: z.string().uuid(),
    },
    async (args) =>
      text(await client.revokeInvite(args.assessment_id, args.invite_id)),
  );

  server.tool(
    "resend_invite",
    "Resend the invite email for a pending invite that has a candidate email.",
    {
      assessment_id: z.string().uuid(),
      invite_id: z.string().uuid(),
    },
    async (args) =>
      text(await client.resendInvite(args.assessment_id, args.invite_id)),
  );

  server.tool(
    "list_sessions",
    "List candidate sessions (scores) for an assessment. Pass collapse=best to group by email.",
    {
      assessment_id: z.string().uuid(),
      collapse: z.enum(["best"]).optional(),
    },
    async ({ assessment_id, collapse }) =>
      text(await client.listSessions(assessment_id, { collapse })),
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

  server.tool(
    "list_orgs",
    "List organizations the authenticated recruiter belongs to.",
    {},
    async () => text(await client.listOrgs()),
  );

  server.tool(
    "create_org",
    "Create a new organization (caller becomes owner).",
    {
      name: z.string().min(1),
      slug: z.string().min(2).optional(),
    },
    async (args) =>
      text(await client.createOrg({ name: args.name, slug: args.slug })),
  );

  server.tool(
    "list_org_members",
    "List members of an organization.",
    { organization_id: z.string().uuid() },
    async ({ organization_id }) =>
      text(await client.listOrgMembers(organization_id)),
  );

  server.tool(
    "invite_org_member",
    "Invite a member to an organization (owner).",
    {
      organization_id: z.string().uuid(),
      email: z.string().email(),
      role: z.enum(["owner", "author", "reviewer"]).optional(),
      expires_in_days: z.number().int().positive().optional(),
    },
    async (args) =>
      text(
        await client.inviteOrgMember(args.organization_id, {
          email: args.email,
          role: args.role,
          expiresInDays: args.expires_in_days,
        }),
      ),
  );

  server.tool(
    "update_org_member",
    "Update a member's role (owner).",
    {
      organization_id: z.string().uuid(),
      recruiter_id: z.string().uuid(),
      role: z.enum(["owner", "author", "reviewer"]),
    },
    async (args) =>
      text(
        await client.updateOrgMember(args.organization_id, args.recruiter_id, {
          role: args.role,
        }),
      ),
  );

  server.tool(
    "remove_org_member",
    "Remove a member from an organization (owner).",
    {
      organization_id: z.string().uuid(),
      recruiter_id: z.string().uuid(),
    },
    async (args) => {
      await client.removeOrgMember(args.organization_id, args.recruiter_id);
      return text({ ok: true });
    },
  );

  server.tool(
    "list_audit_events",
    "List recent audit events for an organization (owner).",
    {
      organization_id: z.string().uuid(),
      cursor: z.string().optional(),
      limit: z.number().int().positive().max(100).optional(),
    },
    async (args) =>
      text(
        await client.listAuditEvents(args.organization_id, {
          cursor: args.cursor,
          limit: args.limit,
        }),
      ),
  );

  server.tool(
    "list_webhooks",
    "List webhooks for an organization (owner).",
    { organization_id: z.string().uuid() },
    async ({ organization_id }) =>
      text(await client.listWebhooks(organization_id)),
  );

  server.tool(
    "create_webhook",
    "Create a webhook (owner). Returns secret once.",
    {
      organization_id: z.string().uuid(),
      url: z.string().url(),
      events: z.array(z.string()).optional(),
    },
    async (args) =>
      text(
        await client.createWebhook(args.organization_id, {
          url: args.url,
          events: args.events,
        }),
      ),
  );

  server.tool(
    "delete_webhook",
    "Delete a webhook (owner).",
    {
      organization_id: z.string().uuid(),
      webhook_id: z.string().uuid(),
    },
    async (args) => {
      await client.deleteWebhook(args.organization_id, args.webhook_id);
      return text({ ok: true });
    },
  );

  server.tool(
    "export_session_csv",
    "Download a single session as CSV text.",
    {
      assessment_id: z.string().uuid(),
      session_id: z.string().uuid(),
    },
    async (args) => {
      const blob = await client.exportSessionCsv(
        args.assessment_id,
        args.session_id,
      );
      return text(await blob.text());
    },
  );

  server.tool(
    "export_assessment_results_csv",
    "Download assessment results CSV (optional collapse=best).",
    {
      assessment_id: z.string().uuid(),
      collapse: z.enum(["best"]).optional(),
    },
    async (args) => {
      const blob = await client.exportAssessmentResultsCsv(args.assessment_id, {
        collapse: args.collapse,
      });
      return text(await blob.text());
    },
  );

  server.tool(
    "bulk_create_invites",
    "Bulk-create single-use invites from email/name rows.",
    {
      assessment_id: z.string().uuid(),
      rows: z
        .array(
          z.object({
            email: z.string().email(),
            name: z.string().optional(),
          }),
        )
        .min(1),
      expires_in_days: z.number().int().positive().optional(),
      send_email: z.boolean().optional(),
    },
    async (args) =>
      text(
        await client.bulkCreateInvites(args.assessment_id, {
          rows: args.rows,
          expiresInDays: args.expires_in_days,
          sendEmail: args.send_email,
        }),
      ),
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
