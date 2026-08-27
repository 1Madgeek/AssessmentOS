"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { BankQuestion, OrgRole } from "@assessment-os/sdk";
import { getErrorMessage } from "@assessment-os/sdk";
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

function defaultConfig(type: BankType): Record<string, unknown> {
  if (type === "mcq") {
    return {
      multiSelect: false,
      options: [
        { id: "a", label: "Option A" },
        { id: "b", label: "Option B" },
      ],
      correctOptionIds: ["a"],
    };
  }
  if (type === "coding") {
    return {
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
  }
  if (type === "sql") {
    return {
      dialect: "sqlite",
      schemaSql:
        "CREATE TABLE employees (id INTEGER, name TEXT, dept TEXT);\n",
      seedSql:
        "INSERT INTO employees VALUES (1, 'Ada', 'Eng'), (2, 'Bob', 'Sales');\n",
      starterQuery: "SELECT name FROM employees WHERE dept = 'Eng';\n",
      visibleTests: [
        { id: "v1", label: "Eng names", expectedRows: [{ name: "Ada" }] },
      ],
      hiddenTests: [],
    };
  }
  return {
    gradingMode: "exact",
    acceptedAnswers: ["answer"],
    caseSensitive: false,
    normalizeWhitespace: true,
  };
}

export default function QuestionBankPage() {
  const router = useRouter();
  const [items, setItems] = useState<BankQuestion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [tags, setTags] = useState("");
  const [type, setType] = useState<BankType>("mcq");
  const [busy, setBusy] = useState(false);
  const [role, setRole] = useState<OrgRole | null>(null);
  const canWrite = role !== "reviewer";

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

  async function createItem(e: FormEvent) {
    e.preventDefault();
    if (!title.trim() || !canWrite) return;
    setBusy(true);
    setError(null);
    try {
      const tagList = tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      await api.createBankQuestion({
        type,
        title: title.trim(),
        prompt: prompt.trim() || title.trim(),
        timeLimitSeconds: type === "coding" ? 900 : 120,
        points: 10,
        config: defaultConfig(type),
        tags: tagList,
      });
      setTitle("");
      setPrompt("");
      setTags("");
      await reload();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!canWrite) return;
    if (!confirm("Delete this bank item?")) return;
    await api.deleteBankQuestion(id);
    await reload();
  }

  return (
    <main style={pageStyle}>
      <div style={{ display: "flex", gap: 16, alignItems: "baseline" }}>
        <Link href="/admin">← Admin</Link>
        <h1 style={{ margin: 0 }}>Question bank</h1>
      </div>
      <p style={{ color: "#656d76", maxWidth: 640 }}>
        Reusable items for random pools and cloning into assessments. Add items
        here, then use “Add from bank” in the assessment builder.
      </p>
      {error ? <p style={{ color: "#cf222e" }}>{error}</p> : null}

      {canWrite ? (
        <form
          onSubmit={(e) => void createItem(e)}
          style={{ ...cardStyle, display: "grid", gap: 10, maxWidth: 560 }}
        >
          <strong>Add bank item</strong>
          <label style={{ fontSize: 14 }}>
            Type{" "}
            <select
              value={type}
              onChange={(e) => setType(e.target.value as BankType)}
              style={inputStyle}
            >
              {(Object.keys(TYPE_LABELS) as BankType[]).map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </label>
          <input
            style={inputStyle}
            placeholder="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
          <textarea
            style={{ ...inputStyle, minHeight: 80 }}
            placeholder="Prompt (editable later in an assessment)"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
          <input
            style={inputStyle}
            placeholder="Tags (comma-separated, optional)"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
          />
          <p style={{ margin: 0, fontSize: 13, color: "#656d76" }}>
            Starter config is created for the selected type. Open an assessment
            and “Add from bank” to refine tests and scoring.
          </p>
          <button type="submit" style={btnPrimary} disabled={busy}>
            Add to bank
          </button>
        </form>
      ) : (
        <p style={{ color: "#656d76", fontSize: 14 }}>
          Reviewer role — bank write actions are hidden.
        </p>
      )}

      <div style={{ display: "grid", gap: 10, marginTop: 24 }}>
        {items.map((item) => (
          <div key={item.id} style={cardStyle}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
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
                  {item.tags?.length ? ` · ${item.tags.join(", ")}` : ""}
                </div>
                <p style={{ margin: "8px 0 0", fontSize: 14 }}>
                  {item.prompt.slice(0, 160)}
                  {item.prompt.length > 160 ? "…" : ""}
                </p>
              </div>
              {canWrite ? (
                <button
                  type="button"
                  style={btnSecondary}
                  onClick={() => void remove(item.id)}
                >
                  Delete
                </button>
              ) : null}
            </div>
          </div>
        ))}
        {items.length === 0 ? (
          <div style={{ ...cardStyle, color: "#656d76" }}>
            <strong style={{ color: "#24292f" }}>No bank items yet</strong>
            <p style={{ margin: "8px 0 0", fontSize: 14 }}>
              Create your first reusable question above, or build questions
              inside an{" "}
              <Link href="/admin">assessment</Link> and copy patterns into the
              bank later. Pools draw members from this bank at session start.
            </p>
          </div>
        ) : null}
      </div>
    </main>
  );
}
