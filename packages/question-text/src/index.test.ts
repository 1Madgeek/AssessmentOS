import { describe, expect, it } from "vitest";
import { gradeText, validateTextConfig } from "./index.js";

describe("validateTextConfig", () => {
  it("requires accepted answers for auto modes", () => {
    expect(() =>
      validateTextConfig({ gradingMode: "exact", acceptedAnswers: [] }),
    ).toThrow(/acceptedAnswers/);
  });

  it("allows manual without accepted answers", () => {
    const config = validateTextConfig({ gradingMode: "manual" });
    expect(config.gradingMode).toBe("manual");
  });
});

describe("gradeText", () => {
  it("exact match ignoring case/whitespace by default", async () => {
    const config = validateTextConfig({
      gradingMode: "exact",
      acceptedAnswers: ["HTTP"],
    });
    const ok = await gradeText({
      config,
      answer: { text: "  http  " },
      points: 10,
    });
    expect(ok.score).toBe(10);
    const bad = await gradeText({
      config,
      answer: { text: "https" },
      points: 10,
    });
    expect(bad.score).toBe(0);
  });

  it("contains_any / contains_all", async () => {
    const any = validateTextConfig({
      gradingMode: "contains_any",
      acceptedAnswers: ["redis", "memcached"],
    });
    expect(
      (
        await gradeText({
          config: any,
          answer: { text: "We use Redis for cache" },
          points: 5,
        })
      ).score,
    ).toBe(5);

    const all = validateTextConfig({
      gradingMode: "contains_all",
      acceptedAnswers: ["index", "query"],
    });
    expect(
      (
        await gradeText({
          config: all,
          answer: { text: "Add an index for the query" },
          points: 5,
        })
      ).score,
    ).toBe(5);
    expect(
      (
        await gradeText({
          config: all,
          answer: { text: "Add an index" },
          points: 5,
        })
      ).score,
    ).toBe(0);
  });

  it("manual always needs review", async () => {
    const config = validateTextConfig({ gradingMode: "manual" });
    const grade = await gradeText({
      config,
      answer: { text: "essay" },
      points: 20,
    });
    expect(grade.score).toBe(0);
    expect(grade.details).toMatchObject({ needsReview: true });
  });
});
