import { describe, expect, it } from "vitest";
import {
  normalizeStdout,
  parseJestJson,
  parsePytestOutput,
} from "./parse-results.js";

describe("normalizeStdout", () => {
  it("normalizes CRLF and trailing whitespace", () => {
    expect(normalizeStdout("a\r\nb\r\n")).toBe("a\nb");
    expect(normalizeStdout("hi  \n")).toBe("hi");
  });
});

describe("parsePytestOutput", () => {
  it("parses per-test PASSED/FAILED lines", () => {
    const out = parsePytestOutput(
      "test_solution.py::test_add PASSED\ntest_solution.py::test_neg FAILED\n",
      "",
      1,
    );
    expect(out).toEqual([
      {
        id: "test_add",
        passed: true,
        stdout: "",
        stderr: "",
        status: "Accepted",
      },
      {
        id: "test_neg",
        passed: false,
        stdout: "",
        stderr: expect.stringContaining("test_neg FAILED"),
        status: "FAILED",
      },
    ]);
  });

  it("falls back to summary counts", () => {
    const out = parsePytestOutput("===== 2 passed, 1 failed in 0.01s =====", "", 1);
    expect(out.filter((r) => r.passed)).toHaveLength(2);
    expect(out.filter((r) => !r.passed)).toHaveLength(1);
  });

  it("falls back to exit code when unparseable", () => {
    const fail = parsePytestOutput("boom", "traceback", 1);
    expect(fail).toEqual([
      {
        id: "pytest",
        passed: false,
        stdout: "boom",
        stderr: "traceback",
        status: "Wrong Answer",
      },
    ]);
    const ok = parsePytestOutput("", "", 0);
    expect(ok[0]?.passed).toBe(true);
  });
});

describe("parseJestJson", () => {
  it("maps assertionResults to pass/fail", () => {
    const out = parseJestJson(
      JSON.stringify({
        testResults: [
          {
            assertionResults: [
              { fullName: "adds", status: "passed" },
              {
                title: "fails",
                status: "failed",
                failureMessages: ["expected 1"],
              },
            ],
          },
        ],
      }),
    );
    expect(out).toEqual([
      {
        id: "adds",
        passed: true,
        stdout: "",
        stderr: "",
        status: "Accepted",
      },
      {
        id: "fails",
        passed: false,
        stdout: "",
        stderr: "expected 1",
        status: "Wrong Answer",
      },
    ]);
  });

  it("returns error when no assertions", () => {
    const out = parseJestJson(JSON.stringify({ testResults: [] }));
    expect(out[0]).toMatchObject({ id: "jest", passed: false, status: "Error" });
  });
});
