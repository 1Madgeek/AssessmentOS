"use client";

import { useMemo, useState, type ComponentType } from "react";
import MonacoEditor from "@monaco-editor/react";
import {
  applyUnitModeDefaults,
  defaultEntryFile,
  defaultUnitStarterCode,
  defaultVisibleUnitTestCode,
  resolveWorkspaceFiles,
  type CodingAnswer,
  type CodingConfig,
  type CodingWorkspace,
  type ScoringMode,
} from "./index.js";

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
  const entryFile =
    value.entryFile ?? defaultEntryFile(value.language, mode);
  const starterFiles = value.starterFiles ?? [];

  function setEntryFile(next: string) {
    onChange({ ...value, entryFile: next });
  }

  function updateStarterFile(
    index: number,
    patch: Partial<{ path: string; content: string }>,
  ) {
    const next = starterFiles.map((f, i) =>
      i === index ? { ...f, ...patch } : f,
    );
    onChange({ ...value, starterFiles: next });
  }

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
              onChange(
                applyUnitModeDefaults({
                  ...value,
                  language,
                  starterCode: defaultUnitStarterCode(language),
                  visibleTestCode: defaultVisibleUnitTestCode(language),
                }),
              );
              return;
            }
            next.entryFile = defaultEntryFile(language, "io");
            onChange(next);
          }}
        >
          <option value="javascript">JavaScript</option>
          <option value="python">Python</option>
          <option value="typescript">TypeScript</option>
          <option value="php">PHP</option>
          <option value="java">Java</option>
          <option value="cpp">C++</option>
        </select>
      </label>

      <label style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
        Test mode
        <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input
            type="radio"
            name="coding-mode"
            checked={mode === "unit"}
            onChange={() => onChange(applyUnitModeDefaults(value))}
          />
          Unit tests (pytest / Jest / PHPUnit / JUnit / GoogleTest)
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
      <p style={{ margin: 0, fontSize: 13, color: "#656d76" }}>
        {mode === "unit"
          ? "Unit mode runs a test framework against candidate functions (no stdin). Switch language to refresh starter + sample tests when fields are still empty."
          : "I/O mode feeds stdin and compares stdout (or a custom Python checker). Prefer unit mode when testing APIs/functions."}
      </p>

      <div
        style={{
          display: "flex",
          gap: 16,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <label>
          Time limit (ms){" "}
          <input
            type="number"
            min={1000}
            step={1000}
            style={{ width: 100 }}
            value={value.timeLimitMs ?? 15000}
            onChange={(e) =>
              onChange({
                ...value,
                timeLimitMs: e.target.value
                  ? Number(e.target.value)
                  : 15000,
              })
            }
          />
        </label>
        <label>
          Memory (MB){" "}
          <input
            type="number"
            min={64}
            step={64}
            style={{ width: 80 }}
            value={value.memoryMb ?? 256}
            onChange={(e) =>
              onChange({
                ...value,
                memoryMb: e.target.value ? Number(e.target.value) : 256,
              })
            }
          />
        </label>
        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          Scoring
          <select
            value={(value.scoring ?? "proportional") as ScoringMode}
            onChange={(e) =>
              onChange({
                ...value,
                scoring: e.target.value as ScoringMode,
              })
            }
          >
            <option value="proportional">Proportional</option>
            <option value="all_or_nothing">All or nothing</option>
          </select>
        </label>
      </div>

      <label>
        Entry file{" "}
        <input
          value={entryFile}
          onChange={(e) => setEntryFile(e.target.value.trim() || entryFile)}
          style={{ width: 200, fontFamily: "monospace" }}
        />
      </label>

      <label>
        Starter code ({entryFile})
        <textarea
          style={{ width: "100%", minHeight: 160, fontFamily: "monospace" }}
          value={value.starterCode}
          onChange={(e) => onChange({ ...value, starterCode: e.target.value })}
        />
      </label>

      <div style={{ border: "1px solid #d0d7de", borderRadius: 8, padding: 12 }}>
        <strong>Additional starter files</strong>
        <p style={{ margin: "4px 0 8px", fontSize: 13, color: "#656d76" }}>
          Optional project files (headers, helpers, fixtures). Entry file content
          comes from starter code above. Use “Add file” for multi-file take-homes
          (max 20 files / 256KB total).
        </p>
        {starterFiles.map((f, i) => (
          <div key={i} style={{ display: "grid", gap: 6, marginTop: 8 }}>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                placeholder="path (e.g. util.py)"
                value={f.path}
                style={{ flex: 1, fontFamily: "monospace" }}
                onChange={(e) => updateStarterFile(i, { path: e.target.value })}
              />
              <button
                type="button"
                onClick={() =>
                  onChange({
                    ...value,
                    starterFiles: starterFiles.filter((_, idx) => idx !== i),
                  })
                }
              >
                Remove
              </button>
            </div>
            <textarea
              style={{ width: "100%", minHeight: 80, fontFamily: "monospace" }}
              value={f.content}
              onChange={(e) =>
                updateStarterFile(i, { content: e.target.value })
              }
            />
          </div>
        ))}
        <button
          type="button"
          style={{ marginTop: 8 }}
          onClick={() =>
            onChange({
              ...value,
              starterFiles: [
                ...starterFiles,
                { path: `extra${starterFiles.length + 1}.txt`, content: "" },
              ],
            })
          }
        >
          Add file
        </button>
      </div>

      {mode === "unit" ? (
        <>
          <p style={{ margin: 0, fontSize: 13, color: "#656d76" }}>
            Unit tests call candidate functions/classes. Visible suite runs on
            “Run”; hidden suite grades on submit. Candidates never
            see hidden test code.
          </p>
          <label>
            Visible test file ({value.framework ?? "pytest/jest/phpunit/junit/gtest"})
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
                    : value.language === "java"
                      ? "import org.junit.jupiter.api.Test;\nimport static org.junit.jupiter.api.Assertions.*;\n\nclass SolutionTest {\n  @Test\n  void addExample() {\n    assertEquals(5, Solution.add(2, 3));\n  }\n}\n"
                      : value.language === "cpp"
                        ? "#include <gtest/gtest.h>\n#include \"solution.h\"\n\nTEST(Add, Example) {\n  EXPECT_EQ(5, add(2, 3));\n}\n"
                        : "const { add } = require('./solution');\ntest('adds', () => expect(add(2,3)).toBe(5));\n"
              }
            />
          </label>
          <label>
            Hidden test file (scoring)
            <textarea
              style={{ width: "100%", minHeight: 140, fontFamily: "monospace" }}
              value={value.hiddenTestCode ?? ""}
              placeholder={defaultVisibleUnitTestCode(value.language)}
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
          <label>
            Custom checker (Python, optional)
            <textarea
              style={{ width: "100%", minHeight: 100, fontFamily: "monospace" }}
              value={value.checkerCode ?? ""}
              placeholder={
                "# Receives candidate stdout on stdin.\n# Env: EXPECTED_STDOUT, TEST_STDIN\n# Exit 0 = pass, non-zero = fail\nimport sys, os\nactual = sys.stdin.read()\nassert actual.strip() == os.environ.get('EXPECTED_STDOUT', '').strip()\n"
              }
              onChange={(e) =>
                onChange({
                  ...value,
                  checkerCode: e.target.value || undefined,
                })
              }
            />
          </label>
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

function monacoLanguage(lang: CodingConfig["language"], path?: string): string {
  if (path?.endsWith(".py")) return "python";
  if (path?.endsWith(".ts")) return "typescript";
  if (path?.endsWith(".js")) return "javascript";
  if (path?.endsWith(".java")) return "java";
  if (path?.endsWith(".cpp") || path?.endsWith(".h") || path?.endsWith(".hpp"))
    return "cpp";
  if (path?.endsWith(".php")) return "php";
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
  const resolved = useMemo(
    () =>
      resolveWorkspaceFiles({
        config,
        answer,
        workspace,
      }),
    [config, answer, workspace],
  );

  const paths = Object.keys(resolved.files).sort((a, b) => {
    if (a === resolved.entryFile) return -1;
    if (b === resolved.entryFile) return 1;
    return a.localeCompare(b);
  });

  const [activePath, setActivePath] = useState(resolved.entryFile);
  const currentPath = paths.includes(activePath) ? activePath : resolved.entryFile;

  function commitFiles(nextFiles: Record<string, string>) {
    if (readOnly) return;
    const entrySource = nextFiles[resolved.entryFile] ?? "";
    const nextAnswer: CodingAnswer = {
      source: entrySource,
      files: nextFiles,
    };
    onChange(nextAnswer);
    onWorkspaceChange?.({
      source: entrySource,
      files: nextFiles,
      lastVisibleResults: workspace?.lastVisibleResults,
    });
  }

  function setFileContent(path: string, content: string) {
    commitFiles({ ...resolved.files, [path]: content });
  }

  function addFile() {
    if (readOnly) return;
    let name = "untitled.txt";
    let n = 1;
    while (resolved.files[name] !== undefined) {
      name = `untitled${n}.txt`;
      n += 1;
    }
    commitFiles({ ...resolved.files, [name]: "" });
    setActivePath(name);
  }

  function resetToStarter() {
    if (readOnly) return;
    const files: Record<string, string> = {};
    for (const f of config.starterFiles ?? []) {
      files[f.path] = f.content;
    }
    const entry =
      config.entryFile ?? defaultEntryFile(config.language, config.mode ?? "io");
    files[entry] = config.starterCode ?? "";
    commitFiles(files);
    setActivePath(entry);
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
        {!readOnly ? (
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={addFile}
              style={{
                padding: "6px 10px",
                borderRadius: 6,
                border: "1px solid #d0d7de",
                background: "#fff",
                cursor: "pointer",
              }}
            >
              Add file
            </button>
            {config.starterCode || (config.starterFiles?.length ?? 0) > 0 ? (
              <button
                type="button"
                onClick={resetToStarter}
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
        ) : null}
      </div>

      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {paths.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setActivePath(p)}
            style={{
              padding: "6px 10px",
              borderRadius: 6,
              border:
                p === currentPath ? "2px solid #0969da" : "1px solid #d0d7de",
              background: p === currentPath ? "#ddf4ff" : "#fff",
              fontFamily: "ui-monospace, monospace",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            {p}
            {p === resolved.entryFile ? " ★" : ""}
          </button>
        ))}
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
          language={monacoLanguage(config.language, currentPath)}
          value={resolved.files[currentPath] ?? ""}
          options={{ readOnly, minimap: { enabled: false }, fontSize: 14 }}
          onChange={(value) => setFileContent(currentPath, value ?? "")}
        />
      </div>
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
  config,
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
  let files: Record<string, string> = {};
  try {
    files = resolveWorkspaceFiles({ config, answer, workspace }).files;
  } catch {
    const source = answer?.source ?? workspace?.source ?? "";
    if (source) files = { "(source)": source };
  }

  const results = Array.isArray(gradeDetails?.results)
    ? (gradeDetails!.results as Array<{
        id: string;
        passed: boolean;
        status?: string;
        awardedPoints?: number;
        stderr?: string;
      }>)
    : [];

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <p>
        Score: {score ?? 0} / {maxScore}
        {gradeDetails?.scoring
          ? ` · ${String(gradeDetails.scoring)}`
          : ""}
      </p>
      {results.length > 0 ? (
        <div style={{ display: "grid", gap: 4 }}>
          <strong>Per-test results</strong>
          {results.map((r) => (
            <div
              key={r.id}
              style={{
                fontSize: 13,
                color: r.passed ? "#1a7f37" : "#cf222e",
              }}
            >
              {r.passed ? "PASS" : "FAIL"} — {r.id}
              {r.status ? ` (${r.status})` : ""}
              {typeof r.awardedPoints === "number"
                ? ` · ${r.awardedPoints.toFixed(1)} pts`
                : ""}
            </div>
          ))}
        </div>
      ) : gradeDetails ? (
        <pre style={{ background: "#f6f8fa", padding: 12, borderRadius: 8 }}>
          {JSON.stringify(gradeDetails, null, 2)}
        </pre>
      ) : null}
      {Object.entries(files).map(([path, content]) => (
        <div key={path}>
          <div
            style={{
              fontSize: 12,
              fontFamily: "ui-monospace, monospace",
              color: "#656d76",
              marginBottom: 4,
            }}
          >
            {path}
          </div>
          <pre
            style={{
              background: "#0d1117",
              color: "#e6edf3",
              padding: 12,
              borderRadius: 8,
              overflow: "auto",
              margin: 0,
            }}
          >
            {content || "(empty)"}
          </pre>
        </div>
      ))}
      {Object.keys(files).length === 0 ? (
        <pre
          style={{
            background: "#0d1117",
            color: "#e6edf3",
            padding: 12,
            borderRadius: 8,
          }}
        >
          (no code)
        </pre>
      ) : null}
    </div>
  );
}

export {
  codingPlugin,
  validateCodingConfig,
  gradeCoding,
  JUDGE0_LANGUAGE_IDS,
  resolveWorkspaceFiles,
} from "./index.js";
export type { CodingConfig, CodingAnswer, CodingWorkspace } from "./index.js";
