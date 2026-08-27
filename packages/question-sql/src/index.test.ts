import { describe, expect, it } from "vitest";
import { gradeSql, rowsMatch, validateSqlConfig } from "./index.js";

describe("validateSqlConfig", () => {
  it("requires at least one test", () => {
    expect(() =>
      validateSqlConfig({
        schemaSql: "CREATE TABLE t (id INT);",
        visibleTests: [],
        hiddenTests: [],
      }),
    ).toThrow(/visibleTests and\/or hiddenTests/);
  });

  it("accepts schema + hidden checks", () => {
    const config = validateSqlConfig({
      schemaSql: "CREATE TABLE t (id INTEGER);",
      seedSql: "INSERT INTO t VALUES (1);",
      hiddenTests: [{ id: "h1", expectedRows: [{ id: 1 }] }],
    });
    expect(config.dialect).toBe("sqlite");
  });
});

describe("rowsMatch", () => {
  it("is column-case insensitive and order-sensitive", () => {
    expect(
      rowsMatch([{ Name: "Ada", id: 1 }], [{ id: 1, name: "Ada" }]),
    ).toBe(true);
    expect(
      rowsMatch([{ id: 1 }, { id: 2 }], [{ id: 2 }, { id: 1 }]),
    ).toBe(false);
  });
});

describe("gradeSql", () => {
  const config = validateSqlConfig({
    schemaSql: "CREATE TABLE t (id INTEGER);",
    hiddenTests: [
      { id: "h1", expectedRows: [{ id: 1 }] },
      { id: "h2", expectedRows: [{ id: 2 }] },
    ],
  });

  it("scores proportionally", async () => {
    const grade = await gradeSql({
      config,
      answer: { query: "SELECT 1" },
      points: 20,
      hiddenResults: [
        { id: "h1", passed: true },
        { id: "h2", passed: false },
      ],
    });
    expect(grade.score).toBe(10);
  });
});
