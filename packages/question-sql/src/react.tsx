"use client";

import type { SqlAnswer, SqlConfig, SqlTestCase, SqlWorkspace } from "./index.js";

export function SqlBuilder({
  value,
  onChange,
}: {
  value: SqlConfig;
  onChange: (config: SqlConfig) => void;
}) {
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <p style={{ margin: 0, fontSize: 13, color: "#656d76" }}>
        SQLite only. Candidates write a SELECT against your schema + seed data.
        Hidden expected result sets grade on submit.
      </p>
      <label>
        Schema SQL
        <textarea
          style={{ width: "100%", minHeight: 100, fontFamily: "monospace" }}
          value={value.schemaSql}
          onChange={(e) => onChange({ ...value, schemaSql: e.target.value })}
          placeholder="CREATE TABLE employees (id INTEGER, name TEXT, dept TEXT);"
        />
      </label>
      <label>
        Seed SQL
        <textarea
          style={{ width: "100%", minHeight: 100, fontFamily: "monospace" }}
          value={value.seedSql}
          onChange={(e) => onChange({ ...value, seedSql: e.target.value })}
          placeholder="INSERT INTO employees VALUES (1, 'Ada', 'Eng');"
        />
      </label>
      <label>
        Starter query
        <textarea
          style={{ width: "100%", minHeight: 60, fontFamily: "monospace" }}
          value={value.starterQuery}
          onChange={(e) => onChange({ ...value, starterQuery: e.target.value })}
        />
      </label>
      <ExpectedRowsEditor
        title="Visible checks (candidate can run)"
        tests={value.visibleTests}
        onChange={(visibleTests) => onChange({ ...value, visibleTests })}
      />
      <ExpectedRowsEditor
        title="Hidden checks (scoring)"
        tests={value.hiddenTests}
        onChange={(hiddenTests) => onChange({ ...value, hiddenTests })}
      />
    </div>
  );
}

function ExpectedRowsEditor({
  title,
  tests,
  onChange,
}: {
  title: string;
  tests: SqlTestCase[];
  onChange: (tests: SqlTestCase[]) => void;
}) {
  return (
    <div style={{ border: "1px solid #d0d7de", borderRadius: 8, padding: 12 }}>
      <strong>{title}</strong>
      {tests.map((t, i) => (
        <div key={t.id} style={{ display: "grid", gap: 6, marginTop: 8 }}>
          <input
            placeholder="Label"
            value={t.label ?? ""}
            onChange={(e) => {
              const next = tests.map((x, idx) =>
                idx === i ? { ...x, label: e.target.value } : x,
              );
              onChange(next);
            }}
          />
          <textarea
            placeholder='Expected rows JSON array, e.g. [{"name":"Ada"}]'
            style={{ fontFamily: "monospace", minHeight: 80 }}
            value={JSON.stringify(t.expectedRows, null, 2)}
            onChange={(e) => {
              try {
                const parsed = JSON.parse(e.target.value) as unknown;
                if (!Array.isArray(parsed)) return;
                const next = tests.map((x, idx) =>
                  idx === i
                    ? {
                        ...x,
                        expectedRows: parsed as Array<Record<string, unknown>>,
                      }
                    : x,
                );
                onChange(next);
              } catch {
                // keep typing invalid JSON
              }
            }}
          />
          <button
            type="button"
            onClick={() => onChange(tests.filter((_, idx) => idx !== i))}
          >
            Remove check
          </button>
        </div>
      ))}
      <button
        type="button"
        style={{ marginTop: 8 }}
        onClick={() =>
          onChange([
            ...tests,
            {
              id: crypto.randomUUID(),
              label: `Check ${tests.length + 1}`,
              expectedRows: [],
            },
          ])
        }
      >
        Add check
      </button>
    </div>
  );
}

export function SqlRenderer({
  config,
  answer,
  workspace,
  readOnly,
  onChange,
  onWorkspaceChange,
  onRunVisible,
}: {
  config: SqlConfig;
  answer: SqlAnswer | null;
  workspace?: SqlWorkspace | null;
  readOnly?: boolean;
  onChange: (answer: SqlAnswer) => void;
  onWorkspaceChange?: (workspace: SqlWorkspace) => void;
  onRunVisible?: () => Promise<unknown>;
}) {
  const query =
    answer?.query ?? workspace?.query ?? config.starterQuery ?? "SELECT ";

  function setQuery(nextQuery: string) {
    if (readOnly) return;
    onChange({ query: nextQuery });
    onWorkspaceChange?.({
      query: nextQuery,
      lastVisibleResults: workspace?.lastVisibleResults,
    });
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div
        style={{
          padding: "10px 12px",
          borderRadius: 8,
          background: "#f6f8fa",
          border: "1px solid #d0d7de",
          fontSize: 13,
          color: "#656d76",
        }}
      >
        Dialect: SQLite. Write a single SELECT (or WITH … SELECT). Schema and
        seed data are already loaded.
      </div>
      <textarea
        style={{
          width: "100%",
          minHeight: 160,
          fontFamily: "ui-monospace, monospace",
          padding: 12,
          borderRadius: 8,
          border: "1px solid #d0d7de",
        }}
        value={query}
        readOnly={readOnly}
        onChange={(e) => setQuery(e.target.value)}
      />
      {onRunVisible && !readOnly ? (
        <button
          type="button"
          onClick={() => void onRunVisible()}
          style={{
            alignSelf: "start",
            borderRadius: 0,
            padding: "8px 16px",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "inherit",
            background: "var(--primary)",
            color: "var(--primary-foreground)",
            border: "1px solid var(--primary)",
          }}
        >
          Run
        </button>
      ) : null}
      {workspace?.lastVisibleResults?.length ? (
        <div style={{ display: "grid", gap: 8 }}>
          <strong>Visible results</strong>
          {workspace.lastVisibleResults.map((r) => (
            <div key={r.id}>
              <div style={{ color: r.passed ? "#1a7f37" : "#cf222e" }}>
                {r.passed ? "PASS" : "FAIL"} — {r.id}
                {r.error ? ` (${r.error.slice(0, 160)})` : ""}
              </div>
              {r.rows?.length ? (
                <pre
                  style={{
                    margin: "4px 0 0",
                    background: "#0d1117",
                    color: "#e6edf3",
                    padding: 8,
                    borderRadius: 6,
                    overflow: "auto",
                    fontSize: 12,
                  }}
                >
                  {JSON.stringify(r.rows, null, 2)}
                </pre>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function SqlReviewer({
  answer,
  score,
  maxScore,
  gradeDetails,
}: {
  config: SqlConfig;
  answer: SqlAnswer | null;
  workspace?: SqlWorkspace | null;
  score: number | null;
  maxScore: number;
  gradeDetails?: Record<string, unknown> | null;
}) {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <p>
        Score: {score ?? 0} / {maxScore}
      </p>
      {gradeDetails ? (
        <pre style={{ background: "#f6f8fa", padding: 12, borderRadius: 8 }}>
          {JSON.stringify(gradeDetails, null, 2)}
        </pre>
      ) : null}
      <pre
        style={{
          background: "#0d1117",
          color: "#e6edf3",
          padding: 12,
          borderRadius: 8,
          overflow: "auto",
        }}
      >
        {answer?.query ?? "(no query)"}
      </pre>
    </div>
  );
}

export {
  sqlPlugin,
  validateSqlConfig,
  gradeSql,
  rowsMatch,
} from "./index.js";
export type {
  SqlConfig,
  SqlAnswer,
  SqlWorkspace,
  SqlTestCase,
} from "./index.js";
