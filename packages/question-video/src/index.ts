import { z } from "zod";
import type { GradeResult, QuestionPlugin } from "@assessment-os/core";

export const videoConfigSchema = z.object({
  maxDurationSeconds: z.number().int().positive().max(600).default(120),
  maxBytes: z
    .number()
    .int()
    .positive()
    .max(200_000_000)
    .default(50_000_000),
  allowUpload: z.boolean().default(true),
});
export type VideoConfig = z.infer<typeof videoConfigSchema>;

export const videoAnswerSchema = z.object({
  assetId: z.string().min(1),
  contentType: z.string().min(1),
  filename: z.string().optional(),
  durationMs: z.number().int().nonnegative().optional(),
  byteSize: z.number().int().nonnegative().optional(),
});
export type VideoAnswer = z.infer<typeof videoAnswerSchema>;

export function validateVideoConfig(input: unknown): VideoConfig {
  return videoConfigSchema.parse(input ?? {});
}

export async function gradeVideo(args: {
  config: VideoConfig;
  answer: VideoAnswer | null;
  points: number;
}): Promise<GradeResult> {
  const assetId = args.answer?.assetId?.trim() ?? "";
  if (!assetId) {
    return {
      score: 0,
      maxScore: args.points,
      details: { mode: "manual", reason: "missing_recording" },
    };
  }
  return {
    score: 0,
    maxScore: args.points,
    details: {
      mode: "manual",
      needsReview: true,
      assetId,
      contentType: args.answer?.contentType,
      filename: args.answer?.filename,
      durationMs: args.answer?.durationMs,
      byteSize: args.answer?.byteSize,
    },
  };
}

export const videoPlugin: QuestionPlugin<VideoConfig, VideoAnswer> = {
  type: "video",
  validateConfig: validateVideoConfig,
  grade: async ({ config, answer, points }) =>
    gradeVideo({ config, answer, points }),
};
