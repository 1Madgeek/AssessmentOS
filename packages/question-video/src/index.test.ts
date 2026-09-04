import { describe, expect, it } from "vitest";
import { gradeVideo, validateVideoConfig } from "./index.js";

describe("validateVideoConfig", () => {
  it("applies defaults", () => {
    const config = validateVideoConfig({});
    expect(config.maxDurationSeconds).toBe(120);
    expect(config.maxBytes).toBe(50_000_000);
    expect(config.allowUpload).toBe(true);
  });

  it("rejects duration over 600s", () => {
    expect(() => validateVideoConfig({ maxDurationSeconds: 601 })).toThrow();
  });
});

describe("gradeVideo", () => {
  it("scores 0 without a recording", async () => {
    const config = validateVideoConfig({});
    const grade = await gradeVideo({
      config,
      answer: null,
      points: 10,
    });
    expect(grade.score).toBe(0);
    expect(grade.maxScore).toBe(10);
    expect(grade.details).toMatchObject({ reason: "missing_recording" });
  });

  it("flags needsReview when asset is present", async () => {
    const config = validateVideoConfig({});
    const grade = await gradeVideo({
      config,
      answer: {
        assetId: "asset-1",
        contentType: "video/webm",
        filename: "answer.webm",
        byteSize: 1234,
      },
      points: 20,
    });
    expect(grade.score).toBe(0);
    expect(grade.details).toMatchObject({
      mode: "manual",
      needsReview: true,
      assetId: "asset-1",
    });
  });
});
