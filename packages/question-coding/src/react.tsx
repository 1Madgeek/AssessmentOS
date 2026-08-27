"use client";

import type { ComponentType } from "react";
import MonacoEditor from "@monaco-editor/react";
import type { CodingAnswer, CodingConfig, CodingWorkspace } from "./index.js";

type MonacoEditorProps = {
  height?: string;
  language?: string;
  value?: string;
  options?: Record<string, unknown>;
  onChange?: (value: string | undefined) => void;
};

// NodeNext + CJS default export interop
const Editor = MonacoEditor as unknown as ComponentType<MonacoEditorProps>;

export function CodingBuilder({
  value,
  onChange,
}: {
  value: CodingConfig;
  onChange: (config: CodingConfig) => void;
}) {
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <label>
        Language{" "}
        <select
          value={value.language}
          onChange={(e) =>
            onChange({
              ...value,
              language: e.target.value as CodingConfig["language"],
            })
          }
        >
          <option value="javascript">JavaScript</option>
          <option value="python">Python</option>
          <option value="typescript">TypeScript</option>
          <option value="java">Java</option>
          <option value="cpp">C++</option>
        </select>
      </label>
      <label>
        Starter code
        <textarea
          style={{ width: "100%", minHeight: 160, fontFamily: "monospace" }}
          value={value.starterCode}
          onChange={(e) => onChange({ ...value, starterCode: e.target.value })}
        />
      </label>
      <TestCaseEditor
        title="Visible tests"
        tests={value.visibleTests}
        onChange={(visibleTests) => onChange({ ...value, visibleTests })}
      />
      <TestCaseEditor
        title="Hidden tests"
        tests={value.hiddenTests}
        onChange={(hiddenTests) => onChange({ ...value, hiddenTests })}
      />
    </div>
  );
}

function TestCaseEditor({
  title,
  tests,
  onChange,
}: {
  title: string;
  tests: CodingConfig["visibleTests"];
  onChange: (tests: CodingConfig["visibleTests"]) => void;
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
            placeholder="stdin"
            value={t.stdin}
            onChange={(e) => {
              const next = tests.map((x, idx) =>
                idx === i ? { ...x, stdin: e.target.value } : x,
              );
              onChange(next);
            }}
          />
          <textarea
            placeholder="expected stdout"
            value={t.expectedStdout}
            onChange={(e) => {
              const next = tests.map((x, idx) =>
                idx === i ? { ...x, expectedStdout: e.target.value } : x,
              );
              onChange(next);
            }}
          />
          <button
            type="button"
            onClick={() => onChange(tests.filter((_, idx) => idx !== i))}
          >
            Remove test
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
              stdin: "",
              expectedStdout: "",
              label: `Test ${tests.length + 1}`,
            },
          ])
        }
      >
        Add test
      </button>
    </div>
  );
}

const LANGUAGE_LABELS: Record<CodingConfig["language"], string> = {
  javascript: "JavaScript (Node.js)",
  typescript: "TypeScript",
  python: "Python 3",
  java: "Java",
  cpp: "C++",
};

function monacoLanguage(lang: CodingConfig["language"]): string {
  if (lang === "cpp") return "cpp";
  if (lang === "javascript") return "javascript";
  return lang;
}

export function CodingRenderer({
  config,
  answer,
  workspace,
  readOnly,
  onChange,
  onWorkspaceChange,
  onRunVisible,
}: {
  config: CodingConfig;
  answer: CodingAnswer | null;
  workspace?: CodingWorkspace | null;
  readOnly?: boolean;
  onChange: (answer: CodingAnswer) => void;
  onWorkspaceChange?: (workspace: CodingWorkspace) => void;
  onRunVisible?: () => Promise<unknown>;
}) {
  const source =
    answer?.source ??
    workspace?.source ??
    config.starterCode ??
    "";

  function setSource(nextSource: string) {
    if (readOnly) return;
    const next = { source: nextSource };
    onChange(next);
    onWorkspaceChange?.({
      source: next.source,
      lastVisibleResults: workspace?.lastVisibleResults,
    });
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 10,
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 12px",
          borderRadius: 8,
          background: "#f6f8fa",
          border: "1px solid #d0d7de",
        }}
      >
        <div style={{ display: "grid", gap: 2 }}>
          <div style={{ fontSize: 12, color: "#656d76" }}>Required language</div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>
            {LANGUAGE_LABELS[config.language]}
          </div>
          <div style={{ fontSize: 12, color: "#656d76" }}>
            Write and submit in this language only. Switching languages is not
            supported for this question.
          </div>
        </div>
        {!readOnly && config.starterCode ? (
          <button
            type="button"
            onClick={() => setSource(config.starterCode)}
            style={{
              padding: "6px 10px",
              borderRadius: 6,
              border: "1px solid #d0d7de",
              background: "#fff",
              cursor: "pointer",
            }}
          >
            Reset to starter
          </button>
        ) : null}
      </div>
      <div
        style={{
          height: 360,
          border: "1px solid #d0d7de",
          borderRadius: 8,
          overflow: "hidden",
        }}
      >
        <Editor
          height="360px"
          language={monacoLanguage(config.language)}
          value={source}
          options={{ readOnly, minimap: { enabled: false }, fontSize: 14 }}
          onChange={(value) => setSource(value ?? "")}
        />
      </div>
      {onRunVisible && !readOnly ? (
        <button type="button" onClick={() => void onRunVisible()}>
          Run visible tests
        </button>
      ) : null}
      {workspace?.lastVisibleResults?.length ? (
        <div style={{ display: "grid", gap: 6 }}>
          <strong>Visible test results</strong>
          {workspace.lastVisibleResults.map((r) => (
            <div key={r.id} style={{ color: r.passed ? "#1a7f37" : "#cf222e" }}>
              {r.passed ? "PASS" : "FAIL"} — {r.status ?? ""}{" "}
              {r.stderr ? `(${r.stderr.slice(0, 160)})` : ""}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function CodingReviewer({
  answer,
  workspace,
  score,
  maxScore,
  gradeDetails,
}: {
  config: CodingConfig;
  answer: CodingAnswer | null;
  workspace?: CodingWorkspace | null;
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
        {answer?.source ?? workspace?.source ?? "(no code)"}
      </pre>
    </div>
  );
}

export {
  codingPlugin,
  validateCodingConfig,
  gradeCoding,
  JUDGE0_LANGUAGE_IDS,
} from "./index.js";
export type { CodingConfig, CodingAnswer, CodingWorkspace } from "./index.js";
