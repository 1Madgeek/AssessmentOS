import { z } from "zod";
import type { GradeResult, QuestionPlugin } from "@assessment-os/core";
import { richDocSchema, richDocToPlainText, coerceRichDoc } from "@assessment-os/richtext";

export const mcqOptionLabelSchema = z.union([
  z.string().min(1),
  richDocSchema,
]);

export const mcqOptionSchema = z.object({
  id: z.string(),
  label: mcqOptionLabelSchema,
});

export const mcqConfigSchema = z.object({
  options: z.array(mcqOptionSchema).min(2),
  correctOptionIds: z.array(z.string()).min(1),
  multiSelect: z.boolean().default(false),
});
export type McqConfig = z.infer<typeof mcqConfigSchema>;

export const mcqAnswerSchema = z.object({
  selected: z.array(z.string()),
});
export type McqAnswer = z.infer<typeof mcqAnswerSchema>;

export function optionLabelPlain(label: McqConfig["options"][number]["label"]): string {
  if (typeof label === "string") return label;
  return richDocToPlainText(coerceRichDoc(label)) || "Option";
}

export function validateMcqConfig(input: unknown): McqConfig {
  const config = mcqConfigSchema.parse(input);
  const ids = new Set(config.options.map((o) => o.id));
  for (const id of config.correctOptionIds) {
    if (!ids.has(id)) {
      throw new Error(`correctOptionIds contains unknown option id: ${id}`);
    }
  }
  if (!config.multiSelect && config.correctOptionIds.length !== 1) {
    throw new Error("Single-select MCQ must have exactly one correct option");
  }
  return config;
}

export async function gradeMcq(args: {
  config: McqConfig;
  answer: McqAnswer | null;
  points: number;
}): Promise<GradeResult> {
  const selected = new Set(args.answer?.selected ?? []);
  const correct = new Set(args.config.correctOptionIds);
  const exact =
    selected.size === correct.size &&
    [...correct].every((id) => selected.has(id));
  return {
    score: exact ? args.points : 0,
    maxScore: args.points,
    details: {
      selected: [...selected],
      correct: [...correct],
      exact,
    },
  };
}

export const mcqPlugin: QuestionPlugin<McqConfig, McqAnswer> = {
  type: "mcq",
  validateConfig: validateMcqConfig,
  grade: async ({ config, answer, points }) =>
    gradeMcq({ config, answer, points }),
};
