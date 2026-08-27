import { describe, expect, it } from "vitest";
import {
  defaultEntryFile,
  defaultFramework,
  gradeCoding,
  validateCodingConfig,
  type CodingConfig,
} from "./index.js";

describe("defaultFramework / defaultEntryFile", () => {
  it("maps languages to frameworks", () => {
    expect(defaultFramework("python")).toBe("pytest");
    expect(defaultFramework("javascript")).toBe("jest");
    expect(defaultFramework("typescript")).toBe("jest");
    expect(defaultFramework("java")).toBeUndefined();
    expect(defaultFramework("cpp")).toBeUndefined();
  });

  it("maps languages to entry files", () => {
    expect(defaultEntryFile("python")).toBe("solution.py");
    expect(defaultEntryFile("javascript")).toBe("solution.js");
    expect(defaultEntryFile("typescript")).toBe("solution.ts");
  });
});

describe("validateCodingConfig", () => {
  it("defaults mode to io and accepts I/O cases", () => {
    const config = validateCodingConfig({
      language: "python",
      starterCode: "print(1)",
      visibleTests: [
        { id: "v1", stdin: "1\n", expectedStdout: "1\n" },
      ],
      hiddenTests: [],
    });
    expect(config.mode).toBe("io");
    expect(config.visibleTests).toHaveLength(1);
  });

  it("fills framework and entryFile for unit mode", () => {
    const config = validateCodingConfig({
      language: "python",
      mode: "unit",
      starterCode: "def add(a,b): return a+b",
      visibleTestCode: "def test_ok(): assert True",
      hiddenTestCode: "",
    });
    expect(config.framework).toBe("pytest");
    expect(config.entryFile).toBe("solution.py");
  });

  it("rejects unit mode for java/cpp", () => {
    expect(() =>
      validateCodingConfig({
        language: "java",
        mode: "unit",
        visibleTestCode: "x",
      }),
    ).toThrow(/Unit-test mode is only supported/);
  });

  it("rejects unit mode with empty visible and hidden test code", () => {
    expect(() =>
      validateCodingConfig({
        language: "python",
        mode: "unit",
        visibleTestCode: "  ",
        hiddenTestCode: "",
      }),
    ).toThrow(/requires visibleTestCode and\/or hiddenTestCode/);
  });

  it("accepts jest unit mode for javascript", () => {
    const config = validateCodingConfig({
      language: "javascript",
      mode: "unit",
      hiddenTestCode: "test('x', () => expect(1).toBe(1));",
    });
    expect(config.framework).toBe("jest");
    expect(config.entryFile).toBe("solution.js");
  });
});

describe("gradeCoding", () => {
  const unitConfig = validateCodingConfig({
    language: "python",
    mode: "unit",
    starterCode: "",
    visibleTestCode: "def test_v(): assert True",
    hiddenTestCode: "def test_h(): assert True",
  }) as CodingConfig;

  const ioConfig = validateCodingConfig({
    language: "python",
    mode: "io",
    starterCode: "",
    visibleTests: [],
    hiddenTests: [
      { id: "h1", stdin: "", expectedStdout: "1" },
      { id: "h2", stdin: "", expectedStdout: "2" },
    ],
  }) as CodingConfig;

  it("scores proportionally from hidden results in unit mode", async () => {
    const grade = await gradeCoding({
      config: unitConfig,
      answer: { source: "ok" },
      points: 40,
      hiddenResults: [
        { id: "a", passed: true },
        { id: "b", passed: false },
      ],
    });
    expect(grade.score).toBe(20);
    expect(grade.maxScore).toBe(40);
    expect(grade.details).toMatchObject({ passed: 1, total: 2, gradingMode: "unit" });
  });

  it("scores all-or-nothing proportionally for I/O hidden tests", async () => {
    const grade = await gradeCoding({
      config: ioConfig,
      answer: { source: "ok" },
      points: 10,
      hiddenResults: [
        { id: "h1", passed: true },
        { id: "h2", passed: true },
      ],
    });
    expect(grade.score).toBe(10);
  });

  it("returns pending_runner when hidden suite exists but no results", async () => {
    const grade = await gradeCoding({
      config: unitConfig,
      answer: { source: "ok" },
      points: 40,
    });
    expect(grade.score).toBe(0);
    expect(grade.details).toMatchObject({ mode: "pending_runner" });
  });

  it("awards full points when no hidden suite and source present", async () => {
    const noHidden = validateCodingConfig({
      language: "python",
      mode: "unit",
      visibleTestCode: "def test_v(): assert True",
      hiddenTestCode: "",
    });
    const grade = await gradeCoding({
      config: noHidden,
      answer: { source: "def add(): pass" },
      points: 15,
    });
    expect(grade.score).toBe(15);
    expect(grade.details).toMatchObject({ mode: "no_hidden_tests" });
  });

  it("scores 0 when no hidden suite and empty source", async () => {
    const noHidden = validateCodingConfig({
      language: "javascript",
      mode: "io",
      visibleTests: [],
      hiddenTests: [],
    });
    const grade = await gradeCoding({
      config: noHidden,
      answer: { source: "  " },
      points: 15,
    });
    expect(grade.score).toBe(0);
  });
});
