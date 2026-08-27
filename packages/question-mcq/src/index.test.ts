import { describe, expect, it } from "vitest";
import { gradeMcq, validateMcqConfig } from "./index.js";

describe("validateMcqConfig", () => {
  it("requires exactly one correct option for single-select", () => {
    expect(() =>
      validateMcqConfig({
        options: [
          { id: "a", label: "A" },
          { id: "b", label: "B" },
        ],
        correctOptionIds: ["a", "b"],
        multiSelect: false,
      }),
    ).toThrow(/exactly one correct/);
  });

  it("rejects unknown correct ids", () => {
    expect(() =>
      validateMcqConfig({
        options: [
          { id: "a", label: "A" },
          { id: "b", label: "B" },
        ],
        correctOptionIds: ["z"],
      }),
    ).toThrow(/unknown option id/);
  });
});

describe("gradeMcq", () => {
  const config = validateMcqConfig({
    options: [
      { id: "a", label: "A" },
      { id: "b", label: "B" },
    ],
    correctOptionIds: ["b"],
  });

  it("awards full points for exact match", async () => {
    const g = await gradeMcq({
      config,
      answer: { selected: ["b"] },
      points: 10,
    });
    expect(g.score).toBe(10);
  });

  it("scores 0 for wrong or partial answers", async () => {
    expect(
      (
        await gradeMcq({
          config,
          answer: { selected: ["a"] },
          points: 10,
        })
      ).score,
    ).toBe(0);
    expect(
      (await gradeMcq({ config, answer: null, points: 10 })).score,
    ).toBe(0);
  });
});
