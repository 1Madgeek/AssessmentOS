import initSqlJs, { type Database, type SqlJsStatic } from "sql.js";
import { createRequire } from "node:module";
import path from "node:path";
import { rowsMatch, type SqlTestCase } from "@assessment-os/question-sql";

export type SqlRunResult = {
  id: string;
  passed: boolean;
  rows?: Array<Record<string, unknown>>;
  error?: string;
};

let sqlJsPromise: Promise<SqlJsStatic> | null = null;
const require = createRequire(import.meta.url);

function loadSqlJs(): Promise<SqlJsStatic> {
  if (!sqlJsPromise) {
    // sql.js package exports block require.resolve("sql.js/package.json").
    const entry = require.resolve("sql.js");
    const dist = path.dirname(entry);
    sqlJsPromise = initSqlJs({
      locateFile: (file: string) => path.join(dist, file),
    });
  }
  return sqlJsPromise;
}

const FORBIDDEN =
  /\b(insert|update|delete|drop|alter|attach|detach|pragma|create|vacuum|reindex)\b/i;

/** Allow a single SELECT / WITH…SELECT; optional trailing semicolon. */
export function assertReadOnlySelect(query: string): string {
  const trimmed = query.trim().replace(/;+\s*$/, "");
  if (!trimmed) {
    throw new Error("Query is empty");
  }
  if (trimmed.includes(";")) {
    throw new Error("Only a single SQL statement is allowed");
  }
  if (FORBIDDEN.test(trimmed)) {
    throw new Error("Only read-only SELECT queries are allowed");
  }
  if (!/^\s*(with|select)\b/i.test(trimmed)) {
    throw new Error("Query must be a SELECT (or WITH … SELECT)");
  }
  return trimmed;
}

function execStatements(db: Database, sql: string): void {
  const trimmed = sql.trim();
  if (!trimmed) return;
  db.exec(trimmed);
}

function queryToRows(
  db: Database,
  query: string,
  maxRows?: number,
): Array<Record<string, unknown>> {
  const stmt = db.prepare(query);
  const rows: Array<Record<string, unknown>> = [];
  while (stmt.step()) {
    const raw = stmt.getAsObject() as Record<string, unknown>;
    rows.push(raw);
    if (maxRows != null && rows.length > maxRows) {
      stmt.free();
      throw new Error(`Result exceeded maxRows (${maxRows})`);
    }
  }
  stmt.free();
  return rows;
}

export async function runSqlChecks(args: {
  schemaSql: string;
  seedSql?: string;
  query: string;
  tests: SqlTestCase[];
  maxRows?: number;
}): Promise<SqlRunResult[]> {
  const SQL = await loadSqlJs();
  const db = new SQL.Database();
  try {
    execStatements(db, args.schemaSql);
    execStatements(db, args.seedSql ?? "");
    let safeQuery: string;
    try {
      safeQuery = assertReadOnlySelect(args.query);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return args.tests.map((t) => ({
        id: t.id,
        passed: false,
        error: message,
      }));
    }

    let actual: Array<Record<string, unknown>>;
    try {
      actual = queryToRows(db, safeQuery, args.maxRows);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return args.tests.map((t) => ({
        id: t.id,
        passed: false,
        error: message,
      }));
    }

    return args.tests.map((t) => {
      const passed = rowsMatch(actual, t.expectedRows);
      return {
        id: t.id,
        passed,
        rows: actual,
        error: passed ? undefined : "Result set did not match expected rows",
      };
    });
  } finally {
    db.close();
  }
}
