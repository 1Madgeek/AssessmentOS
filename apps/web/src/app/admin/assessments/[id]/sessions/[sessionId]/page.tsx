"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import type { SessionView } from "@assessment-os/sdk";
import { McqReviewer, type McqAnswer, type McqConfig } from "@assessment-os/question-mcq/react";
import {
  CodingReviewer,
  type CodingAnswer,
  type CodingConfig,
  type CodingWorkspace,
} from "@assessment-os/question-coding/react";
import { api } from "@/lib/api";
import { cardStyle, pageStyle } from "@/lib/styles";

type EventRow = {
  id: string;
  type: string;
  questionId: string | null;
  meta: Record<string, unknown> | null;
  createdAt: string;
};

export default function SessionReviewPage() {
  const { id, sessionId } = useParams<{ id: string; sessionId: string }>();
  const router = useRouter();
  const [session, setSession] = useState<SessionView | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const me = await api.me();
      if (!me) {
        router.replace("/admin/login");
        return;
      }
      const data = await api.getSessionReview(id, sessionId);
      setSession(data.session);
      setEvents(data.events);
    })().catch((err) =>
      setError(err instanceof Error ? err.message : "Failed to load"),
    );
  }, [id, sessionId, router]);

  if (!session) {
    return (
      <main style={pageStyle}>
        {error ? <p style={{ color: "#cf222e" }}>{error}</p> : "Loading…"}
      </main>
    );
  }

  return (
    <main style={pageStyle}>
      <Link href={`/admin/assessments/${id}/sessions`}>← Sessions</Link>
      <h1>
        {session.candidateName} — {session.assessment.title}
      </h1>
      <p style={{ color: "#656d76" }}>
        {session.candidateEmail} · {session.status}
      </p>

      <h2>Answers</h2>
      <div style={{ display: "grid", gap: 16 }}>
        {session.attempts
          .slice()
          .sort((a, b) => a.order - b.order)
          .map((a) => (
            <div key={a.id} style={cardStyle}>
              <h3>
                {a.order + 1}. {a.question.title}{" "}
                <span style={{ fontWeight: 400, color: "#656d76" }}>
                  ({a.status}
                  {a.score != null ? ` · ${a.score}/${a.question.points}` : ""})
                </span>
              </h3>
              <p style={{ whiteSpace: "pre-wrap" }}>{a.question.prompt}</p>
              {a.question.type === "mcq" ? (
                <McqReviewer
                  config={a.question.config as McqConfig}
                  answer={a.answer as McqAnswer | null}
                  score={a.score}
                  maxScore={a.question.points}
                />
              ) : a.question.type === "coding" ? (
                <CodingReviewer
                  config={a.question.config as CodingConfig}
                  answer={a.answer as CodingAnswer | null}
                  workspace={a.workspace as CodingWorkspace | null}
                  score={a.score}
                  maxScore={a.question.points}
                  gradeDetails={a.gradeDetails}
                />
              ) : (
                <pre>{JSON.stringify(a.answer, null, 2)}</pre>
              )}
            </div>
          ))}
      </div>

      <h2 style={{ marginTop: 32 }}>Activity events</h2>
      <div style={{ display: "grid", gap: 6 }}>
        {events.map((e) => (
          <div
            key={e.id}
            style={{
              fontSize: 13,
              fontFamily: "ui-monospace, monospace",
              padding: "6px 8px",
              background: "#fff",
              border: "1px solid #d0d7de",
              borderRadius: 6,
            }}
          >
            {new Date(e.createdAt).toLocaleString()} — <strong>{e.type}</strong>
            {e.questionId ? ` · q=${e.questionId.slice(0, 8)}` : ""}
            {e.meta ? ` · ${JSON.stringify(e.meta)}` : ""}
          </div>
        ))}
        {events.length === 0 ? (
          <p style={{ color: "#656d76" }}>No events recorded.</p>
        ) : null}
      </div>
    </main>
  );
}
