import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  JUDGE0_LANGUAGE_IDS,
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

export type Judge0ClientOptions = {
  baseUrl: string;
  /** Max poll attempts */
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
      // 1 In Queue, 2 Processing
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
  // Match JUDGE0_LANGUAGE_IDS from question-coding
  63: { ext: ".js", command: "node", args: (f) => [f] }, // javascript
  74: { ext: ".ts", command: "npx", args: (f) => ["--yes", "tsx", f] }, // typescript
  71: { ext: ".py", command: "python3", args: (f) => [f] }, // python
};

/**
 * Local process runner for development without Judge0.
 * Executes JS/TS/Python with a timeout; other languages fail clearly.
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
          "Local mock runner only supports JavaScript, TypeScript, and Python. Set JUDGE0_URL for other languages.",
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
      results.push(await this.runOne(args.source, runtime, test, args.languageId));
    }
    return results;
  }

  private async runOne(
    source: string,
    runtime: { ext: string; command: string; args: (file: string) => string[] },
    test: RunTestInput,
    languageId: number,
  ): Promise<RunTestResult> {
    // Helpful hint when candidate pastes a different language than required.
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
          "This question requires Python 3, but the code looks like C++/Java. Use the starter template or rewrite in Python.",
        status: "Wrong Answer",
      };
    }
    if (languageId === 63 && (looksLikeCpp || looksLikeJava)) {
      return {
        id: test.id,
        passed: false,
        stdout: "",
        stderr:
          "This question requires JavaScript, but the code looks like C++/Java.",
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
      resolve({
        stdout,
        stderr,
        exitCode: code,
        timedOut,
      });
    });

    child.stdin.write(opts.stdin);
    child.stdin.end();
  });
}

export type CodeRunner = {
  runTests(args: {
    source: string;
    languageId: number;
    tests: RunTestInput[];
  }): Promise<RunTestResult[]>;
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