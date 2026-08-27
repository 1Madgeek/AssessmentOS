"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getErrorMessage } from "@assessment-os/sdk";
import { api, getActiveOrgId, setActiveOrgId } from "@/lib/api";
import {
  btnPrimary,
  btnSecondary,
  cardStyle,
  inputStyle,
  pageClass,
} from "@/lib/styles";

type CandidateRow = Awaited<ReturnType<typeof api.listCandidates>>[number];
type CandidateDetail = Awaited<ReturnType<typeof api.getCandidate>>;

export default function CandidatesPage() {
  const router = useRouter();
  const [rows, setRows] = useState<CandidateRow[]>([]);
  const [detail, setDetail] = useState<CandidateDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [shortlistedOnly, setShortlistedOnly] = useState(false);
  const [minScore, setMinScore] = useState("");
  const [busy, setBusy] = useState(false);
  const [notesDraft, setNotesDraft] = useState("");

  async function reloadList() {
    const opts: {
      q?: string;
      shortlisted?: boolean;
      minScorePct?: number;
    } = {};
    if (q.trim()) opts.q = q.trim();
    if (shortlistedOnly) opts.shortlisted = true;
    if (minScore.trim()) opts.minScorePct = Number(minScore);
    setRows(await api.listCandidates(opts));
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
      await reloadList();
    })().catch((err) => setError(getErrorMessage(err)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function openDetail(id: string) {
    setBusy(true);
    setError(null);
    try {
      const c = await api.getCandidate(id);
      setDetail(c);
      setNotesDraft(c.notes ?? "");
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function toggleShortlist() {
    if (!detail) return;
    setBusy(true);
    try {
      const updated = await api.updateCandidate(detail.id, {
        shortlisted: !detail.shortlisted,
      });
      setDetail({ ...detail, ...updated });
      await reloadList();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function saveNotes() {
    if (!detail) return;
    setBusy(true);
    try {
      const updated = await api.updateCandidate(detail.id, {
        notes: notesDraft.trim() || null,
      });
      setDetail({ ...detail, ...updated });
      await reloadList();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={pageClass}>
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Candidates
        </h1>
        <p style={{ color: "var(--muted-foreground)", maxWidth: 640 }}>
          People who were invited or assessed in this organization. Shortlist strong
          performers and reopen past sessions across assessments.
        </p>
      </div>
      {error ? <p style={{ color: "var(--destructive)" }}>{error}</p> : null}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void reloadList().catch((err) => setError(getErrorMessage(err)));
        }}
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          alignItems: "center",
          marginBottom: 16,
        }}
      >
        <input
          style={{ ...inputStyle, maxWidth: 240 }}
          placeholder="Search name or email"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <label style={{ fontSize: 14, display: "flex", gap: 6, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={shortlistedOnly}
            onChange={(e) => setShortlistedOnly(e.target.checked)}
          />
          Shortlisted only
        </label>
        <label style={{ fontSize: 14 }}>
          Min best score %{" "}
          <input
            type="number"
            min={0}
            max={100}
            style={{ width: 72 }}
            value={minScore}
            onChange={(e) => setMinScore(e.target.value)}
            placeholder="e.g. 70"
          />
        </label>
        <button type="submit" style={btnSecondary}>
          Apply
        </button>
      </form>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: detail ? "1fr 1fr" : "1fr",
          gap: 16,
          alignItems: "start",
        }}
      >
        <div style={{ display: "grid", gap: 10 }}>
          {rows.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => void openDetail(c.id)}
              style={{
                ...cardStyle,
                textAlign: "left",
                cursor: "pointer",
                border:
                  detail?.id === c.id
                    ? "2px solid #0969da"
                    : cardStyle.border,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 8,
                }}
              >
                <strong>{c.name}</strong>
                {c.shortlisted ? (
                  <span style={{ fontSize: 12, color: "#1a7f37" }}>
                    Shortlisted
                  </span>
                ) : null}
              </div>
              <div style={{ fontSize: 13, color: "#656d76", marginTop: 4 }}>
                {c.email}
              </div>
              <div style={{ fontSize: 13, color: "#656d76", marginTop: 6 }}>
                {c.sessionCount} session{c.sessionCount === 1 ? "" : "s"}
                {c.bestScorePct != null
                  ? ` · best ${c.bestScorePct}%`
                  : ""}
                {c.lastSubmittedAt
                  ? ` · last ${new Date(c.lastSubmittedAt).toLocaleDateString()}`
                  : ""}
              </div>
            </button>
          ))}
          {rows.length === 0 ? (
            <div style={{ ...cardStyle, color: "#656d76" }}>
              <strong style={{ color: "#24292f" }}>No candidates yet</strong>
              <p style={{ margin: "8px 0 0", fontSize: 14 }}>
                Candidates appear automatically when you invite someone or they
                start an assessment.
              </p>
            </div>
          ) : null}
        </div>

        {detail ? (
          <div style={{ ...cardStyle, display: "grid", gap: 12 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 8,
                flexWrap: "wrap",
              }}
            >
              <div>
                <h2 style={{ margin: 0, fontSize: 18 }}>{detail.name}</h2>
                <div style={{ fontSize: 13, color: "#656d76" }}>
                  {detail.email}
                </div>
              </div>
              <button
                type="button"
                style={detail.shortlisted ? btnSecondary : btnPrimary}
                disabled={busy}
                onClick={() => void toggleShortlist()}
              >
                {detail.shortlisted ? "Remove shortlist" : "Shortlist"}
              </button>
            </div>
            <label style={{ display: "grid", gap: 6, fontSize: 14 }}>
              Notes
              <textarea
                style={{ ...inputStyle, minHeight: 80 }}
                value={notesDraft}
                onChange={(e) => setNotesDraft(e.target.value)}
              />
            </label>
            <button
              type="button"
              style={btnSecondary}
              disabled={busy}
              onClick={() => void saveNotes()}
            >
              Save notes
            </button>
            <h3 style={{ margin: 0, fontSize: 15 }}>Assessment history</h3>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14 }}>
              {detail.sessions.map((s) => (
                <li key={s.sessionId} style={{ marginBottom: 8 }}>
                  <Link
                    href={`/admin/assessments/${s.assessmentId}/sessions/${s.sessionId}`}
                  >
                    {s.assessmentTitle}
                  </Link>{" "}
                  — {s.status}
                  {s.maxScore > 0
                    ? ` · ${s.totalScore}/${s.maxScore}`
                    : ""}
                  {s.submittedAt
                    ? ` · ${new Date(s.submittedAt).toLocaleString()}`
                    : ""}
                </li>
              ))}
              {detail.sessions.length === 0 ? (
                <li style={{ color: "#656d76", listStyle: "none", marginLeft: -18 }}>
                  Invited but no sessions yet.
                </li>
              ) : null}
            </ul>
          </div>
        ) : null}
      </div>
    </main>
  );
}
