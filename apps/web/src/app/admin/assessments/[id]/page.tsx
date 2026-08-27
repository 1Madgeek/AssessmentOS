"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import type {
  Assessment,
  AssessmentQuestion,
  BankQuestion,
  InviteRecord,
  OrgRole,
} from "@assessment-os/sdk";
import {
  McqBuilder,
  McqRenderer,
  type McqAnswer,
  type McqConfig,
} from "@assessment-os/question-mcq/react";
import {
  CodingBuilder,
  CodingRenderer,
  type CodingAnswer,
  type CodingConfig,
  type CodingWorkspace,
} from "@assessment-os/question-coding/react";
import {
  SqlBuilder,
  SqlRenderer,
  type SqlAnswer,
  type SqlConfig,
  type SqlWorkspace,
} from "@assessment-os/question-sql/react";
import {
  TextBuilder,
  TextRenderer,
  type TextAnswer,
  type TextConfig,
} from "@assessment-os/question-text/react";
import { api, getActiveOrgId, setActiveOrgId } from "@/lib/api";
import { OrgSwitcher } from "@/components/OrgSwitcher";
import {
  btnPrimary,
  btnSecondary,
  cardStyle,
  inputStyle,
  pageStyle,
} from "@/lib/styles";
import { getErrorMessage } from "@assessment-os/sdk";
import {
  RichTextEditor,
  RichTextView,
} from "@assessment-os/richtext/react";
import {
  type RichDoc,
  coerceRichDoc,
  emptyRichDoc,
} from "@assessment-os/richtext";
import "@assessment-os/richtext/styles.css";

type QuestionType = "mcq" | "coding" | "sql" | "text";
type EditorMode =
  | { kind: "add"; type: QuestionType }
  | { kind: "edit"; type: QuestionType; questionId: string }
  | null;

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
};

const defaultSql: SqlConfig = {
  dialect: "sqlite",
  schemaSql:
    "CREATE TABLE employees (id INTEGER, name TEXT, dept TEXT);\n",
  seedSql:
    "INSERT INTO employees VALUES (1, 'Ada', 'Eng'), (2, 'Bob', 'Sales');\n",
  starterQuery: "SELECT name FROM employees WHERE dept = 'Eng';\n",
  visibleTests: [
    {
      id: "v1",
      label: "Eng names",
      expectedRows: [{ name: "Ada" }],
    },
  ],
  hiddenTests: [
    {
      id: "h1",
      label: "All Eng",
      expectedRows: [{ name: "Ada" }],
    },
  ],
};

const defaultText: TextConfig = {
  gradingMode: "exact",
  acceptedAnswers: ["HTTP"],
  caseSensitive: false,
  normalizeWhitespace: true,
};

export default function AssessmentBuilderPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [editor, setEditor] = useState<EditorMode>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [qTitle, setQTitle] = useState("");
  const [qPromptDoc, setQPromptDoc] = useState<RichDoc>(emptyRichDoc());
  const [qPoints, setQPoints] = useState(10);
  const [qTime, setQTime] = useState(300);
  const [mcqConfig, setMcqConfig] = useState<McqConfig>(defaultMcq);
  const [codingConfig, setCodingConfig] = useState<CodingConfig>(defaultCoding);
  const [sqlConfig, setSqlConfig] = useState<SqlConfig>(defaultSql);
  const [textConfig, setTextConfig] = useState<TextConfig>(defaultText);
  const [previewMcq, setPreviewMcq] = useState<McqAnswer | null>(null);
  const [previewCoding, setPreviewCoding] = useState<CodingAnswer | null>(null);
  const [previewCodingWs, setPreviewCodingWs] =
    useState<CodingWorkspace | null>(null);
  const [previewSql, setPreviewSql] = useState<SqlAnswer | null>(null);
  const [previewSqlWs, setPreviewSqlWs] = useState<SqlWorkspace | null>(null);
  const [previewText, setPreviewText] = useState<TextAnswer | null>(null);
  const [invites, setInvites] = useState<InviteRecord[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteExpiresDays, setInviteExpiresDays] = useState(14);
  const [inviteSendEmail, setInviteSendEmail] = useState(true);
  const [inviteMode, setInviteMode] = useState<"single" | "multi">("single");
  const [inviteMaxUses, setInviteMaxUses] = useState(50);
  const [bankItems, setBankItems] = useState<BankQuestion[]>([]);
  const [bankPick, setBankPick] = useState("");
  const [sectionTitle, setSectionTitle] = useState("");
  const [poolName, setPoolName] = useState("");
  const [poolDraw, setPoolDraw] = useState(1);
  const [poolBankPick, setPoolBankPick] = useState<Record<string, string>>({});
  const [previewDraw, setPreviewDraw] = useState<
    Array<{ questionId: string; title: string; source: string }> | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [inviteActionId, setInviteActionId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [inviteNotice, setInviteNotice] = useState<string | null>(null);
  const [role, setRole] = useState<OrgRole | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const canWrite = role !== "reviewer";

  const reload = useCallback(async () => {
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
    const a = await api.getAssessment(id);
    setAssessment(a);
    if (a.published) {
      setInvites(await api.listInvites(id));
    }
    try {
      setBankItems(await api.listBankQuestions());
    } catch {
      setBankItems([]);
    }
  }, [id, router]);

  useEffect(() => {
    void reload().catch((err) =>
      setError(getErrorMessage(err, "Failed to load")),
    );
  }, [reload]);

  async function saveMeta(patch: Partial<Assessment>) {
    setBusy(true);
    try {
      setAssessment(await api.updateAssessment(id, patch));
    } catch (err) {
      setError(getErrorMessage(err, "Update failed"));
    } finally {
      setBusy(false);
    }
  }

  function resetQuestionForm() {
    setQTitle("");
    setQPromptDoc(emptyRichDoc());
    setQPoints(10);
    setQTime(300);
    setMcqConfig(defaultMcq);
    setCodingConfig(defaultCoding);
    setSqlConfig(defaultSql);
    setTextConfig(defaultText);
  }

  function startAdd(type: QuestionType) {
    resetQuestionForm();
    setPreviewId(null);
    setEditor({ kind: "add", type });
  }

  function startEdit(link: AssessmentQuestion) {
    const q = link.question;
    const type = q.type as QuestionType;
    if (!["mcq", "coding", "sql", "text"].includes(type)) {
      setError(`Editing ${q.type} questions is not supported yet`);
      return;
    }
    setPreviewId(null);
    setQTitle(q.title);
    setQPromptDoc(coerceRichDoc(q.promptDoc ?? q.prompt));
    setQPoints(q.points);
    setQTime(q.timeLimitSeconds);
    if (type === "mcq") setMcqConfig(q.config as unknown as McqConfig);
    if (type === "coding") setCodingConfig(q.config as unknown as CodingConfig);
    if (type === "sql") setSqlConfig(q.config as unknown as SqlConfig);
    if (type === "text") setTextConfig(q.config as unknown as TextConfig);
    setEditor({ kind: "edit", type, questionId: q.id });
  }

  function startPreview(link: AssessmentQuestion) {
    setEditor(null);
    setPreviewId(link.question.id);
    setPreviewMcq(null);
    setPreviewCoding(null);
    setPreviewCodingWs(null);
    setPreviewSql(null);
    setPreviewSqlWs(null);
    setPreviewText(null);
  }

  function currentConfig(type: QuestionType): Record<string, unknown> {
    if (type === "mcq") return mcqConfig as unknown as Record<string, unknown>;
    if (type === "coding")
      return codingConfig as unknown as Record<string, unknown>;
    if (type === "sql") return sqlConfig as unknown as Record<string, unknown>;
    return textConfig as unknown as Record<string, unknown>;
  }

  async function saveQuestion() {
    if (!editor || !qTitle.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const config = currentConfig(editor.type);
      if (editor.kind === "add") {
        setAssessment(
          await api.addQuestion(id, {
            type: editor.type,
            title: qTitle.trim(),
            promptDoc: qPromptDoc,
            timeLimitSeconds: qTime,
            points: qPoints,
            config,
          }),
        );
      } else {
        setAssessment(
          await api.updateQuestion(id, editor.questionId, {
            title: qTitle.trim(),
            promptDoc: qPromptDoc,
            timeLimitSeconds: qTime,
            points: qPoints,
            config,
          }),
        );
      }
      setEditor(null);
      resetQuestionForm();
    } catch (err) {
      setError(getErrorMessage(err, "Save question failed"));
    } finally {
      setBusy(false);
    }
  }

  async function removeQuestion(questionId: string, title: string) {
    if (!window.confirm(`Delete question “${title}”? This cannot be undone.`)) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setAssessment(await api.deleteQuestion(id, questionId));
      if (editor?.kind === "edit" && editor.questionId === questionId) {
        setEditor(null);
        resetQuestionForm();
      }
      if (previewId === questionId) setPreviewId(null);
    } catch (err) {
      setError(getErrorMessage(err, "Delete failed"));
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    await saveMeta({ published: true });
    setInvites(await api.listInvites(id));
  }

  async function createInvite() {
    setBusy(true);
    setError(null);
    setInviteNotice(null);
    try {
      const email = inviteEmail.trim();
      const created = await api.createInvite(id, {
        candidateEmail: inviteMode === "single" ? email || undefined : undefined,
        candidateName: inviteMode === "single" ? inviteName.trim() || undefined : undefined,
        expiresInDays: inviteExpiresDays,
        sendEmail:
          inviteMode === "single" ? Boolean(email) && inviteSendEmail : false,
        mode: inviteMode,
        maxUses: inviteMode === "multi" ? inviteMaxUses : 1,
      });
      setInvites(await api.listInvites(id));
      setInviteEmail("");
      setInviteName("");
      setInviteNotice(
        created.emailed
          ? "Invite created and email sent."
          : email && inviteSendEmail
            ? "Invite created, but email could not be sent."
            : "Invite created.",
      );
    } catch (err) {
      setError(getErrorMessage(err, "Invite failed"));
    } finally {
      setBusy(false);
    }
  }

  async function revokeInvite(inviteId: string, label: string) {
    if (
      !window.confirm(
        `Revoke invite${label ? ` for ${label}` : ""}? The link will stop working.`,
      )
    ) {
      return;
    }
    setInviteActionId(inviteId);
    setError(null);
    try {
      await api.revokeInvite(id, inviteId);
      setInvites(await api.listInvites(id));
      setInviteNotice("Invite revoked.");
    } catch (err) {
      setError(getErrorMessage(err, "Revoke failed"));
    } finally {
      setInviteActionId(null);
    }
  }

  async function resendInvite(inviteId: string) {
    setInviteActionId(inviteId);
    setError(null);
    try {
      await api.resendInvite(id, inviteId);
      setInvites(await api.listInvites(id));
      setInviteNotice("Invite email resent.");
    } catch (err) {
      setError(getErrorMessage(err, "Resend failed"));
    } finally {
      setInviteActionId(null);
    }
  }

  async function copyInviteLink(inv: InviteRecord) {
    try {
      await navigator.clipboard.writeText(inv.url);
      setCopiedId(inv.id);
      window.setTimeout(() => setCopiedId((cur) => (cur === inv.id ? null : cur)), 2000);
    } catch {
      setError("Could not copy link");
    }
  }

  if (!assessment) {
    return <main style={pageStyle}>Loading…</main>;
  }

  return (
    <main style={pageStyle}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
        <Link href="/admin">← Assessments</Link>
        <Link href={`/admin/assessments/${id}/sessions`}>Results</Link>
        <Link href="/admin/email-templates">Email templates</Link>
        <OrgSwitcher />
      </div>
      {!canWrite ? (
        <p style={{ color: "#656d76", fontSize: 13, margin: "0 0 12px" }}>
          Reviewer role — editing, publish, and invites are hidden.
        </p>
      ) : null}

      <input
        style={{ ...inputStyle, fontSize: 24, fontWeight: 700, marginBottom: 8 }}
        value={assessment.title}
        disabled={!canWrite}
        onChange={(e) =>
          setAssessment({ ...assessment, title: e.target.value })
        }
        onBlur={() => canWrite && void saveMeta({ title: assessment.title })}
      />
      <textarea
        style={{ ...inputStyle, minHeight: 72, marginBottom: 12 }}
        value={assessment.description}
        disabled={!canWrite}
        onChange={(e) =>
          setAssessment({ ...assessment, description: e.target.value })
        }
        onBlur={() =>
          canWrite && void saveMeta({ description: assessment.description })
        }
        placeholder="Description"
      />

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        <span style={{ ...cardStyle, padding: "6px 10px" }}>
          {assessment.published ? "Published" : "Draft"}
        </span>
        {canWrite ? (
          <button type="button" style={btnPrimary} disabled={busy || assessment.published} onClick={() => void publish()}>
            Publish
          </button>
        ) : null}
        {canWrite ? (
          <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 14 }}>
            <input
              type="checkbox"
              checked={Boolean(assessment.rules.randomizeQuestionOrder)}
              onChange={(e) =>
                void saveMeta({
                  rules: {
                    ...assessment.rules,
                    randomizeQuestionOrder: e.target.checked,
                  },
                })
              }
            />
            Randomize question order
          </label>
        ) : null}
        <Link href={`/admin/assessments/${id}/sessions`} style={btnSecondary}>
          Sessions
        </Link>
      </div>

      {canWrite ? (
      <>
      <section style={{ ...cardStyle, marginBottom: 24, display: "grid", gap: 10 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>Sections</h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            style={inputStyle}
            placeholder="Section title"
            value={sectionTitle}
            onChange={(e) => setSectionTitle(e.target.value)}
          />
          <button
            type="button"
            style={btnSecondary}
            disabled={busy || !sectionTitle.trim()}
            onClick={() =>
              void (async () => {
                setBusy(true);
                try {
                  setAssessment(
                    await api.createSection(id, { title: sectionTitle.trim() }),
                  );
                  setSectionTitle("");
                } catch (err) {
                  setError(getErrorMessage(err));
                } finally {
                  setBusy(false);
                }
              })()
            }
          >
            Add section
          </button>
        </div>
        {(assessment.sections ?? []).map((s) => (
          <div
            key={s.id}
            style={{ display: "flex", gap: 8, alignItems: "center" }}
          >
            <strong>{s.title}</strong>
            <span style={{ fontSize: 12, color: "#656d76" }}>order {s.order}</span>
            <button
              type="button"
              style={btnSecondary}
              onClick={() =>
                void (async () => {
                  setAssessment(await api.deleteSection(id, s.id));
                })()
              }
            >
              Delete
            </button>
          </div>
        ))}
      </section>

      <section style={{ ...cardStyle, marginBottom: 24, display: "grid", gap: 10 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>Question pools</h2>
        <p style={{ margin: 0, fontSize: 13, color: "#656d76" }}>
          Draw N random questions from each pool at session start (in addition to
          fixed questions below).
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input
            style={inputStyle}
            placeholder="Pool name"
            value={poolName}
            onChange={(e) => setPoolName(e.target.value)}
          />
          <label>
            Draw{" "}
            <input
              type="number"
              min={1}
              value={poolDraw}
              onChange={(e) => setPoolDraw(Number(e.target.value))}
              style={{ width: 64 }}
            />
          </label>
          <button
            type="button"
            style={btnSecondary}
            disabled={busy || !poolName.trim()}
            onClick={() =>
              void (async () => {
                setBusy(true);
                try {
                  setAssessment(
                    await api.createPool(id, {
                      name: poolName.trim(),
                      drawCount: poolDraw,
                    }),
                  );
                  setPoolName("");
                } catch (err) {
                  setError(getErrorMessage(err));
                } finally {
                  setBusy(false);
                }
              })()
            }
          >
            Add pool
          </button>
          <button
            type="button"
            style={btnSecondary}
            onClick={() =>
              void (async () => {
                const { preview } = await api.previewPools(id);
                setPreviewDraw(preview);
              })()
            }
          >
            Preview draw
          </button>
        </div>
        {previewDraw ? (
          <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13 }}>
            {previewDraw.map((p) => (
              <li key={`${p.questionId}-${p.source}`}>
                {p.title}{" "}
                <span style={{ color: "#656d76" }}>({p.source})</span>
              </li>
            ))}
          </ol>
        ) : null}
        {(assessment.pools ?? []).map((pool) => (
          <div key={pool.id} style={{ borderTop: "1px solid #d0d7de", paddingTop: 10 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <strong>{pool.name}</strong>
              <span style={{ fontSize: 13, color: "#656d76" }}>
                draw {pool.drawCount} of {pool.members.length}
              </span>
              <button
                type="button"
                style={btnSecondary}
                onClick={() =>
                  void (async () => {
                    setAssessment(await api.deletePool(id, pool.id));
                  })()
                }
              >
                Delete pool
              </button>
            </div>
            <ul style={{ margin: "8px 0", paddingLeft: 18, fontSize: 13 }}>
              {pool.members.map((m) => (
                <li key={m.id}>
                  {m.question.title}{" "}
                  <button
                    type="button"
                    onClick={() =>
                      void (async () => {
                        setAssessment(
                          await api.removePoolMember(id, pool.id, m.id),
                        );
                      })()
                    }
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
            <div style={{ display: "flex", gap: 8 }}>
              <select
                value={poolBankPick[pool.id] ?? ""}
                onChange={(e) =>
                  setPoolBankPick((prev) => ({
                    ...prev,
                    [pool.id]: e.target.value,
                  }))
                }
              >
                <option value="">Add from bank…</option>
                {bankItems.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.title} ({b.type})
                  </option>
                ))}
              </select>
              <button
                type="button"
                style={btnSecondary}
                disabled={!poolBankPick[pool.id]}
                onClick={() =>
                  void (async () => {
                    const bankQuestionId = poolBankPick[pool.id];
                    if (!bankQuestionId) return;
                    setAssessment(
                      await api.addPoolMember(id, pool.id, { bankQuestionId }),
                    );
                    setPoolBankPick((prev) => ({ ...prev, [pool.id]: "" }));
                  })()
                }
              >
                Add member
              </button>
            </div>
          </div>
        ))}
      </section>
      </>
      ) : null}

      {assessment.published ? (
        <section style={{ ...cardStyle, marginBottom: 24, display: "grid", gap: 12 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Invites</h2>
          {canWrite ? (
          <>
          <p style={{ margin: 0, fontSize: 13, color: "#656d76" }}>
            Default is single-use. Multi-use open links require OTP per start and
            allow one session per email until max uses.
          </p>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input
                type="radio"
                checked={inviteMode === "single"}
                onChange={() => setInviteMode("single")}
              />
              Single-use
            </label>
            <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input
                type="radio"
                checked={inviteMode === "multi"}
                onChange={() => setInviteMode("multi")}
              />
              Multi-use open link
            </label>
            {inviteMode === "multi" ? (
              <label>
                Max uses{" "}
                <input
                  type="number"
                  min={2}
                  max={10000}
                  value={inviteMaxUses}
                  onChange={(e) => setInviteMaxUses(Number(e.target.value))}
                  style={{ width: 80 }}
                />
              </label>
            ) : null}
          </div>
          {inviteMode === "single" ? (
            <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr" }}>
              <input
                style={inputStyle}
                placeholder="Candidate email (optional for open link)"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
              />
              <input
                style={inputStyle}
                placeholder="Candidate name (optional)"
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
              />
            </div>
          ) : null}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <label>
              Expires in days{" "}
              <input
                type="number"
                min={1}
                max={365}
                value={inviteExpiresDays}
                onChange={(e) => setInviteExpiresDays(Number(e.target.value))}
                style={{ width: 72 }}
              />
            </label>
            {inviteMode === "single" ? (
              <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={inviteSendEmail}
                  onChange={(e) => setInviteSendEmail(e.target.checked)}
                  disabled={!inviteEmail.trim()}
                />
                Send email
              </label>
            ) : null}
            <button type="button" style={btnPrimary} disabled={busy} onClick={() => void createInvite()}>
              {inviteMode === "multi" ? "Create open link" : "Create invite"}
            </button>
            <label style={{ ...btnSecondary, cursor: "pointer", display: "inline-block" }}>
              {bulkBusy ? "Uploading…" : "Bulk CSV upload"}
              <input
                type="file"
                accept=".csv,text/csv"
                style={{ display: "none" }}
                disabled={bulkBusy}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  void (async () => {
                    setBulkBusy(true);
                    setError(null);
                    setInviteNotice(null);
                    try {
                      const form = new FormData();
                      form.append("file", file);
                      form.append("expiresInDays", String(inviteExpiresDays));
                      form.append("sendEmail", "true");
                      const result = await api.bulkCreateInvites(id, form);
                      setInvites(await api.listInvites(id));
                      setInviteNotice(
                        `Bulk: ${result.created.length} created` +
                          (result.errors.length
                            ? `, ${result.errors.length} errors`
                            : ""),
                      );
                      if (result.errors.length) {
                        setError(
                          result.errors
                            .slice(0, 5)
                            .map((x) => `row ${x.row}: ${x.message}`)
                            .join("; "),
                        );
                      }
                    } catch (err) {
                      setError(getErrorMessage(err, "Bulk upload failed"));
                    } finally {
                      setBulkBusy(false);
                    }
                  })();
                }}
              />
            </label>
          </div>
          </>
          ) : (
            <p style={{ margin: 0, fontSize: 13, color: "#656d76" }}>
              Reviewers can view invites but cannot create them.
            </p>
          )}
          {inviteNotice ? (
            <p role="status" style={{ margin: 0, fontSize: 13, color: "#1a7f37" }}>
              {inviteNotice}
            </p>
          ) : null}
          {error ? (
            <p role="alert" style={{ margin: 0, color: "#cf222e" }}>
              {error}
            </p>
          ) : null}

          <div style={{ display: "grid", gap: 8 }}>
            {invites.map((inv) => {
              const usable = inv.status === "pending";
              const canRevoke = inv.status === "pending" || inv.status === "expired";
              const actionBusy = inviteActionId === inv.id;
              return (
                <div
                  key={inv.id}
                  style={{
                    borderTop: "1px solid #d0d7de",
                    paddingTop: 10,
                    display: "grid",
                    gap: 6,
                  }}
                >
                  <div style={{ fontSize: 14 }}>
                    <strong>{inv.status}</strong>
                    {inv.mode === "multi"
                      ? ` · multi (${inv.useCount ?? 0}/${inv.maxUses ?? "?"})`
                      : " · single"}
                    {inv.candidateName ? ` · ${inv.candidateName}` : ""}
                    {inv.candidateEmail ? ` · ${inv.candidateEmail}` : " · open link"}
                    {inv.expiresAt
                      ? ` · expires ${new Date(inv.expiresAt).toLocaleString()}`
                      : ""}
                    {inv.lastEmailedAt
                      ? ` · emailed ${new Date(inv.lastEmailedAt).toLocaleString()}`
                      : ""}
                    {inv.usedAt
                      ? ` · used ${new Date(inv.usedAt).toLocaleString()}`
                      : ""}
                    {inv.revokedAt
                      ? ` · revoked ${new Date(inv.revokedAt).toLocaleString()}`
                      : ""}
                  </div>
                  <code style={{ fontSize: 12, wordBreak: "break-all" }}>{inv.url}</code>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      style={btnSecondary}
                      disabled={!usable}
                      title={
                        usable
                          ? "Copy invite link"
                          : "Link is no longer valid"
                      }
                      onClick={() => void copyInviteLink(inv)}
                    >
                      {copiedId === inv.id ? "Copied!" : "Copy link"}
                    </button>
                    {usable && inv.candidateEmail ? (
                      <button
                        type="button"
                        style={btnSecondary}
                        disabled={actionBusy}
                        onClick={() => void resendInvite(inv.id)}
                      >
                        Resend
                      </button>
                    ) : null}
                    {canRevoke ? (
                      <button
                        type="button"
                        style={btnSecondary}
                        disabled={actionBusy}
                        onClick={() =>
                          void revokeInvite(
                            inv.id,
                            inv.candidateEmail ?? inv.candidateName ?? "",
                          )
                        }
                      >
                        Revoke
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
            {invites.length === 0 ? (
              <p style={{ margin: 0, color: "#656d76", fontSize: 14 }}>
                No invites yet.
              </p>
            ) : null}
          </div>
        </section>
      ) : null}

      {error && !assessment.published ? (
        <p style={{ color: "#cf222e" }}>{error}</p>
      ) : null}

      <h2>Questions</h2>
      <div style={{ display: "grid", gap: 10, marginBottom: 16 }}>
        {(assessment.questions ?? [])
          .slice()
          .sort((a, b) => a.order - b.order)
          .map((link) => {
            const q = link.question;
            const isPreview = previewId === q.id;
            return (
              <div key={link.id} style={{ ...cardStyle, display: "grid", gap: 10 }}>
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    flexWrap: "wrap",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                  }}
                >
                  <div>
                    <strong>
                      {link.order + 1}. [{q.type}] {q.title}
                    </strong>
                    <div style={{ fontSize: 13, color: "#656d76" }}>
                      {q.points} pts · {q.timeLimitSeconds}s
                    </div>
                    {(assessment.sections?.length ?? 0) > 0 && canWrite ? (
                      <label style={{ fontSize: 12, marginTop: 4, display: "block" }}>
                        Section{" "}
                        <select
                          value={link.sectionId ?? ""}
                          onChange={(e) =>
                            void (async () => {
                              setAssessment(
                                await api.setQuestionSection(
                                  id,
                                  q.id,
                                  e.target.value || null,
                                ),
                              );
                            })()
                          }
                        >
                          <option value="">None</option>
                          {(assessment.sections ?? []).map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.title}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      style={btnSecondary}
                      disabled={busy}
                      onClick={() => startPreview(link)}
                    >
                      {isPreview ? "Previewing" : "Preview"}
                    </button>
                    {canWrite ? (
                      <>
                    <button
                      type="button"
                      style={btnSecondary}
                      disabled={busy}
                      onClick={() => startEdit(link)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      style={btnSecondary}
                      disabled={busy}
                      onClick={() => void removeQuestion(q.id, q.title)}
                    >
                      Delete
                    </button>
                      </>
                    ) : null}
                  </div>
                </div>
                {isPreview ? (
                  <QuestionPreview
                    link={link}
                    mcqAnswer={previewMcq}
                    codingAnswer={previewCoding}
                    codingWorkspace={previewCodingWs}
                    sqlAnswer={previewSql}
                    sqlWorkspace={previewSqlWs}
                    textAnswer={previewText}
                    onMcq={setPreviewMcq}
                    onCoding={setPreviewCoding}
                    onCodingWs={setPreviewCodingWs}
                    onSql={setPreviewSql}
                    onSqlWs={setPreviewSqlWs}
                    onText={setPreviewText}
                    onClose={() => setPreviewId(null)}
                  />
                ) : null}
              </div>
            );
          })}
      </div>

      {!editor && canWrite ? (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button type="button" style={btnSecondary} onClick={() => startAdd("mcq")}>
            Add MCQ
          </button>
          <button
            type="button"
            style={btnSecondary}
            onClick={() => startAdd("coding")}
          >
            Add coding
          </button>
          <button type="button" style={btnSecondary} onClick={() => startAdd("sql")}>
            Add SQL
          </button>
          <button
            type="button"
            style={btnSecondary}
            onClick={() => startAdd("text")}
          >
            Add short answer
          </button>
          <select
            value={bankPick}
            onChange={(e) => setBankPick(e.target.value)}
            style={{ minWidth: 180 }}
          >
            <option value="">Add from bank…</option>
            {bankItems.map((b) => (
              <option key={b.id} value={b.id}>
                {b.title} ({b.type})
              </option>
            ))}
          </select>
          <button
            type="button"
            style={btnSecondary}
            disabled={!bankPick || busy}
            onClick={() =>
              void (async () => {
                if (!bankPick) return;
                setBusy(true);
                try {
                  setAssessment(
                    await api.addQuestionFromBank(id, {
                      bankQuestionId: bankPick,
                    }),
                  );
                  setBankPick("");
                } catch (err) {
                  setError(getErrorMessage(err));
                } finally {
                  setBusy(false);
                }
              })()
            }
          >
            Clone from bank
          </button>
        </div>
      ) : editor && canWrite ? (
        <div style={{ ...cardStyle, display: "grid", gap: 12 }}>
          <h3>
            {editor.kind === "edit" ? "Edit" : "New"} {editor.type} question
          </h3>
          <input
            style={inputStyle}
            placeholder="Title"
            value={qTitle}
            onChange={(e) => setQTitle(e.target.value)}
          />
          <RichTextEditor
            value={qPromptDoc}
            onChange={setQPromptDoc}
            onUploadImage={async (file) => {
              const uploaded = await api.uploadAsset(file, file.name);
              return uploaded.url;
            }}
          />
          <div style={{ display: "flex", gap: 12 }}>
            <label>
              Points{" "}
              <input
                type="number"
                value={qPoints}
                onChange={(e) => setQPoints(Number(e.target.value))}
                style={{ width: 80 }}
              />
            </label>
            <label>
              Time (s){" "}
              <input
                type="number"
                value={qTime}
                onChange={(e) => setQTime(Number(e.target.value))}
                style={{ width: 100 }}
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
              disabled={busy}
              onClick={() => void saveQuestion()}
            >
              {editor.kind === "edit" ? "Save changes" : "Save question"}
            </button>
            <button
              type="button"
              style={btnSecondary}
              onClick={() => {
                setEditor(null);
                resetQuestionForm();
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function QuestionPreview({
  link,
  mcqAnswer,
  codingAnswer,
  codingWorkspace,
  sqlAnswer,
  sqlWorkspace,
  textAnswer,
  onMcq,
  onCoding,
  onCodingWs,
  onSql,
  onSqlWs,
  onText,
  onClose,
}: {
  link: AssessmentQuestion;
  mcqAnswer: McqAnswer | null;
  codingAnswer: CodingAnswer | null;
  codingWorkspace: CodingWorkspace | null;
  sqlAnswer: SqlAnswer | null;
  sqlWorkspace: SqlWorkspace | null;
  textAnswer: TextAnswer | null;
  onMcq: (a: McqAnswer) => void;
  onCoding: (a: CodingAnswer) => void;
  onCodingWs: (w: CodingWorkspace) => void;
  onSql: (a: SqlAnswer) => void;
  onSqlWs: (w: SqlWorkspace) => void;
  onText: (a: TextAnswer) => void;
  onClose: () => void;
}) {
  const q = link.question;
  return (
    <div
      style={{
        borderTop: "1px solid #d0d7de",
        paddingTop: 12,
        display: "grid",
        gap: 10,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 8,
          alignItems: "center",
        }}
      >
        <strong style={{ fontSize: 14 }}>Candidate preview</strong>
        <button type="button" style={btnSecondary} onClick={onClose}>
          Close preview
        </button>
      </div>
      <RichTextView value={(q.promptDoc ?? q.prompt) as never} />
      {q.type === "mcq" ? (
        <McqRenderer
          config={q.config as unknown as McqConfig}
          answer={mcqAnswer}
          onChange={onMcq}
        />
      ) : q.type === "coding" ? (
        <CodingRenderer
          config={q.config as unknown as CodingConfig}
          answer={codingAnswer}
          workspace={codingWorkspace}
          onChange={onCoding}
          onWorkspaceChange={onCodingWs}
        />
      ) : q.type === "sql" ? (
        <SqlRenderer
          config={q.config as unknown as SqlConfig}
          answer={sqlAnswer}
          workspace={sqlWorkspace}
          onChange={onSql}
          onWorkspaceChange={onSqlWs}
        />
      ) : q.type === "text" ? (
        <TextRenderer
          config={q.config as unknown as TextConfig}
          answer={textAnswer}
          onChange={onText}
        />
      ) : (
        <p style={{ margin: 0, color: "#656d76" }}>
          Preview is not available for type “{q.type}”.
        </p>
      )}
    </div>
  );
}
