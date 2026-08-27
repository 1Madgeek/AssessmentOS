"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { btnSecondary, cardStyle, pageStyle } from "@/lib/styles";

type SessionRow = {
  id: string;
  candidateName: string;
  candidateEmail: string;
  status: string;
  totalScore: number;
  maxScore: number;
  submittedAt: string | null;
};

type CollapsedRow = {
  candidateEmail: string;
  candidateName: string;
  bestScore: number;
  maxScore: number;
  bestSessionId: string;
  attemptCount: number;
  attempts: SessionRow[];
};

export default function SessionsListPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [rows, setRows] = useState<SessionRow[]>([]);
  const [collapsed, setCollapsed] = useState<CollapsedRow[]>([]);
  const [collapseBest, setCollapseBest] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const me = await api.me();
      if (!me) {
        router.replace("/admin/login");
        return;
      }
      if (collapseBest) {
        const data = (await api.listSessions(id, {
          collapse: "best",
        })) as CollapsedRow[];
        setCollapsed(data);
        setRows([]);
      } else {
        const data = (await api.listSessions(id)) as SessionRow[];
        setRows(data);
        setCollapsed([]);
      }
    })().catch((err) =>
      setError(err instanceof Error ? err.message : "Failed to load"),
    );
  }, [id, router, collapseBest]);

  return (
    <main style={pageStyle}>
      <Link href={`/admin/assessments/${id}`}>← Builder</Link>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <h1 style={{ margin: 0 }}>Candidate sessions</h1>
        <button
          type="button"
          style={btnSecondary}
          onClick={() => setCollapseBest((v) => !v)}
        >
          {collapseBest ? "Show all attempts" : "Collapse best score"}
        </button>
      </div>
      {error ? <p style={{ color: "#cf222e" }}>{error}</p> : null}

      {collapseBest ? (
        <div style={{ display: "grid", gap: 10, marginTop: 16 }}>
          {collapsed.map((g) => (
            <div key={g.candidateEmail} style={cardStyle}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  alignItems: "flex-start",
                }}
              >
                <div>
                  <Link
                    href={`/admin/assessments/${id}/sessions/${g.bestSessionId}`}
                    style={{ color: "inherit", textDecoration: "none" }}
                  >
                    <strong>
                      {g.candidateName} ({g.candidateEmail})
                    </strong>
                  </Link>
                  <div style={{ fontSize: 13, color: "#656d76", marginTop: 4 }}>
                    Best score {g.bestScore}/{g.maxScore} · {g.attemptCount}{" "}
                    attempt{g.attemptCount === 1 ? "" : "s"}
                  </div>
                </div>
                {g.attemptCount > 1 ? (
                  <button
                    type="button"
                    style={btnSecondary}
                    onClick={() =>
                      setExpanded((prev) => ({
                        ...prev,
                        [g.candidateEmail]: !prev[g.candidateEmail],
                      }))
                    }
                  >
                    {expanded[g.candidateEmail] ? "Hide" : "Expand"}
                  </button>
                ) : null}
              </div>
              {expanded[g.candidateEmail] ? (
                <div style={{ display: "grid", gap: 6, marginTop: 10 }}>
                  {g.attempts.map((s) => (
                    <Link
                      key={s.id}
                      href={`/admin/assessments/${id}/sessions/${s.id}`}
                      style={{
                        fontSize: 13,
                        color: "#0969da",
                        textDecoration: "none",
                      }}
                    >
                      {s.status} · {s.totalScore}/{s.maxScore}
                      {s.submittedAt
                        ? ` · ${new Date(s.submittedAt).toLocaleString()}`
                        : ""}
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
          {collapsed.length === 0 ? (
            <p style={{ color: "#656d76" }}>No sessions yet.</p>
          ) : null}
        </div>
      ) : (
        <div style={{ display: "grid", gap: 10, marginTop: 16 }}>
          {rows.map((s) => (
            <Link
              key={s.id}
              href={`/admin/assessments/${id}/sessions/${s.id}`}
              style={{ ...cardStyle, textDecoration: "none", color: "inherit" }}
            >
              <strong>
                {s.candidateName} ({s.candidateEmail})
              </strong>
              <div style={{ fontSize: 13, color: "#656d76", marginTop: 4 }}>
                {s.status} · score {s.totalScore}/{s.maxScore}
                {s.submittedAt
                  ? ` · submitted ${new Date(s.submittedAt).toLocaleString()}`
                  : ""}
              </div>
            </Link>
          ))}
          {rows.length === 0 ? (
            <p style={{ color: "#656d76" }}>No sessions yet.</p>
          ) : null}
        </div>
      )}
    </main>
  );
}
