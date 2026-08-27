import type { RunTestResult } from "./types.js";

/** Normalize stdout for I/O comparisons (CRLF + trailing whitespace). */
export function normalizeStdout(s: string): string {
  return s.replace(/\r\n/g, "\n").replace(/\s+$/g, "");
}

export function parsePytestOutput(
  stdout: string,
  stderr: string,
  exitCode: number | null,
): RunTestResult[] {
  const combined = `${stdout}\n${stderr}`;
  // Lines like: test_solution.py::test_add_positive PASSED
  const lineRe =
    /([\w./-]+)::([\w\[\].-]+)\s+(PASSED|FAILED|ERROR|SKIPPED)/g;
  const results: RunTestResult[] = [];
  let m: RegExpExecArray | null;
  while ((m = lineRe.exec(combined))) {
    const name = m[2]!;
    const status = m[3]!;
    results.push({
      id: name,
      passed: status === "PASSED",
      stdout: "",
      stderr: status === "PASSED" ? "" : combined.slice(0, 400),
      status: status === "PASSED" ? "Accepted" : status,
    });
  }
  if (results.length === 0) {
    // Fallback summary: "2 passed" / "1 failed, 1 passed"
    const failed = /(\d+)\s+failed/.exec(combined);
    const passed = /(\d+)\s+passed/.exec(combined);
    if (failed || passed) {
      const failN = failed ? Number(failed[1]) : 0;
      const passN = passed ? Number(passed[1]) : 0;
      for (let i = 0; i < passN; i++) {
        results.push({
          id: `passed_${i + 1}`,
          passed: true,
          stdout: "",
          stderr: "",
          status: "Accepted",
        });
      }
      for (let i = 0; i < failN; i++) {
        results.push({
          id: `failed_${i + 1}`,
          passed: false,
          stdout: "",
          stderr: combined.slice(0, 400),
          status: "Wrong Answer",
        });
      }
    }
  }
  if (results.length === 0) {
    results.push({
      id: "pytest",
      passed: exitCode === 0,
      stdout,
      stderr,
      status: exitCode === 0 ? "Accepted" : "Wrong Answer",
    });
  }
  return results;
}

/** Parse PHPUnit --log-junit XML into per-testcase results. */
export function parsePhpunitJunit(xml: string): RunTestResult[] {
  const results: RunTestResult[] = [];
  // Self-closing first so `<testcase …/>` is not swallowed by the next `</testcase>`.
  const caseRe =
    /<testcase\b([^>]*?)\/>|<testcase\b([^>]*)>([\s\S]*?)<\/testcase>/g;
  let m: RegExpExecArray | null;
  while ((m = caseRe.exec(xml))) {
    const attrs = m[1] ?? m[2] ?? "";
    const body = m[3] ?? "";
    const nameMatch = /\bname="([^"]*)"/.exec(attrs);
    const classMatch = /\bclassname="([^"]*)"/.exec(attrs);
    const id =
      [classMatch?.[1], nameMatch?.[1]].filter(Boolean).join("::") || "test";
    const failed = /<(failure|error)\b/i.test(body);
    const skipped = /<skipped\b/i.test(body);
    const msgMatch = /<(?:failure|error)\b[^>]*>([\s\S]*?)<\//i.exec(body);
    results.push({
      id,
      passed: !failed && !skipped,
      stdout: "",
      stderr: failed
        ? (msgMatch?.[1] ?? "failed")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&amp;/g, "&")
            .slice(0, 400)
        : "",
      status: failed ? "Wrong Answer" : skipped ? "Skipped" : "Accepted",
    });
  }
  if (results.length === 0) {
    results.push({
      id: "phpunit",
      passed: false,
      stdout: "",
      stderr: "No PHPUnit testcases found in JUnit XML",
      status: "Error",
    });
  }
  return results;
}

export function parseJestJson(raw: string): RunTestResult[] {
  const data = JSON.parse(raw) as {
    testResults?: Array<{
      assertionResults?: Array<{
        fullName?: string;
        title?: string;
        status?: string;
        failureMessages?: string[];
      }>;
    }>;
  };
  const results: RunTestResult[] = [];
  for (const suite of data.testResults ?? []) {
    for (const a of suite.assertionResults ?? []) {
      const id = a.fullName || a.title || "test";
      const passed = a.status === "passed";
      results.push({
        id,
        passed,
        stdout: "",
        stderr: passed ? "" : (a.failureMessages ?? []).join("\n").slice(0, 400),
        status: passed ? "Accepted" : "Wrong Answer",
      });
    }
  }
  if (results.length === 0) {
    results.push({
      id: "jest",
      passed: false,
      stdout: "",
      stderr: "No Jest assertions found",
      status: "Error",
    });
  }
  return results;
}
