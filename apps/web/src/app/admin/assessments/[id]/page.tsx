"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import type { Assessment } from "@assessment-os/sdk";
import { McqBuilder, type McqConfig } from "@assessment-os/question-mcq/react";
import {
  CodingBuilder,
  type CodingConfig,
} from "@assessment-os/question-coding/react";
import { api } from "@/lib/api";
import {
  btnPrimary,
  btnSecondary,
  cardStyle,
  inputStyle,
  pageStyle,
} from "@/lib/styles";

type AddType = "mcq" | "coding" | null;

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
  starterCode: "print('hello')\n",
  visibleTests: [
    { id: "v1", stdin: "", expectedStdout: "hello\n", label: "Example" },
  ],
  hiddenTests: [],
};

export default function AssessmentBuilderPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [addType, setAddType] = useState<AddType>(null);
  const [qTitle, setQTitle] = useState("");
  const [qPrompt, setQPrompt] = useState("");
  const [qPoints, setQPoints] = useState(10);
  const [qTime, setQTime] = useState(300);
  const [mcqConfig, setMcqConfig] = useState<McqConfig>(defaultMcq);
  const [codingConfig, setCodingConfig] = useState<CodingConfig>(defaultCoding);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    const me = await api.me();
    if (!me) {
      router.replace("/admin/login");
      return;
    }
    setAssessment(await api.getAssessment(id));
  }, [id, router]);

  useEffect(() => {
    void reload().catch((err) =>
      setError(err instanceof Error ? err.message : "Failed to load"),
    );
  }, [reload]);

  async function saveMeta(patch: Partial<Assessment>) {
    setBusy(true);
    try {
      setAssessment(await api.updateAssessment(id, patch));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  async function addQuestion() {
    if (!addType || !qTitle.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const config =
        addType === "mcq"
          ? (mcqConfig as unknown as Record<string, unknown>)
          : (codingConfig as unknown as Record<string, unknown>);
      setAssessment(
        await api.addQuestion(id, {
          type: addType,
          title: qTitle.trim(),
          prompt: qPrompt,
          timeLimitSeconds: qTime,
          points: qPoints,
          config,
        }),
      );
      setAddType(null);
      setQTitle("");
      setQPrompt("");
      setMcqConfig(defaultMcq);
      setCodingConfig(defaultCoding);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Add question failed");
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    await saveMeta({ published: true });
  }

  async function createInvite() {
    setBusy(true);
    try {
      const inv = await api.createInvite(id);
      setInviteUrl(inv.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invite failed");
    } finally {
      setBusy(false);
    }
  }

  if (!assessment) {
    return <main style={pageStyle}>Loading…</main>;
  }

  return (
    <main style={pageStyle}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 8 }}>
        <Link href="/admin">← Assessments</Link>
        <Link href={`/admin/assessments/${id}/sessions`}>Results</Link>
      </div>

      <input
        style={{ ...inputStyle, fontSize: 24, fontWeight: 700, marginBottom: 8 }}
        value={assessment.title}
        onChange={(e) =>
          setAssessment({ ...assessment, title: e.target.value })
        }
        onBlur={() => void saveMeta({ title: assessment.title })}
      />
      <textarea
        style={{ ...inputStyle, minHeight: 72, marginBottom: 12 }}
        value={assessment.description}
        onChange={(e) =>
          setAssessment({ ...assessment, description: e.target.value })
        }
        onBlur={() => void saveMeta({ description: assessment.description })}
        placeholder="Description"
      />

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        <span style={{ ...cardStyle, padding: "6px 10px" }}>
          {assessment.published ? "Published" : "Draft"}
        </span>
        <button type="button" style={btnPrimary} disabled={busy || assessment.published} onClick={() => void publish()}>
          Publish
        </button>
        <button type="button" style={btnSecondary} disabled={busy || !assessment.published} onClick={() => void createInvite()}>
          Create invite
        </button>
      </div>

      {inviteUrl ? (
        <div style={{ ...cardStyle, marginBottom: 16, background: "#ddf4ff" }}>
          Invite link: <code>{inviteUrl}</code>
        </div>
      ) : null}

      {error ? <p style={{ color: "#cf222e" }}>{error}</p> : null}

      <h2>Questions</h2>
      <div style={{ display: "grid", gap: 10, marginBottom: 16 }}>
        {(assessment.questions ?? [])
          .slice()
          .sort((a, b) => a.order - b.order)
          .map((link) => (
            <div key={link.id} style={cardStyle}>
              <strong>
                {link.order + 1}. [{link.question.type}] {link.question.title}
              </strong>
              <div style={{ fontSize: 13, color: "#656d76" }}>
                {link.question.points} pts · {link.question.timeLimitSeconds}s
              </div>
            </div>
          ))}
      </div>

      {!addType ? (
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" style={btnSecondary} onClick={() => setAddType("mcq")}>
            Add MCQ
          </button>
          <button type="button" style={btnSecondary} onClick={() => setAddType("coding")}>
            Add coding
          </button>
        </div>
      ) : (
        <div style={{ ...cardStyle, display: "grid", gap: 12 }}>
          <h3>New {addType} question</h3>
          <input
            style={inputStyle}
            placeholder="Title"
            value={qTitle}
            onChange={(e) => setQTitle(e.target.value)}
          />
          <textarea
            style={{ ...inputStyle, minHeight: 80 }}
            placeholder="Prompt"
            value={qPrompt}
            onChange={(e) => setQPrompt(e.target.value)}
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
          {addType === "mcq" ? (
            <McqBuilder value={mcqConfig} onChange={setMcqConfig} />
          ) : (
            <CodingBuilder value={codingConfig} onChange={setCodingConfig} />
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" style={btnPrimary} disabled={busy} onClick={() => void addQuestion()}>
              Save question
            </button>
            <button type="button" style={btnSecondary} onClick={() => setAddType(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
