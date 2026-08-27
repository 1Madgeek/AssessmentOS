import { describe, expect, it } from "vitest";
import { assertReadOnlySelect, runSqlChecks } from "./sql-executor.js";

describe("assertReadOnlySelect", () => {
  it("allows select and with", () => {
    expect(assertReadOnlySelect("SELECT 1;")).toBe("SELECT 1");
    expect(assertReadOnlySelect("WITH x AS (SELECT 1 AS n) SELECT * FROM x")).toMatch(
      /^WITH/i,
    );
  });

  it("rejects writes and multi-statements", () => {
    expect(() => assertReadOnlySelect("DELETE FROM t")).toThrow(/read-only/i);
    expect(() => assertReadOnlySelect("SELECT 1; SELECT 2")).toThrow(/single/i);
  });
});

describe("runSqlChecks", () => {
  it("passes when query matches expected rows", async () => {
    const results = await runSqlChecks({
      schemaSql:
        "CREATE TABLE employees (id INTEGER, name TEXT, dept TEXT);",
      seedSql:
        "INSERT INTO employees VALUES (1, 'Ada', 'Eng'), (2, 'Bob', 'Sales');",
      query: "SELECT name FROM employees WHERE dept = 'Eng' ORDER BY id;",
      tests: [{ id: "v1", expectedRows: [{ name: "Ada" }] }],
    });
    expect(results).toEqual([
      expect.objectContaining({ id: "v1", passed: true }),
    ]);
  });

  it("fails on wrong result", async () => {
    const results = await runSqlChecks({
      schemaSql: "CREATE TABLE t (id INTEGER);",
      seedSql: "INSERT INTO t VALUES (1);",
      query: "SELECT id FROM t;",
      tests: [{ id: "h1", expectedRows: [{ id: 2 }] }],
    });
    expect(results[0]?.passed).toBe(false);
  });
});
