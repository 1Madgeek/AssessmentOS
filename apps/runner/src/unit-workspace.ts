import {
  defaultEntryFile,
  defaultFramework,
  type CodingConfig,
} from "@assessment-os/question-coding";
import {
  parseJestJson,
  parseJunitXml,
  parsePytestOutput,
} from "./parse-results.js";
import type { RunTestResult, UnitRunArgs } from "./types.js";

export type UnitFramework = NonNullable<UnitRunArgs["framework"]>;

export type WorkspaceFile = { path: string; content: string };

export type PreparedUnitWorkspace = {
  framework: UnitFramework;
  files: WorkspaceFile[];
  /** Bash script contents for Judge0 multi-file `run` (and optional `compile`). */
  runScript: string;
  compileScript?: string;
  parse: (
    stdout: string,
    stderr: string,
    exitCode: number | null,
  ) => RunTestResult[];
};

function unitError(
  id: string,
  stderr: string,
  status = "Error",
): RunTestResult[] {
  return [{ id, passed: false, stdout: "", stderr, status }];
}

/** Extract first JSON object from mixed tool output (npx noise, etc.). */
export function extractJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  return text.slice(start, end + 1);
}

/** Extract XML document starting at first `<` (for JUnit XML on stdout). */
export function extractXmlDocument(text: string): string | null {
  const start = text.indexOf("<");
  if (start < 0) return null;
  return text.slice(start);
}

export function resolveFramework(
  args: UnitRunArgs,
): UnitFramework | undefined {
  return args.framework ?? defaultFramework(args.language);
}

/**
 * Build the same on-disk layout used by mock + Judge0 unit harnesses.
 */
export function prepareUnitWorkspace(
  args: UnitRunArgs,
): PreparedUnitWorkspace | { error: RunTestResult[] } {
  const framework = resolveFramework(args);
  if (!framework) {
    return {
      error: unitError(
        "unit",
        `Unit tests not supported for language ${args.language}`,
      ),
    };
  }
  if (!args.entrySource.trim()) {
    return {
      error: unitError("unit", "No source code provided", "Wrong Answer"),
    };
  }
  if (!args.testCode.trim()) {
    return {
      error: [
        {
          id: "unit",
          passed: true,
          stdout: "",
          stderr: "",
          status: "Accepted",
        },
      ],
    };
  }

  const entryFile = args.entryFile ?? defaultEntryFile(args.language, "unit");
  const files: WorkspaceFile[] = [];

  for (const f of args.starterFiles ?? []) {
    files.push({ path: f.path, content: f.content });
  }
  upsert(files, entryFile, args.entrySource);

  if (framework === "pytest") {
    upsert(files, "test_solution.py", args.testCode);
    if (entryFile !== "solution.py") {
      upsert(files, "solution.py", args.entrySource);
    }
    return {
      framework,
      files,
      runScript: `#!/bin/bash
set +e
python3 -m pytest -q --tb=short
exit $?
`,
      parse: parsePytestOutput,
    };
  }

  if (framework === "phpunit") {
    let testBody = args.testCode.trim();
    if (!testBody.startsWith("<?php")) {
      testBody = `<?php\n${testBody}`;
    }
    if (!/require(?:_once)?\s*\(?['\"]solution\.php['\"]\)?/.test(testBody)) {
      testBody = testBody.replace(
        /^<\?php\s*/,
        "<?php\nrequire_once 'solution.php';\n",
      );
    }
    upsert(files, "SolutionTest.php", testBody);
    if (entryFile !== "solution.php") {
      upsert(files, "solution.php", args.entrySource);
    }
    upsert(
      files,
      "phpunit.xml",
      `<?xml version="1.0" encoding="UTF-8"?>
<phpunit colors="false" cacheResult="false">
  <testsuites>
    <testsuite name="aos">
      <file>SolutionTest.php</file>
    </testsuite>
  </testsuites>
</phpunit>
`,
    );
    return {
      framework,
      files,
      runScript: `#!/bin/bash
set +e
phpunit --log-junit junit.xml -c phpunit.xml
code=$?
if [ -f junit.xml ]; then cat junit.xml; fi
exit $code
`,
      parse: (stdout, stderr, exitCode) => {
        const xml = extractXmlDocument(stdout);
        if (xml && xml.includes("testcase")) {
          return parseJunitXml(xml);
        }
        return [
          {
            id: "phpunit",
            passed: exitCode === 0,
            stdout,
            stderr:
              stderr ||
              "PHPUnit failed (is phpunit installed on the runner?)",
            status: exitCode === 0 ? "Accepted" : "Wrong Answer",
          },
        ];
      },
    };
  }

  if (framework === "jest") {
    const moduleName = entryFile.replace(/\.(js|ts)$/, "");
    upsert(
      files,
      "solution.test.js",
      args.testCode.includes("require(") || args.testCode.includes("from ")
        ? args.testCode
        : `const sol = require('./${moduleName}');\n${args.testCode}`,
    );
    upsert(
      files,
      "package.json",
      JSON.stringify({
        name: "aos-unit",
        private: true,
        type: "commonjs",
      }),
    );
    upsert(
      files,
      "jest.config.js",
      `module.exports = { testEnvironment: 'node', testMatch: ['**/*.test.js'] };\n`,
    );
    return {
      framework,
      files,
      runScript: `#!/bin/bash
set +e
if command -v jest >/dev/null 2>&1; then
  jest --json --outputFile=jest-results.json
else
  npx --yes jest --json --outputFile=jest-results.json
fi
code=$?
if [ -f jest-results.json ]; then cat jest-results.json; fi
exit $code
`,
      parse: (stdout, stderr, exitCode) => {
        const json = extractJsonObject(stdout);
        if (json) {
          try {
            return parseJestJson(json);
          } catch {
            /* fall through */
          }
        }
        return [
          {
            id: "jest",
            passed: exitCode === 0,
            stdout,
            stderr: stderr || "Could not parse Jest results",
            status: exitCode === 0 ? "Accepted" : "Wrong Answer",
          },
        ];
      },
    };
  }

  if (framework === "junit") {
    const testFile = "SolutionTest.java";
    upsert(files, testFile, ensureJavaPackageFree(args.testCode));
    if (entryFile !== "Solution.java") {
      upsert(files, "Solution.java", args.entrySource);
    }
    return {
      framework,
      files,
      compileScript: `#!/bin/bash
set -e
JAR="\${JUNIT_CONSOLE_JAR:-}"
if [ -z "$JAR" ] || [ ! -f "$JAR" ]; then
  for c in /opt/junit/junit-platform-console-standalone.jar \\
           /usr/share/java/junit-platform-console-standalone.jar \\
           ./junit-platform-console-standalone.jar; do
    if [ -f "$c" ]; then JAR="$c"; break; fi
  done
fi
if [ -z "$JAR" ] || [ ! -f "$JAR" ]; then
  echo "JUnit console jar not found. Set JUNIT_CONSOLE_JAR or install junit-platform-console-standalone." >&2
  exit 1
fi
echo "$JAR" > .junit_jar
javac -cp "$JAR:." Solution.java SolutionTest.java
`,
      runScript: `#!/bin/bash
set +e
JAR=$(cat .junit_jar 2>/dev/null)
if [ -z "$JAR" ] || [ ! -f "$JAR" ]; then
  JAR="\${JUNIT_CONSOLE_JAR:-}"
fi
java -jar "$JAR" execute --class-path . --scan-class-path --reports-dir=reports --disable-banner
code=$?
if ls reports/*.xml >/dev/null 2>&1; then cat reports/*.xml; fi
exit $code
`,
      parse: (stdout, stderr, exitCode) => {
        const xml = extractXmlDocument(stdout);
        if (xml && /testcase/i.test(xml)) {
          return parseJunitXml(xml);
        }
        return [
          {
            id: "junit",
            passed: exitCode === 0,
            stdout,
            stderr:
              stderr ||
              "JUnit failed (need javac/java + junit-platform-console-standalone)",
            status: exitCode === 0 ? "Accepted" : "Wrong Answer",
          },
        ];
      },
    };
  }

  if (framework === "googletest") {
    const testFile = "solution_test.cpp";
    upsert(files, testFile, args.testCode);
    if (entryFile !== "solution.cpp") {
      upsert(files, "solution.cpp", args.entrySource);
    }
    // Prefer solution.cpp as the implementation unit under test.
    const impl = files.find((f) => f.path === "solution.cpp")
      ? "solution.cpp"
      : entryFile;
    return {
      framework,
      files,
      compileScript: `#!/bin/bash
set -e
CXXFLAGS="-std=c++17 -pthread"
LIBS="-lgtest -lgtest_main -pthread"
INCLUDES=""
if command -v pkg-config >/dev/null 2>&1 && pkg-config --exists gtest 2>/dev/null; then
  CXXFLAGS="$CXXFLAGS $(pkg-config --cflags gtest)"
  LIBS="$(pkg-config --libs gtest) -lgtest_main -pthread"
fi
if [ -d /opt/homebrew/include ]; then
  INCLUDES="$INCLUDES -I/opt/homebrew/include"
  LIBS="-L/opt/homebrew/lib $LIBS"
fi
if [ -d /usr/local/include/gtest ]; then
  INCLUDES="$INCLUDES -I/usr/local/include"
fi
g++ $CXXFLAGS $INCLUDES -c ${impl} -o solution.o
g++ $CXXFLAGS $INCLUDES -c solution_test.cpp -o solution_test.o
g++ $CXXFLAGS solution.o solution_test.o $LIBS -o aos_gtest
`,
      runScript: `#!/bin/bash
set +e
./aos_gtest --gtest_output=xml:gtest.xml
code=$?
if [ -f gtest.xml ]; then cat gtest.xml; fi
exit $code
`,
      parse: (stdout, stderr, exitCode) => {
        const xml = extractXmlDocument(stdout);
        if (xml && /testcase/i.test(xml)) {
          return parseJunitXml(xml);
        }
        return [
          {
            id: "googletest",
            passed: exitCode === 0,
            stdout,
            stderr:
              stderr ||
              "GoogleTest failed (need g++ and libgtest / googletest)",
            status: exitCode === 0 ? "Accepted" : "Wrong Answer",
          },
        ];
      },
    };
  }

  return {
    error: unitError("unit", `Unknown unit framework: ${framework as string}`),
  };
}

function upsert(files: WorkspaceFile[], path: string, content: string) {
  const i = files.findIndex((f) => f.path === path);
  if (i >= 0) files[i] = { path, content };
  else files.push({ path, content });
}

function ensureJavaPackageFree(src: string): string {
  // Keep simple flat classpath; strip package declarations if present.
  return src.replace(/^\s*package\s+[\w.]+;\s*/m, "");
}

export function defaultUnitEntryFile(
  language: CodingConfig["language"],
): string {
  return defaultEntryFile(language, "unit");
}
