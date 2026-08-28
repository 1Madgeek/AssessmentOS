import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  JUDGE0_LANGUAGE_IDS,
  type CodingConfig,
} from "@assessment-os/question-coding";
import { normalizeStdout } from "./parse-results.js";
import type {
  IoRunArgs,
  RunTestInput,
  RunTestResult,
  UnitRunArgs,
} from "./types.js";
import { prepareUnitWorkspace } from "./unit-workspace.js";
import { createZipBase64 } from "./zip.js";

export type {
  IoRunArgs,
  RunTestInput,
  RunTestResult,
  UnitRunArgs,
} from "./types.js";
export {
  normalizeStdout,
  parseJestJson,
  parseJunitXml,
  parsePhpunitJunit,
  parsePytestOutput,
} from "./parse-results.js";
export { createZipBase64 } from "./zip.js";
export { prepareUnitWorkspace, extractJsonObject, extractXmlDocument } from "./unit-workspace.js";

/** Judge0 CE language id for multi-file programs (custom compile/run scripts). */
export const JUDGE0_MULTIFILE_LANGUAGE_ID = 89;

export type Judge0ClientOptions = {
  baseUrl: string;
  maxPolls?: number;
  pollIntervalMs?: number;
};

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

  async runTests(args: IoRunArgs): Promise<RunTestResult[]> {
    const results: RunTestResult[] = [];
    for (const test of args.tests) {
      results.push(
        await this.runOne({
          source: args.source,
          languageId: args.languageId,
          test,
          timeLimitMs: args.timeLimitMs,
          memoryMb: args.memoryMb,
          checkerCode: args.checkerCode,
        }),
      );
    }
    return results;
  }

  /**
   * Multi-file Judge0 submission (language 89): zip of solution + tests +
   * `compile`/`run` scripts. Requires a Judge0 image with the framework tools
   * installed (pytest / jest / phpunit; optionally JUnit jar + gtest).
   */
  async runUnitTests(args: UnitRunArgs): Promise<RunTestResult[]> {
    const prepared = prepareUnitWorkspace(args);
    if ("error" in prepared) return prepared.error;

    const zipEntries = prepared.files.map((f) => ({
      path: f.path,
      content: f.content,
    }));
    if (prepared.compileScript) {
      zipEntries.push({ path: "compile", content: prepared.compileScript });
    }
    zipEntries.push({ path: "run", content: prepared.runScript });

    const additionalFiles = createZipBase64(zipEntries);
    const wallSeconds = Math.max(
      5,
      Math.ceil((args.timeLimitMs ?? 15_000) / 1000),
    );
    const memoryKb = args.memoryMb
      ? Math.max(64, args.memoryMb) * 1024
      : undefined;

    const createRes = await fetch(
      `${this.baseUrl}/submissions?base64_encoded=false&wait=false`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language_id: JUDGE0_MULTIFILE_LANGUAGE_ID,
          additional_files: additionalFiles,
          cpu_time_limit: wallSeconds,
          wall_time_limit: wallSeconds + 5,
          ...(memoryKb ? { memory_limit: memoryKb } : {}),
        }),
      },
    );
    if (!createRes.ok) {
      const text = await createRes.text();
      return [
        {
          id: "unit",
          passed: false,
          stdout: "",
          stderr: `Judge0 create failed: ${createRes.status} ${text}`,
          status: "Error",
        },
      ];
    }
    const created = (await createRes.json()) as { token: string };
    const result = await this.poll(created.token);
    const stdout = result.stdout ?? "";
    const stderr = result.stderr ?? "";
    const compileOut = result.compile_output ?? "";
    const statusId = result.status?.id ?? 0;
    const status = result.status?.description ?? "Unknown";

    // 5 = TLE, 6 = compilation error
    if (statusId === 5) {
      return [
        {
          id: prepared.framework,
          passed: false,
          stdout,
          stderr: stderr || compileOut || "Time Limit Exceeded",
          status: "Time Limit Exceeded",
          time: result.time ?? undefined,
          memory: result.memory ?? undefined,
        },
      ];
    }
    if (statusId === 6) {
      return [
        {
          id: prepared.framework,
          passed: false,
          stdout,
          stderr: compileOut || stderr || "Compilation Error",
          status: "Compilation Error",
        },
      ];
    }

    // Non-zero exit (e.g. failed tests → NZEC) still yields parseable stdout.
    const exitHint =
      statusId === 3 || status === "Accepted" ? 0 : statusId > 3 ? 1 : null;
    return prepared.parse(stdout, stderr || compileOut, exitHint);
  }

  private async runOne(args: {
    source: string;
    languageId: number;
    test: RunTestInput;
    timeLimitMs?: number;
    memoryMb?: number;
    checkerCode?: string;
  }): Promise<RunTestResult> {
    const cpuSeconds = Math.max(
      1,
      Math.ceil((args.timeLimitMs ?? 5_000) / 1000),
    );
    const memoryKb = args.memoryMb
      ? Math.max(64, args.memoryMb) * 1024
      : undefined;
    const useChecker = Boolean(args.checkerCode?.trim());

    const createRes = await fetch(
      `${this.baseUrl}/submissions?base64_encoded=false&wait=false`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_code: args.source,
          language_id: args.languageId,
          stdin: args.test.stdin,
          ...(useChecker
            ? {}
            : { expected_output: args.test.expectedStdout }),
          cpu_time_limit: cpuSeconds,
          wall_time_limit: cpuSeconds + 2,
          ...(memoryKb ? { memory_limit: memoryKb } : {}),
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

    if (useChecker) {
      const runtimeOk =
        status === "Accepted" ||
        result.status?.id === 3 ||
        (result.status?.id ?? 0) > 3;
      if (!runtimeOk && (result.status?.id === 5 || result.status?.id === 6)) {
        return {
          id: args.test.id,
          passed: false,
          stdout,
          stderr,
          status,
          time: result.time ?? undefined,
          memory: result.memory ?? undefined,
        };
      }
      const check = await this.runChecker({
        checkerCode: args.checkerCode!,
        candidateStdout: stdout,
        expectedStdout: args.test.expectedStdout,
        testStdin: args.test.stdin,
        timeLimitMs: args.timeLimitMs,
        memoryMb: args.memoryMb,
      });
      return {
        id: args.test.id,
        passed: check.passed,
        stdout,
        stderr: check.stderr || stderr,
        status: check.passed ? "Accepted" : "Wrong Answer",
        time: result.time ?? undefined,
        memory: result.memory ?? undefined,
      };
    }

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

  private async runChecker(args: {
    checkerCode: string;
    candidateStdout: string;
    expectedStdout: string;
    testStdin: string;
    timeLimitMs?: number;
    memoryMb?: number;
  }): Promise<{ passed: boolean; stderr: string }> {
    const cpuSeconds = Math.max(
      1,
      Math.ceil((args.timeLimitMs ?? 5_000) / 1000),
    );
    const memoryKb = args.memoryMb
      ? Math.max(64, args.memoryMb) * 1024
      : undefined;
    const wrapped = [
      "import os",
      `os.environ['EXPECTED_STDOUT'] = ${JSON.stringify(args.expectedStdout)}`,
      `os.environ['TEST_STDIN'] = ${JSON.stringify(args.testStdin)}`,
      args.checkerCode,
    ].join("\n");
    const createRes = await fetch(
      `${this.baseUrl}/submissions?base64_encoded=false&wait=false`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_code: wrapped,
          language_id: 71,
          stdin: args.candidateStdout,
          cpu_time_limit: cpuSeconds,
          wall_time_limit: cpuSeconds + 2,
          ...(memoryKb ? { memory_limit: memoryKb } : {}),
        }),
      },
    );
    if (!createRes.ok) {
      return {
        passed: false,
        stderr: `Checker create failed: ${createRes.status}`,
      };
    }
    const created = (await createRes.json()) as { token: string };
    const result = await this.poll(created.token);
    const ok =
      result.status?.description === "Accepted" || result.status?.id === 3;
    return {
      passed: ok,
      stderr: result.stderr ?? result.compile_output ?? "",
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
  68: { ext: ".php", command: "php", args: (f) => [f] },
};

const JUNIT_JAR_VERSION = "1.10.2";
const JUNIT_JAR_NAME = `junit-platform-console-standalone-${JUNIT_JAR_VERSION}.jar`;
const JUNIT_JAR_URL = `https://repo1.maven.org/maven2/org/junit/platform/junit-platform-console-standalone/${JUNIT_JAR_VERSION}/${JUNIT_JAR_NAME}`;

/**
 * Local process runner for development without Judge0.
 */
export class MockRunner {
  languageId(config: CodingConfig): number {
    return config.judge0LanguageId ?? JUDGE0_LANGUAGE_IDS[config.language];
  }

  async runTests(args: IoRunArgs): Promise<RunTestResult[]> {
    const runtime = LANGUAGE_ID_TO_RUNTIME[args.languageId];
    if (!runtime) {
      return args.tests.map((test) => ({
        id: test.id,
        passed: false,
        stdout: "",
        stderr:
          "Local mock runner only supports JavaScript, TypeScript, Python, and PHP for I/O mode.",
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
        await this.runIoOne(
          args.source,
          runtime,
          test,
          args.languageId,
          args.timeLimitMs ?? 5_000,
          args.checkerCode,
        ),
      );
    }
    return results;
  }

  async runUnitTests(args: UnitRunArgs): Promise<RunTestResult[]> {
    const prepared = prepareUnitWorkspace(args);
    if ("error" in prepared) return prepared.error;

    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "aos-unit-"));
    const timeoutMs = args.timeLimitMs ?? 15_000;

    try {
      for (const f of prepared.files) {
        const full = path.join(dir, f.path);
        await fs.mkdir(path.dirname(full), { recursive: true });
        await fs.writeFile(full, f.content, "utf8");
      }

      if (prepared.framework === "pytest") {
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
        return prepared.parse(stdout, stderr, exitCode);
      }

      if (prepared.framework === "phpunit") {
        const junitPath = path.join(dir, "junit.xml");
        const { stdout, stderr, exitCode, timedOut } = await execCommand({
          command: "phpunit",
          args: ["--log-junit", junitPath, "-c", "phpunit.xml"],
          cwd: dir,
          timeoutMs,
        });
        if (timedOut) {
          return [
            {
              id: "phpunit",
              passed: false,
              stdout,
              stderr: stderr || "Time Limit Exceeded",
              status: "Time Limit Exceeded",
            },
          ];
        }
        try {
          const xml = await fs.readFile(junitPath, "utf8");
          return prepared.parse(xml, stderr, exitCode);
        } catch {
          return prepared.parse(stdout, stderr, exitCode);
        }
      }

      if (prepared.framework === "jest") {
        const jestArgs = ["--json", "--outputFile=jest-results.json"];
        let { stdout, stderr, exitCode, timedOut } = await execCommand({
          command: process.env.JEST_BIN?.trim() || "jest",
          args: jestArgs,
          cwd: dir,
          timeoutMs,
        });
        // Local dev often has Jest only via npx; API image bakes a global `jest`.
        if (
          exitCode === 1 &&
          /ENOENT|not found|spawn jest/i.test(stderr) &&
          !process.env.JEST_BIN
        ) {
          ({ stdout, stderr, exitCode, timedOut } = await execCommand({
            command: "npx",
            args: ["--yes", "jest", ...jestArgs],
            cwd: dir,
            timeoutMs,
          }));
        }
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
          return prepared.parse(raw, stderr, exitCode);
        } catch {
          return prepared.parse(stdout, stderr, exitCode);
        }
      }

      if (prepared.framework === "junit") {
        return await this.runJunitMock(dir, prepared.parse, timeoutMs);
      }

      if (prepared.framework === "googletest") {
        return await this.runGoogletestMock(dir, prepared.parse, timeoutMs);
      }

      return [
        {
          id: "unit",
          passed: false,
          stdout: "",
          stderr: `Unknown unit framework: ${prepared.framework}`,
          status: "Error",
        },
      ];
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

  private async runJunitMock(
    dir: string,
    parse: (
      stdout: string,
      stderr: string,
      exitCode: number | null,
    ) => RunTestResult[],
    timeoutMs: number,
  ): Promise<RunTestResult[]> {
    const jar = await ensureJunitConsoleJar();
    if (!jar) {
      return [
        {
          id: "junit",
          passed: false,
          stdout: "",
          stderr:
            "JUnit console jar unavailable (set JUNIT_CONSOLE_JAR or allow download). Also need javac/java on PATH.",
          status: "Error",
        },
      ];
    }

    const compile = await execCommand({
      command: "javac",
      args: ["-cp", `${jar}${path.delimiter}.`, "Solution.java", "SolutionTest.java"],
      cwd: dir,
      timeoutMs,
    });
    if (compile.timedOut) {
      return [
        {
          id: "junit",
          passed: false,
          stdout: compile.stdout,
          stderr: compile.stderr || "Time Limit Exceeded",
          status: "Time Limit Exceeded",
        },
      ];
    }
    if (compile.exitCode !== 0) {
      return [
        {
          id: "junit",
          passed: false,
          stdout: compile.stdout,
          stderr: compile.stderr || "javac failed",
          status: "Compilation Error",
        },
      ];
    }

    const reportsDir = path.join(dir, "reports");
    await fs.mkdir(reportsDir, { recursive: true });
    const { stdout, stderr, exitCode, timedOut } = await execCommand({
      command: "java",
      args: [
        "-jar",
        jar,
        "execute",
        "--class-path",
        ".",
        "--scan-class-path",
        `--reports-dir=${reportsDir}`,
        "--disable-banner",
      ],
      cwd: dir,
      timeoutMs,
      env: { JUNIT_CONSOLE_JAR: jar },
    });
    if (timedOut) {
      return [
        {
          id: "junit",
          passed: false,
          stdout,
          stderr: stderr || "Time Limit Exceeded",
          status: "Time Limit Exceeded",
        },
      ];
    }
    try {
      const names = await fs.readdir(reportsDir);
      const xmlName = names.find((n) => n.endsWith(".xml"));
      if (xmlName) {
        const xml = await fs.readFile(path.join(reportsDir, xmlName), "utf8");
        return parse(xml, stderr, exitCode);
      }
    } catch {
      /* fall through */
    }
    return parse(stdout, stderr, exitCode);
  }

  private async runGoogletestMock(
    dir: string,
    parse: (
      stdout: string,
      stderr: string,
      exitCode: number | null,
    ) => RunTestResult[],
    timeoutMs: number,
  ): Promise<RunTestResult[]> {
    const hasSolution = await fs
      .access(path.join(dir, "solution.cpp"))
      .then(() => true)
      .catch(() => false);
    const impl = hasSolution ? "solution.cpp" : "main.cpp";

    const brewPrefix = process.env.HOMEBREW_PREFIX ?? "/opt/homebrew";
    const cxxFlags = ["-std=c++17", "-pthread"];
    const includes: string[] = [];
    const libDirs: string[] = [];

    if (
      await fs
        .access(path.join(brewPrefix, "include", "gtest"))
        .then(() => true)
        .catch(() => false)
    ) {
      includes.push(`-I${path.join(brewPrefix, "include")}`);
      libDirs.push(`-L${path.join(brewPrefix, "lib")}`);
    }
    if (
      await fs
        .access("/usr/local/include/gtest")
        .then(() => true)
        .catch(() => false)
    ) {
      includes.push("-I/usr/local/include");
      libDirs.push("-L/usr/local/lib");
    }
    if (
      await fs
        .access("/usr/include/gtest")
        .then(() => true)
        .catch(() => false)
    ) {
      includes.push("-I/usr/include");
    }

    const compileImpl = await execCommand({
      command: "g++",
      args: [...cxxFlags, ...includes, "-c", impl, "-o", "solution.o"],
      cwd: dir,
      timeoutMs,
    });
    if (compileImpl.exitCode !== 0 || compileImpl.timedOut) {
      return [
        {
          id: "googletest",
          passed: false,
          stdout: compileImpl.stdout,
          stderr:
            compileImpl.stderr ||
            "g++ compile failed (install googletest / libgtest-dev)",
          status: compileImpl.timedOut
            ? "Time Limit Exceeded"
            : "Compilation Error",
        },
      ];
    }
    const compileTest = await execCommand({
      command: "g++",
      args: [
        ...cxxFlags,
        ...includes,
        "-c",
        "solution_test.cpp",
        "-o",
        "solution_test.o",
      ],
      cwd: dir,
      timeoutMs,
    });
    if (compileTest.exitCode !== 0 || compileTest.timedOut) {
      return [
        {
          id: "googletest",
          passed: false,
          stdout: compileTest.stdout,
          stderr: compileTest.stderr || "g++ test compile failed",
          status: compileTest.timedOut
            ? "Time Limit Exceeded"
            : "Compilation Error",
        },
      ];
    }
    const link = await execCommand({
      command: "g++",
      args: [
        ...cxxFlags,
        "solution.o",
        "solution_test.o",
        ...libDirs,
        "-lgtest",
        "-lgtest_main",
        "-pthread",
        "-o",
        "aos_gtest",
      ],
      cwd: dir,
      timeoutMs,
    });
    if (link.exitCode !== 0 || link.timedOut) {
      return [
        {
          id: "googletest",
          passed: false,
          stdout: link.stdout,
          stderr:
            link.stderr ||
            "g++ link failed (need -lgtest -lgtest_main; brew install googletest)",
          status: link.timedOut ? "Time Limit Exceeded" : "Compilation Error",
        },
      ];
    }

    const { stdout, stderr, exitCode, timedOut } = await execCommand({
      command: path.join(dir, "aos_gtest"),
      args: ["--gtest_output=xml:gtest.xml"],
      cwd: dir,
      timeoutMs,
    });
    if (timedOut) {
      return [
        {
          id: "googletest",
          passed: false,
          stdout,
          stderr: stderr || "Time Limit Exceeded",
          status: "Time Limit Exceeded",
        },
      ];
    }
    try {
      const xml = await fs.readFile(path.join(dir, "gtest.xml"), "utf8");
      return parse(xml, stderr, exitCode);
    } catch {
      return parse(stdout, stderr, exitCode);
    }
  }

  private async runIoOne(
    source: string,
    runtime: { ext: string; command: string; args: (file: string) => string[] },
    test: RunTestInput,
    languageId: number,
    timeoutMs = 5_000,
    checkerCode?: string,
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
        timeoutMs,
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

      if (checkerCode?.trim()) {
        const check = await runPythonChecker({
          checkerCode,
          candidateStdout: stdout,
          expectedStdout: test.expectedStdout,
          testStdin: test.stdin,
          timeoutMs,
        });
        return {
          id: test.id,
          passed: check.passed,
          stdout,
          stderr: check.stderr || stderr,
          status: check.passed
            ? "Accepted"
            : exitCode !== 0
              ? "Runtime Error"
              : "Wrong Answer",
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

async function runPythonChecker(args: {
  checkerCode: string;
  candidateStdout: string;
  expectedStdout: string;
  testStdin: string;
  timeoutMs: number;
}): Promise<{ passed: boolean; stderr: string }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "aos-check-"));
  const file = path.join(dir, "checker.py");
  try {
    await fs.writeFile(file, args.checkerCode, "utf8");
    const { stderr, timedOut, exitCode } = await execWithStdin({
      command: "python3",
      args: [file],
      stdin: args.candidateStdout,
      timeoutMs: args.timeoutMs,
      cwd: dir,
      env: {
        ...process.env,
        EXPECTED_STDOUT: args.expectedStdout,
        TEST_STDIN: args.testStdin,
      },
    });
    if (timedOut) {
      return { passed: false, stderr: stderr || "Checker timed out" };
    }
    return {
      passed: exitCode === 0,
      stderr: exitCode === 0 ? "" : stderr || "Checker failed",
    };
  } catch (err) {
    return {
      passed: false,
      stderr: err instanceof Error ? err.message : String(err),
    };
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function ensureJunitConsoleJar(): Promise<string | null> {
  if (process.env.JUNIT_CONSOLE_JAR) {
    try {
      await fs.access(process.env.JUNIT_CONSOLE_JAR);
      return process.env.JUNIT_CONSOLE_JAR;
    } catch {
      /* continue */
    }
  }
  const cacheDir = path.join(os.homedir(), ".cache", "assessment-os");
  const cached = path.join(cacheDir, JUNIT_JAR_NAME);
  try {
    await fs.access(cached);
    return cached;
  } catch {
    /* download */
  }
  try {
    await fs.mkdir(cacheDir, { recursive: true });
    const res = await fetch(JUNIT_JAR_URL);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    await fs.writeFile(cached, buf);
    return cached;
  } catch {
    return null;
  }
}

function execWithStdin(opts: {
  command: string;
  args: string[];
  stdin: string;
  timeoutMs: number;
  cwd: string;
  env?: NodeJS.ProcessEnv;
}): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
}> {
  return new Promise((resolve) => {
    const child = spawn(opts.command, opts.args, {
      cwd: opts.cwd,
      env: opts.env ?? { ...process.env, PATH: process.env.PATH },
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
  env?: Record<string, string>;
}): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
}> {
  return new Promise((resolve) => {
    const child = spawn(opts.command, opts.args, {
      cwd: opts.cwd,
      env: { ...process.env, PATH: process.env.PATH, ...opts.env },
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
  runTests(args: IoRunArgs): Promise<RunTestResult[]>;
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

export {
  assertReadOnlySelect,
  runSqlChecks,
  type SqlRunResult,
} from "./sql-executor.js";
