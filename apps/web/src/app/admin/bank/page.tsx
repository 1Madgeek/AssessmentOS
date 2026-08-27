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

export default function QuestionBankPage() {
  const router = useRouter();
  const [items, setItems] = useState<BankQuestion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
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

  async function createMcq(e: FormEvent) {
    e.preventDefault();
    if (!title.trim() || !canWrite) return;
    setBusy(true);
    setError(null);
    try {
      await api.createBankQuestion({
        type: "mcq",
        title: title.trim(),
        prompt: prompt.trim() || title.trim(),
        timeLimitSeconds: 120,
        points: 10,
        config: {
          multiSelect: false,
          options: [
            { id: "a", label: "Option A" },
            { id: "b", label: "Option B" },
          ],
          correctOptionIds: ["a"],
        },
        tags: [],
      });
      setTitle("");
      setPrompt("");
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
      <p style={{ color: "#656d76" }}>
        Reusable items. Clone into assessments via “Add from bank” in the
        builder.
      </p>
      {error ? <p style={{ color: "#cf222e" }}>{error}</p> : null}

      {canWrite ? (
        <form
          onSubmit={(e) => void createMcq(e)}
          style={{ ...cardStyle, display: "grid", gap: 10, maxWidth: 520 }}
        >
          <strong>Quick-add MCQ</strong>
          <input
            style={inputStyle}
            placeholder="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <textarea
            style={{ ...inputStyle, minHeight: 80 }}
            placeholder="Prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
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
                  {item.type} · {item.points} pts · {item.timeLimitSeconds}s
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
          <p style={{ color: "#656d76" }}>No bank items yet.</p>
        ) : null}
      </div>
    </main>
  );
}
