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
  const mode = value.mode ?? "io";

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <label>
        Language{" "}
        <select
          value={value.language}
          onChange={(e) => {
            const language = e.target.value as CodingConfig["language"];
            const next: CodingConfig = { ...value, language };
            if (mode === "unit") {
              if (language === "python") {
                next.framework = "pytest";
                next.entryFile = "solution.py";
              } else if (language === "javascript" || language === "typescript") {
                next.framework = "jest";
                next.entryFile =
                  language === "typescript" ? "solution.ts" : "solution.js";
              } else if (language === "php") {
                next.framework = "phpunit";
                next.entryFile = "solution.php";
              }
            }
            onChange(next);
          }}
        >
          <option value="javascript">JavaScript</option>
          <option value="python">Python</option>
          <option value="typescript">TypeScript</option>
          <option value="php">PHP</option>
          <option value="java">Java (I/O only)</option>
          <option value="cpp">C++ (I/O only)</option>
        </select>
      </label>

      <label style={{ display: "flex", gap: 16, alignItems: "center" }}>
        Test mode
        <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input
            type="radio"
            name="coding-mode"
            checked={mode === "unit"}
            onChange={() =>
              onChange({
                ...value,
                mode: "unit",
                framework:
                  value.language === "python"
                    ? "pytest"
                    : value.language === "javascript" ||
                        value.language === "typescript"
                      ? "jest"
                      : value.language === "php"
                        ? "phpunit"
                        : value.framework,
                entryFile:
                  value.entryFile ??
                  (value.language === "python"
                    ? "solution.py"
                    : value.language === "typescript"
                      ? "solution.ts"
                      : value.language === "php"
                        ? "solution.php"
                        : "solution.js"),
              })
            }
          />
          Unit tests (pytest / Jest / PHPUnit)
        </label>
        <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input
            type="radio"
            name="coding-mode"
            checked={mode === "io"}
            onChange={() => onChange({ ...value, mode: "io" })}
          />
          stdin / stdout
        </label>
      </label>

      <label>
        Starter code
        <textarea
          style={{ width: "100%", minHeight: 160, fontFamily: "monospace" }}
          value={value.starterCode}
          onChange={(e) => onChange({ ...value, starterCode: e.target.value })}
        />
      </label>

      {mode === "unit" ? (
        <>
          <p style={{ margin: 0, fontSize: 13, color: "#656d76" }}>
            Unit tests call candidate functions/classes. Visible suite runs on
            “Run visible tests”; hidden suite grades on submit. Candidates never
            see hidden test code.
          </p>
          <label>
            Visible test file ({value.framework ?? "pytest/jest/phpunit"})
            <textarea
              style={{ width: "100%", minHeight: 140, fontFamily: "monospace" }}
              value={value.visibleTestCode ?? ""}
              onChange={(e) =>
                onChange({ ...value, visibleTestCode: e.target.value })
              }
              placeholder={
                value.language === "python"
                  ? "from solution import add\n\ndef test_add():\n    assert add(2, 3) == 5\n"
                  : value.language === "php"
                    ? "<?php\nuse PHPUnit\\Framework\\TestCase;\nrequire_once 'solution.php';\nclass SolutionTest extends TestCase {\n  public function testAdd() {\n    $this->assertSame(5, add(2, 3));\n  }\n}\n"
                    : "const { add } = require('./solution');\ntest('adds', () => expect(add(2,3)).toBe(5));\n"
              }
            />
          </label>
          <label>
            Hidden test file (scoring)
            <textarea
              style={{ width: "100%", minHeight: 140, fontFamily: "monospace" }}
              value={value.hiddenTestCode ?? ""}
              onChange={(e) =>
                onChange({ ...value, hiddenTestCode: e.target.value })
              }
            />
          </label>
        </>
      ) : (
        <>
          <TestCaseEditor
            title="Visible I/O tests (candidate can run)"
            tests={value.visibleTests}
            onChange={(visibleTests) => onChange({ ...value, visibleTests })}
          />
          <TestCaseEditor
            title="Hidden I/O tests (scoring)"
            tests={value.hiddenTests}
            onChange={(hiddenTests) => onChange({ ...value, hiddenTests })}
          />
        </>
      )}
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
  php: "PHP",
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
            {(config.mode ?? "io") === "unit"
              ? " Tests call your functions/classes — do not rely on printing to stdout."
              : ""}
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
