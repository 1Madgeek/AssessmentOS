import { describe, expect, it } from "vitest";
import { MockRunner } from "./index.js";

const runner = new MockRunner();

describe("MockRunner.runUnitTests (pytest integration)", () => {
  it("passes when solution satisfies tests", async () => {
    const results = await runner.runUnitTests({
      language: "python",
      framework: "pytest",
      entryFile: "solution.py",
      entrySource: "def add(a, b):\n    return a + b\n",
      testCode: `from solution import add

def test_add():
    assert add(2, 3) == 5

def test_zero():
    assert add(0, 0) == 0
`,
    });
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.every((r) => r.passed)).toBe(true);
  }, 30_000);

  it("fails hidden assertions when solution is wrong", async () => {
    const results = await runner.runUnitTests({
      language: "python",
      framework: "pytest",
      entrySource: "def add(a, b):\n    return a - b\n",
      testCode: `from solution import add

def test_add():
    assert add(2, 3) == 5
`,
    });
    expect(results.some((r) => !r.passed)).toBe(true);
  }, 30_000);

  it("accepts java unit mode (does not reject as unsupported)", async () => {
    const results = await runner.runUnitTests({
      language: "java",
      framework: "junit",
      entryFile: "Solution.java",
      entrySource:
        "public class Solution { public static int add(int a, int b) { return a + b; } }\n",
      testCode: `import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
class SolutionTest {
  @Test void addExample() { assertEquals(5, Solution.add(2, 3)); }
}
`,
      timeLimitMs: 60_000,
    });
    expect(results[0]?.stderr ?? "").not.toMatch(/not supported/i);
  }, 90_000);
});

describe("MockRunner.runUnitTests (junit)", () => {
  it("passes when solution satisfies JUnit tests (if JDK available)", async () => {
    const { spawnSync } = await import("node:child_process");
    if (spawnSync("javac", ["-version"], { encoding: "utf8" }).status !== 0) {
      return;
    }
    const results = await runner.runUnitTests({
      language: "java",
      framework: "junit",
      entryFile: "Solution.java",
      entrySource: `public class Solution {
  public static int add(int a, int b) { return a + b; }
}
`,
      testCode: `import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class SolutionTest {
  @Test
  void addExample() {
    assertEquals(5, Solution.add(2, 3));
  }
}
`,
      timeLimitMs: 120_000,
    });
    if (results[0]?.stderr?.includes("JUnit console jar unavailable")) {
      return;
    }
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.every((r) => r.passed)).toBe(true);
  }, 180_000);
});

describe("MockRunner.runUnitTests (googletest)", () => {
  it("passes when solution satisfies GoogleTest (if gtest available)", async () => {
    const { spawnSync } = await import("node:child_process");
    if (spawnSync("g++", ["--version"], { encoding: "utf8" }).status !== 0) {
      return;
    }
    const results = await runner.runUnitTests({
      language: "cpp",
      framework: "googletest",
      entryFile: "solution.cpp",
      entrySource: `int add(int a, int b) { return a + b; }
`,
      starterFiles: [{ path: "solution.h", content: "int add(int a, int b);\n" }],
      testCode: `#include <gtest/gtest.h>
#include "solution.h"

TEST(Add, Example) {
  EXPECT_EQ(5, add(2, 3));
}
`,
      timeLimitMs: 60_000,
    });
    if (
      results[0]?.status === "Compilation Error" &&
      /gtest|googletest/i.test(results[0]?.stderr ?? "")
    ) {
      return;
    }
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.every((r) => r.passed)).toBe(true);
  }, 90_000);
});
describe("MockRunner.runUnitTests (jest integration)", () => {
  it("passes when solution satisfies Jest tests", async () => {
    const results = await runner.runUnitTests({
      language: "javascript",
      framework: "jest",
      entryFile: "solution.js",
      entrySource: "function add(a, b) { return a + b; }\nmodule.exports = { add };\n",
      testCode: `const { add } = require('./solution');
test('adds', () => {
  expect(add(2, 3)).toBe(5);
});
`,
      timeLimitMs: 120_000,
    });
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.every((r) => r.passed)).toBe(true);
  }, 180_000);
});

describe("MockRunner.runTests (I/O)", () => {
  it("passes matching stdout for python", async () => {
    const results = await runner.runTests({
      source: "print(int(input()) + 1)\n",
      languageId: 71,
      tests: [{ id: "t1", stdin: "4\n", expectedStdout: "5\n" }],
    });
    expect(results).toEqual([
      expect.objectContaining({ id: "t1", passed: true, status: "Accepted" }),
    ]);
  }, 15_000);

  it("fails on wrong stdout", async () => {
    const results = await runner.runTests({
      source: "print(0)\n",
      languageId: 71,
      tests: [{ id: "t1", stdin: "", expectedStdout: "1\n" }],
    });
    expect(results[0]?.passed).toBe(false);
  }, 15_000);

  it("passes matching stdout for php when php is installed", async () => {
    const { spawnSync } = await import("node:child_process");
    if (spawnSync("php", ["-v"], { encoding: "utf8" }).status !== 0) {
      return;
    }
    const results = await runner.runTests({
      source: "<?php\necho intval(fgets(STDIN)) + 1;\n",
      languageId: 68,
      tests: [{ id: "t1", stdin: "4\n", expectedStdout: "5" }],
    });
    expect(results[0]?.passed).toBe(true);
  }, 15_000);
});

describe("MockRunner.runUnitTests (phpunit)", () => {
  it("passes when solution satisfies PHPUnit tests", async () => {
    const { spawnSync } = await import("node:child_process");
    if (
      spawnSync("php", ["-v"], { encoding: "utf8" }).status !== 0 ||
      spawnSync("phpunit", ["--version"], { encoding: "utf8" }).status !== 0
    ) {
      return;
    }
    const results = await runner.runUnitTests({
      language: "php",
      framework: "phpunit",
      entryFile: "solution.php",
      entrySource: "<?php\nfunction add($a, $b) { return $a + $b; }\n",
      testCode: `<?php
use PHPUnit\\Framework\\TestCase;
require_once 'solution.php';
class SolutionTest extends TestCase {
  public function testAdd() {
    $this->assertSame(5, add(2, 3));
  }
}
`,
    });
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.every((r) => r.passed)).toBe(true);
  }, 30_000);
});
