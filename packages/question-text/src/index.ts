import { z } from "zod";
import type { GradeResult, QuestionPlugin } from "@assessment-os/core";

export const textConfigSchema = z.object({
  gradingMode: z
    .enum(["exact", "contains_any", "contains_all", "manual"])
    .default("exact"),
  acceptedAnswers: z.array(z.string()).default([]),
  caseSensitive: z.boolean().default(false),
  normalizeWhitespace: z.boolean().default(true),
  maxLength: z.number().int().positive().optional(),
});
export type TextConfig = z.infer<typeof textConfigSchema>;

export const textAnswerSchema = z.object({
  text: z.string(),
});
export type TextAnswer = z.infer<typeof textAnswerSchema>;

function normalizeText(
  value: string,
  config: Pick<TextConfig, "caseSensitive" | "normalizeWhitespace">,
): string {
  let next = value;
  if (config.normalizeWhitespace) {
    next = next.trim().replace(/\s+/g, " ");
  }
  if (!config.caseSensitive) {
    next = next.toLowerCase();
  }
  return next;
}

export function validateTextConfig(input: unknown): TextConfig {
  const config = textConfigSchema.parse(input);
  if (config.gradingMode !== "manual" && config.acceptedAnswers.length === 0) {
    throw new Error(
      "acceptedAnswers is required unless gradingMode is manual",
    );
  }
  return config;
}

export async function gradeText(args: {
  config: TextConfig;
  answer: TextAnswer | null;
  points: number;
}): Promise<GradeResult> {
  const raw = args.answer?.text ?? "";
  if (args.config.maxLength != null && raw.length > args.config.maxLength) {
    return {
      score: 0,
      maxScore: args.points,
      details: { mode: args.config.gradingMode, reason: "max_length_exceeded" },
    };
  }

  if (args.config.gradingMode === "manual") {
    return {
      score: 0,
      maxScore: args.points,
      details: { mode: "manual", needsReview: true, text: raw },
    };
  }

  const candidate = normalizeText(raw, args.config);
  const accepted = args.config.acceptedAnswers.map((a) =>
    normalizeText(a, args.config),
  );

  let passed = false;
  if (args.config.gradingMode === "exact") {
    passed = accepted.includes(candidate);
  } else if (args.config.gradingMode === "contains_any") {
    passed = accepted.some((a) => a.length > 0 && candidate.includes(a));
  } else if (args.config.gradingMode === "contains_all") {
    passed =
      accepted.length > 0 &&
      accepted.every((a) => a.length > 0 && candidate.includes(a));
  }

  return {
    score: passed ? args.points : 0,
    maxScore: args.points,
    details: {
      mode: args.config.gradingMode,
      passed,
      text: raw,
    },
  };
}

export const textPlugin: QuestionPlugin<TextConfig, TextAnswer> = {
  type: "text",
  validateConfig: validateTextConfig,
  grade: async ({ config, answer, points }) =>
    gradeText({ config, answer, points }),
};
