import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  JUDGE0_LANGUAGE_IDS,
  defaultEntryFile,
  defaultFramework,
  type CodingConfig,
} from "@assessment-os/question-coding";

export type RunTestInput = {
  id: string;
  stdin: string;
  expectedStdout: string;
};

export type RunTestResult = {
  id: string;
  passed: boolean;
  stdout: string;
  stderr: string;
  status: string;
  time?: string;
  memory?: number;
};

export type UnitRunArgs = {
  language: CodingConfig["language"];
  entrySource: string;
  entryFile?: string;
  starterFiles?: Array<{ path: string; content: string }>;
  testCode: string;
  framework?: "pytest" | "jest";
  timeLimitMs?: number;
};

export type Judge0ClientOptions = {
  baseUrl: string;
  maxPolls?: number;
  pollIntervalMs?: number;
};

function normalizeStdout(s: string): string {
  return s.replace(/\r\n/g, "\n").replace(/\s+$/g, "");
}

export class Judge0Client {
  private baseUrl: string;
  private maxPolls: number;
  private pollIntervalMs: number;

  constructor(opts: Judge0ClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, "");
    this.maxPolls = opts.maxPolls ?? 30;
    this.pollIntervalMs = opts.pollIntervalMs ?? 500;
  }

  languageId(config: CodingConfig): number {
    return config.judge0LanguageId ?? JUDGE0_LANGUAGE_IDS[config.language];
  }

  async runTests(args: {
    source: string;
    languageId: number;
    tests: RunTestInput[];
  }): Promise<RunTestResult[]> {
    const results: RunTestResult[] = [];
    for (const test of args.tests) {
      results.push(
        await this.runOne({
          source: args.source,
          languageId: args.languageId,
          test,
        }),
      );
    }
    return results;
  }

  async runUnitTests(_args: UnitRunArgs): Promise<RunTestResult[]> {
    return [
      {
        id: "unit",
        passed: false,
        stdout: "",
        stderr:
          "Judge0 unit-test harness is not configured. Use the local mock runner (USE_MOCK_RUNNER=true) for unit mode.",
        status: "Error",
      },
    ];
  }

  private async runOne(args: {
    source: string;
    languageId: number;
    test: RunTestInput;
  }): Promise<RunTestResult> {
    const createRes = await fetch(
      `${this.baseUrl}/submissions?base64_encoded=false&wait=false`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_code: args.source,
          language_id: args.languageId,
          stdin: args.test.stdin,
          expected_output: args.test.expectedStdout,
        }),
      },
    );
    if (!createRes.ok) {
      const text = await createRes.text();
      return {
        id: args.test.id,
        passed: false,
        stdout: "",
        stderr: `Judge0 create failed: ${createRes.status} ${text}`,
        status: "error",
      };
    }
    const created = (await createRes.json()) as { token: string };
    const result = await this.poll(created.token);
    const stdout = result.stdout ?? "";
    const stderr = result.stderr ?? result.compile_output ?? "";
    const status = result.status?.description ?? "Unknown";
    const stdoutMatches =
      normalizeStdout(stdout) === normalizeStdout(args.test.expectedStdout);
    const passed =
      status === "Accepted" ||
      result.status?.id === 3 ||
      (stdoutMatches && !stderr);
    return {
      id: args.test.id,
      passed,
      stdout,
      stderr,
      status,
      time: result.time ?? undefined,
      memory: result.memory ?? undefined,
    };
  }

  private async poll(token: string): Promise<{
    stdout: string | null;
    stderr: string | null;
    compile_output: string | null;
    time: string | null;
    memory: number | null;
    status: { id: number; description: string } | null;
  }> {
    for (let i = 0; i < this.maxPolls; i++) {
      const res = await fetch(
        `${this.baseUrl}/submissions/${token}?base64_encoded=false`,
      );
      if (!res.ok) {
        await sleep(this.pollIntervalMs);
        continue;
      }
      const data = (await res.json()) as {
        stdout: string | null;
        stderr: string | null;
        compile_output: string | null;
        time: string | null;
        memory: number | null;
        status: { id: number; description: string } | null;
      };
      const id = data.status?.id ?? 0;
      if (id <= 2) {
        await sleep(this.pollIntervalMs);
        continue;
      }
      return data;
    }
    return {
      stdout: null,
      stderr: "Timed out waiting for Judge0",
      compile_output: null,
      time: null,
      memory: null,
      status: { id: -1, description: "Timeout" },
    };
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

const LANGUAGE_ID_TO_RUNTIME: Record<
  number,
  { ext: string; command: string; args: (file: string) => string[] }
> = {
  63: { ext: ".js", command: "node", args: (f) => [f] },
  74: { ext: ".ts", command: "npx", args: (f) => ["--yes", "tsx", f] },
  71: { ext: ".py", command: "python3", args: (f) => [f] },
};

/**
 * Local process runner for development without Judge0.
 */
export class MockRunner {
  languageId(config: CodingConfig): number {
    return config.judge0LanguageId ?? JUDGE0_LANGUAGE_IDS[config.language];
  }

  async runTests(args: {
    source: string;
    languageId: number;
    tests: RunTestInput[];
  }): Promise<RunTestResult[]> {
    const runtime = LANGUAGE_ID_TO_RUNTIME[args.languageId];
    if (!runtime) {
      return args.tests.map((test) => ({
        id: test.id,
        passed: false,
        stdout: "",
        stderr:
          "Local mock runner only supports JavaScript, TypeScript, and Python for I/O mode.",
        status: "Error",
      }));
    }

    if (!args.source.trim()) {
      return args.tests.map((test) => ({
        id: test.id,
        passed: false,
        stdout: "",
        stderr: "No source code provided",
        status: "Wrong Answer",
      }));
    }

    const results: RunTestResult[] = [];
    for (const test of args.tests) {
      results.push(
        await this.runIoOne(args.source, runtime, test, args.languageId),
      );
    }
    return results;
  }

  async runUnitTests(args: UnitRunArgs): Promise<RunTestResult[]> {
    const framework =
      args.framework ?? defaultFramework(args.language);
    if (!framework) {
      return [
        {
          id: "unit",
          passed: false,
          stdout: "",
          stderr: `Unit tests not supported for language ${args.language}`,
          status: "Error",
        },
      ];
    }
    if (!args.entrySource.trim()) {
      return [
        {
          id: "unit",
          passed: false,
          stdout: "",
          stderr: "No source code provided",
          status: "Wrong Answer",
        },
      ];
    }
    if (!args.testCode.trim()) {
      return [
        {
          id: "unit",
          passed: true,
          stdout: "",
          stderr: "",
          status: "Accepted",
        },
      ];
    }

    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "aos-unit-"));
    const entryFile = args.entryFile ?? defaultEntryFile(args.language);
    const timeoutMs = args.timeLimitMs ?? 15_000;

    try {
      for (const f of args.starterFiles ?? []) {
        const full = path.join(dir, f.path);
        await fs.mkdir(path.dirname(full), { recursive: true });
        await fs.writeFile(full, f.content, "utf8");
      }
      await fs.writeFile(path.join(dir, entryFile), args.entrySource, "utf8");

      if (framework === "pytest") {
        await fs.writeFile(
          path.join(dir, "test_solution.py"),
          args.testCode,
          "utf8",
        );
        // Make solution importable as `solution`
        if (entryFile !== "solution.py") {
          await fs.writeFile(
            path.join(dir, "solution.py"),
            args.entrySource,
            "utf8",
          );
        }
        const { stdout, stderr, exitCode, timedOut } = await execCommand({
          command: "python3",
          args: ["-m", "pytest", "-q", "--tb=short"],
          cwd: dir,
          timeoutMs,
        });
        if (timedOut) {
          return [
            {
              id: "pytest",
              passed: false,
              stdout,
              stderr: stderr || "Time Limit Exceeded",
              status: "Time Limit Exceeded",
            },
          ];
        }
        return parsePytestOutput(stdout, stderr, exitCode);
      }

      // jest
      const moduleName = entryFile.replace(/\.(js|ts)$/, "");
      await fs.writeFile(
        path.join(dir, entryFile),
        args.entrySource,
        "utf8",
      );
      await fs.writeFile(
        path.join(dir, "solution.test.js"),
        args.testCode.includes("require(") || args.testCode.includes("from ")
          ? args.testCode
          : `const sol = require('./${moduleName}');\n${args.testCode}`,
        "utf8",
      );
      await fs.writeFile(
        path.join(dir, "package.json"),
        JSON.stringify({
          name: "aos-unit",
          private: true,
          type: "commonjs",
        }),
        "utf8",
      );
      await fs.writeFile(
        path.join(dir, "jest.config.js"),
        `module.exports = { testEnvironment: 'node', testMatch: ['**/*.test.js'] };\n`,
        "utf8",
      );

      const { stdout, stderr, exitCode, timedOut } = await execCommand({
        command: "npx",
        args: ["--yes", "jest", "--json", "--outputFile=jest-results.json"],
        cwd: dir,
        timeoutMs,
      });
      if (timedOut) {
        return [
          {
            id: "jest",
            passed: false,
            stdout,
            stderr: stderr || "Time Limit Exceeded",
            status: "Time Limit Exceeded",
          },
        ];
      }
      try {
        const raw = await fs.readFile(
          path.join(dir, "jest-results.json"),
          "utf8",
        );
        return parseJestJson(raw);
      } catch {
        return [
          {
            id: "jest",
            passed: exitCode === 0,
            stdout,
            stderr: stderr || "Could not parse Jest results",
            status: exitCode === 0 ? "Accepted" : "Wrong Answer",
          },
        ];
      }
    } catch (err) {
      return [
        {
          id: "unit",
          passed: false,
          stdout: "",
          stderr: err instanceof Error ? err.message : String(err),
          status: "Error",
        },
      ];
    } finally {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  private async runIoOne(
    source: string,
    runtime: { ext: string; command: string; args: (file: string) => string[] },
    test: RunTestInput,
    languageId: number,
  ): Promise<RunTestResult> {
    const looksLikeCpp =
      /#include\s*<|using\s+namespace\s+std|int\s+main\s*\(/.test(source);
    const looksLikeJava =
      /public\s+class\s+|System\.out\.println/.test(source);
    if (languageId === 71 && (looksLikeCpp || looksLikeJava)) {
      return {
        id: test.id,
        passed: false,
        stdout: "",
        stderr:
          "This question requires Python 3, but the code looks like C++/Java.",
        status: "Wrong Answer",
      };
    }

    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "aos-run-"));
    const file = path.join(dir, `main${runtime.ext}`);
    try {
      await fs.writeFile(file, source, "utf8");
      const { stdout, stderr, timedOut, exitCode } = await execWithStdin({
        command: runtime.command,
        args: runtime.args(file),
        stdin: test.stdin,
        timeoutMs: 5000,
        cwd: dir,
      });
      if (timedOut) {
        return {
          id: test.id,
          passed: false,
          stdout,
          stderr: stderr || "Time Limit Exceeded",
          status: "Time Limit Exceeded",
        };
      }
      const passed =
        exitCode === 0 &&
        normalizeStdout(stdout) === normalizeStdout(test.expectedStdout);
      return {
        id: test.id,
        passed,
        stdout,
        stderr,
        status: passed
          ? "Accepted"
          : exitCode !== 0
            ? "Runtime Error"
            : "Wrong Answer",
      };
    } catch (err) {
      return {
        id: test.id,
        passed: false,
        stdout: "",
        stderr: err instanceof Error ? err.message : String(err),
        status: "Error",
      };
    } finally {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}

function parsePytestOutput(
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

function parseJestJson(raw: string): RunTestResult[] {
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

function execWithStdin(opts: {
  command: string;
  args: string[];
  stdin: string;
  timeoutMs: number;
  cwd: string;
}): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
}> {
  return new Promise((resolve) => {
    const child = spawn(opts.command, opts.args, {
      cwd: opts.cwd,
      env: { ...process.env, PATH: process.env.PATH },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, opts.timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({
        stdout,
        stderr: err.message,
        exitCode: 1,
        timedOut: false,
      });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode: code, timedOut });
    });

    child.stdin.write(opts.stdin);
    child.stdin.end();
  });
}

function execCommand(opts: {
  command: string;
  args: string[];
  cwd: string;
  timeoutMs: number;
}): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
}> {
  return new Promise((resolve) => {
    const child = spawn(opts.command, opts.args, {
      cwd: opts.cwd,
      env: { ...process.env, PATH: process.env.PATH },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, opts.timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({
        stdout,
        stderr: err.message,
        exitCode: 1,
        timedOut: false,
      });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode: code, timedOut });
    });
  });
}

export type CodeRunner = {
  runTests(args: {
    source: string;
    languageId: number;
    tests: RunTestInput[];
  }): Promise<RunTestResult[]>;
  runUnitTests?(args: UnitRunArgs): Promise<RunTestResult[]>;
  languageId?(config: CodingConfig): number;
};

export function createRunner(env: {
  judge0Url?: string;
  useMock?: boolean;
}): CodeRunner {
  if (env.useMock || !env.judge0Url) {
    return new MockRunner();
  }
  return new Judge0Client({ baseUrl: env.judge0Url });
}
