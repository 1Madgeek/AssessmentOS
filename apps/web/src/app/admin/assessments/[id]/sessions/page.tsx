"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { cardStyle, pageStyle } from "@/lib/styles";

type SessionRow = {
  id: string;
  candidateName: string;
  candidateEmail: string;
  status: string;
  totalScore: number;
  maxScore: number;
  submittedAt: string | null;
};

export default function SessionsListPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [rows, setRows] = useState<SessionRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const me = await api.me();
      if (!me) {
        router.replace("/admin/login");
        return;
      }
      setRows(await api.listSessions(id));
    })().catch((err) =>
      setError(err instanceof Error ? err.message : "Failed to load"),
    );
  }, [id, router]);

  return (
    <main style={pageStyle}>
      <Link href={`/admin/assessments/${id}`}>← Builder</Link>
      <h1>Candidate sessions</h1>
      {error ? <p style={{ color: "#cf222e" }}>{error}</p> : null}
      <div style={{ display: "grid", gap: 10 }}>
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
              {s.submittedAt ? ` · submitted ${new Date(s.submittedAt).toLocaleString()}` : ""}
            </div>
          </Link>
        ))}
        {rows.length === 0 ? (
          <p style={{ color: "#656d76" }}>No sessions yet.</p>
        ) : null}
      </div>
    </main>
  );
}
