"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { BankQuestion, OrgRole } from "@assessment-os/sdk";
import { getErrorMessage } from "@assessment-os/sdk";
import {
  McqBuilder,
  type McqConfig,
} from "@assessment-os/question-mcq/react";
import {
  CodingBuilder,
  type CodingConfig,
} from "@assessment-os/question-coding/react";
import {
  SqlBuilder,
  type SqlConfig,
} from "@assessment-os/question-sql/react";
import {
  TextBuilder,
  type TextConfig,
} from "@assessment-os/question-text/react";
import {
  RichTextEditor,
} from "@assessment-os/richtext/react";
import {
  type RichDoc,
  coerceRichDoc,
  emptyRichDoc,
  richDocToPlainText,
} from "@assessment-os/richtext";
import { api, getActiveOrgId, setActiveOrgId } from "@/lib/api";
import {
  btnPrimary,
  btnSecondary,
  cardStyle,
  inputStyle,
  pageStyle,
} from "@/lib/styles";

type BankType = "mcq" | "coding" | "sql" | "text";

const TYPE_LABELS: Record<BankType, string> = {
  mcq: "MCQ",
  coding: "Coding",
  sql: "SQL",
  text: "Short answer",
};

const defaultMcq: McqConfig = {
  multiSelect: false,
  options: [
    { id: "a", label: "Option A" },
    { id: "b", label: "Option B" },
  ],
  correctOptionIds: ["a"],
};

const defaultCoding: CodingConfig = {
  language: "python",
  mode: "io",
  starterCode: "print('hello')\n",
  starterFiles: [],
  visibleTests: [
    { id: "v1", stdin: "", expectedStdout: "hello\n", label: "Example" },
  ],
  hiddenTests: [],
  visibleTestCode: "",
  hiddenTestCode: "",
  scoring: "proportional",
  timeLimitMs: 15000,
  memoryMb: 256,
};

const defaultSql: SqlConfig = {
  dialect: "sqlite",
  schemaSql: "CREATE TABLE employees (id INTEGER, name TEXT, dept TEXT);\n",
  seedSql:
    "INSERT INTO employees VALUES (1, 'Ada', 'Eng'), (2, 'Bob', 'Sales');\n",
  starterQuery: "SELECT name FROM employees WHERE dept = 'Eng';\n",
  visibleTests: [
    { id: "v1", label: "Eng names", expectedRows: [{ name: "Ada" }] },
  ],
  hiddenTests: [],
};

const defaultText: TextConfig = {
  gradingMode: "exact",
  acceptedAnswers: ["answer"],
  caseSensitive: false,
  normalizeWhitespace: true,
};

type EditorState =
  | { kind: "create"; type: BankType }
  | { kind: "edit"; type: BankType; id: string };

function configSummary(item: BankQuestion): string {
  const cfg = item.config as Record<string, unknown>;
  if (item.type === "coding") {
    const lang = String(cfg.language ?? "?");
    const mode = String(cfg.mode ?? "io");
    return `${lang} · ${mode}`;
  }
  if (item.type === "mcq") {
    const opts = Array.isArray(cfg.options) ? cfg.options.length : 0;
    return `${opts} options`;
  }
  if (item.type === "sql") {
    return String(cfg.dialect ?? "sqlite");
  }
  if (item.type === "text") {
    return String(cfg.gradingMode ?? "exact");
  }
  return "";
}

export default function QuestionBankPage() {
  const router = useRouter();
  const [items, setItems] = useState<BankQuestion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [role, setRole] = useState<OrgRole | null>(null);
  const canWrite = role !== "reviewer";

  const [editor, setEditor] = useState<EditorState | null>(null);
  const [title, setTitle] = useState("");
  const [promptDoc, setPromptDoc] = useState<RichDoc>(emptyRichDoc());
  const [tags, setTags] = useState("");
  const [points, setPoints] = useState(10);
  const [timeLimit, setTimeLimit] = useState(120);
  const [mcqConfig, setMcqConfig] = useState<McqConfig>(defaultMcq);
  const [codingConfig, setCodingConfig] = useState<CodingConfig>(defaultCoding);
  const [sqlConfig, setSqlConfig] = useState<SqlConfig>(defaultSql);
  const [textConfig, setTextConfig] = useState<TextConfig>(defaultText);

  async function reload() {
    setItems(await api.listBankQuestions());
  }

  useEffect(() => {
    void (async () => {
      const me = await api.me();
      if (!me) {
        router.replace("/admin/login");
        return;
      }
      const activeId =
        getActiveOrgId() ??
        me.activeOrganization?.id ??
        me.organizations[0]?.id ??
        null;
      if (activeId) setActiveOrgId(activeId);
      setRole(me.role);
      await reload();
    })().catch((err) =>
      setError(err instanceof Error ? err.message : "Failed to load"),
    );
  }, [router]);

  function resetForm() {
    setTitle("");
    setPromptDoc(emptyRichDoc());
    setTags("");
    setPoints(10);
    setTimeLimit(120);
    setMcqConfig(defaultMcq);
    setCodingConfig(defaultCoding);
    setSqlConfig(defaultSql);
    setTextConfig(defaultText);
  }

  function startCreate(type: BankType) {
    resetForm();
    setTimeLimit(type === "coding" ? 900 : type === "sql" ? 600 : 120);
    setEditor({ kind: "create", type });
    setError(null);
  }

  function startEdit(item: BankQuestion) {
    const type = (["mcq", "coding", "sql", "text"].includes(item.type)
      ? item.type
      : "mcq") as BankType;
    setEditor({ kind: "edit", type, id: item.id });
    setTitle(item.title);
    setPromptDoc(coerceRichDoc(item.promptDoc ?? item.prompt));
    setTags((item.tags ?? []).join(", "));
    setPoints(item.points);
    setTimeLimit(item.timeLimitSeconds);
    if (type === "mcq") setMcqConfig(item.config as unknown as McqConfig);
    else if (type === "coding")
      setCodingConfig(item.config as unknown as CodingConfig);
    else if (type === "sql") setSqlConfig(item.config as unknown as SqlConfig);
    else setTextConfig(item.config as unknown as TextConfig);
    setError(null);
  }

  function currentConfig(): Record<string, unknown> {
    if (!editor) return {};
    if (editor.type === "mcq") return mcqConfig as unknown as Record<string, unknown>;
    if (editor.type === "coding")
      return codingConfig as unknown as Record<string, unknown>;
    if (editor.type === "sql")
      return sqlConfig as unknown as Record<string, unknown>;
    return textConfig as unknown as Record<string, unknown>;
  }

  async function save() {
    if (!editor || !title.trim() || !canWrite) return;
    setBusy(true);
    setError(null);
    try {
      const tagList = tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      const prompt = richDocToPlainText(promptDoc) || title.trim();
      const body = {
        title: title.trim(),
        prompt,
        promptDoc: promptDoc as unknown as Record<string, unknown>,
        timeLimitSeconds: timeLimit,
        points,
        config: currentConfig(),
        tags: tagList,
      };
      if (editor.kind === "create") {
        await api.createBankQuestion({
          type: editor.type,
          ...body,
        });
      } else {
        await api.updateBankQuestion(editor.id, body);
      }
      setEditor(null);
      resetForm();
      await reload();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!canWrite) return;
    if (!confirm("Delete this bank template?")) return;
    await api.deleteBankQuestion(id);
    if (editor?.kind === "edit" && editor.id === id) {
      setEditor(null);
      resetForm();
    }
    await reload();
  }

  return (
    <main style={pageStyle}>
      <div style={{ display: "flex", gap: 16, alignItems: "baseline" }}>
        <Link href="/admin">← Admin</Link>
        <h1 style={{ margin: 0 }}>Question bank</h1>
      </div>
      <p style={{ color: "#656d76", maxWidth: 720 }}>
        Full question templates (config, tests, scoring) for pools and cloning
        into assessments. Edit templates here — “Add from bank” copies them as-is.
      </p>
      {error ? <p style={{ color: "#cf222e" }}>{error}</p> : null}

      {canWrite && !editor ? (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
          {(Object.keys(TYPE_LABELS) as BankType[]).map((t) => (
            <button
              key={t}
              type="button"
              style={btnSecondary}
              onClick={() => startCreate(t)}
            >
              New {TYPE_LABELS[t]} template
            </button>
          ))}
        </div>
      ) : null}

      {!canWrite ? (
        <p style={{ color: "#656d76", fontSize: 14 }}>
          Reviewer role — bank write actions are hidden.
        </p>
      ) : null}

      {editor && canWrite ? (
        <div style={{ ...cardStyle, display: "grid", gap: 12, marginBottom: 24 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>
            {editor.kind === "edit" ? "Edit" : "New"} {TYPE_LABELS[editor.type]}{" "}
            template
          </h2>
          <input
            style={inputStyle}
            placeholder="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <div>
            <div style={{ fontSize: 13, color: "#656d76", marginBottom: 6 }}>
              Prompt
            </div>
            <RichTextEditor
              value={promptDoc}
              onChange={setPromptDoc}
              onUploadImage={async (file) => {
                const uploaded = await api.uploadAsset(file, file.name);
                return uploaded.url;
              }}
            />
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <label>
              Points{" "}
              <input
                type="number"
                min={1}
                value={points}
                onChange={(e) => setPoints(Number(e.target.value))}
                style={{ width: 80 }}
              />
            </label>
            <label>
              Time (s){" "}
              <input
                type="number"
                min={30}
                value={timeLimit}
                onChange={(e) => setTimeLimit(Number(e.target.value))}
                style={{ width: 100 }}
              />
            </label>
            <label style={{ flex: 1, minWidth: 180 }}>
              Tags{" "}
              <input
                style={inputStyle}
                placeholder="comma-separated"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
              />
            </label>
          </div>

          {editor.type === "mcq" ? (
            <McqBuilder value={mcqConfig} onChange={setMcqConfig} />
          ) : editor.type === "coding" ? (
            <CodingBuilder value={codingConfig} onChange={setCodingConfig} />
          ) : editor.type === "sql" ? (
            <SqlBuilder value={sqlConfig} onChange={setSqlConfig} />
          ) : (
            <TextBuilder value={textConfig} onChange={setTextConfig} />
          )}

          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              style={btnPrimary}
              disabled={busy || !title.trim()}
              onClick={() => void save()}
            >
              {editor.kind === "edit" ? "Save template" : "Add to bank"}
            </button>
            <button
              type="button"
              style={btnSecondary}
              onClick={() => {
                setEditor(null);
                resetForm();
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      <div style={{ display: "grid", gap: 10 }}>
        {items.map((item) => (
          <div key={item.id} style={cardStyle}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <div>
                <strong>{item.title}</strong>
                <div style={{ fontSize: 13, color: "#656d76", marginTop: 4 }}>
                  <span
                    style={{
                      display: "inline-block",
                      padding: "1px 8px",
                      borderRadius: 4,
                      background: "#eaeef2",
                      marginRight: 6,
                      fontWeight: 600,
                    }}
                  >
                    {TYPE_LABELS[item.type as BankType] ?? item.type}
                  </span>
                  {item.points} pts · {item.timeLimitSeconds}s
                  {configSummary(item) ? ` · ${configSummary(item)}` : ""}
                  {item.tags?.length ? ` · ${item.tags.join(", ")}` : ""}
                </div>
                <p style={{ margin: "8px 0 0", fontSize: 14 }}>
                  {item.prompt.slice(0, 160)}
                  {item.prompt.length > 160 ? "…" : ""}
                </p>
              </div>
              {canWrite ? (
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    style={btnSecondary}
                    onClick={() => startEdit(item)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    style={btnSecondary}
                    onClick={() => void remove(item.id)}
                  >
                    Delete
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        ))}
        {items.length === 0 && !editor ? (
          <div style={{ ...cardStyle, color: "#656d76" }}>
            <strong style={{ color: "#24292f" }}>No bank templates yet</strong>
            <p style={{ margin: "8px 0 0", fontSize: 14 }}>
              Create a coding, MCQ, SQL, or short-answer template with full
              config (starter code, tests, options). Pools and assessments clone
              from these.
            </p>
          </div>
        ) : null}
      </div>
    </main>
  );
}
