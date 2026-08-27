"use client";

import { useEffect, useMemo, useState } from "react";
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
import {
  SqlReviewer,
  type SqlAnswer,
  type SqlConfig,
  type SqlWorkspace,
} from "@assessment-os/question-sql/react";
import {
  TextReviewer,
  type TextAnswer,
  type TextConfig,
} from "@assessment-os/question-text/react";
import { RichTextView } from "@assessment-os/richtext/react";
import "@assessment-os/richtext/styles.css";
import { api } from "@/lib/api";
import { btnSecondary, cardStyle, pageStyle } from "@/lib/styles";

type EventRow = {
  id: string;
  type: string;
  questionId: string | null;
  meta: Record<string, unknown> | null;
  createdAt: string;
};

const EVENT_COLORS: Record<string, string> = {
  focus_lost: "#cf222e",
  paste: "#9a6700",
  tab_hidden: "#8250df",
  save: "#656d76",
  submit: "#1a7f37",
  skip: "#0969da",
  open: "#0969da",
};

function summarizeEvents(events: EventRow[]) {
  const focusLost = events.filter((e) => e.type === "focus_lost").length;
  const paste = events.filter((e) => e.type === "paste").length;
  const tabHidden = events.filter((e) => e.type === "tab_hidden").length;
  let longestAwayMs = 0;
  const awayTypes = new Set(["focus_lost", "tab_hidden"]);
  for (let i = 0; i < events.length; i++) {
    const e = events[i]!;
    if (!awayTypes.has(e.type)) continue;
    const t0 = new Date(e.createdAt).getTime();
    const next = events.slice(i + 1).find((x) => !awayTypes.has(x.type));
    const t1 = next
      ? new Date(next.createdAt).getTime()
      : events[events.length - 1]
        ? new Date(events[events.length - 1]!.createdAt).getTime()
        : t0;
    longestAwayMs = Math.max(longestAwayMs, Math.max(0, t1 - t0));
  }
  return { focusLost, paste, tabHidden, longestAwayMs };
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}m ${rem}s`;
}

function downloadCsv(events: EventRow[]) {
  const header = "createdAt,type,questionId,meta\n";
  const rows = events
    .map((e) => {
      const meta = e.meta ? JSON.stringify(e.meta).replaceAll('"', '""') : "";
      return `${e.createdAt},${e.type},${e.questionId ?? ""},"${meta}"`;
    })
    .join("\n");
  const blob = new Blob([header + rows], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "activity-events.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export default function SessionReviewPage() {
  const { id, sessionId } = useParams<{ id: string; sessionId: string }>();
  const router = useRouter();
  const [session, setSession] = useState<SessionView | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");

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

  const summary = useMemo(() => summarizeEvents(events), [events]);
  const filtered = useMemo(
    () =>
      filter === "all" ? events : events.filter((e) => e.type === filter),
    [events, filter],
  );

  if (!session) {
    return (
      <main style={pageStyle}>
        {error ? <p style={{ color: "#cf222e" }}>{error}</p> : "Loading…"}
      </main>
    );
  }

  const chip = (label: string, value: string | number, tone?: string) => (
    <div
      style={{
        padding: "10px 14px",
        borderRadius: 8,
        background: "#fff",
        border: "1px solid #d0d7de",
        minWidth: 120,
      }}
    >
      <div style={{ fontSize: 12, color: "#656d76" }}>{label}</div>
      <div style={{ fontWeight: 700, fontSize: 18, color: tone ?? "#24292f" }}>
        {value}
      </div>
    </div>
  );

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
              {a.section ? (
                <div style={{ fontSize: 12, color: "#656d76", marginBottom: 4 }}>
                  Section: {a.section.title}
                </div>
              ) : null}
              <h3>
                {a.order + 1}. {a.question.title}{" "}
                <span style={{ fontWeight: 400, color: "#656d76" }}>
                  ({a.status}
                  {a.score != null ? ` · ${a.score}/${a.question.points}` : ""})
                </span>
              </h3>
              <RichTextView value={(a.question.promptDoc ?? a.question.prompt) as never} />
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
              ) : a.question.type === "sql" ? (
                <SqlReviewer
                  config={a.question.config as SqlConfig}
                  answer={a.answer as SqlAnswer | null}
                  workspace={a.workspace as SqlWorkspace | null}
                  score={a.score}
                  maxScore={a.question.points}
                  gradeDetails={a.gradeDetails}
                />
              ) : a.question.type === "text" ? (
                <TextReviewer
                  config={a.question.config as TextConfig}
                  answer={a.answer as TextAnswer | null}
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

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginTop: 32,
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <h2 style={{ margin: 0 }}>Anti-cheat timeline</h2>
        <button
          type="button"
          style={btnSecondary}
          onClick={() => downloadCsv(events)}
          disabled={events.length === 0}
        >
          Export CSV
        </button>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", margin: "12px 0" }}>
        {chip("Focus lost", summary.focusLost, "#cf222e")}
        {chip("Pastes", summary.paste, "#9a6700")}
        {chip("Tab hidden", summary.tabHidden, "#8250df")}
        {chip("Longest away", formatDuration(summary.longestAwayMs))}
        {chip("Total events", events.length)}
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        {["all", "focus_lost", "paste", "tab_hidden", "open", "save", "submit", "skip"].map(
          (t) => (
            <button
              key={t}
              type="button"
              onClick={() => setFilter(t)}
              style={{
                ...btnSecondary,
                background: filter === t ? "#ddf4ff" : "#fff",
                borderColor: filter === t ? "#0969da" : "#d0d7de",
              }}
            >
              {t === "all" ? "All" : t.replaceAll("_", " ")}
            </button>
          ),
        )}
      </div>

      <div style={{ display: "grid", gap: 0, position: "relative" }}>
        {filtered.map((e, i) => (
          <div
            key={e.id}
            style={{
              display: "grid",
              gridTemplateColumns: "16px 1fr",
              gap: 12,
              padding: "10px 0",
            }}
          >
            <div style={{ position: "relative" }}>
              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 999,
                  background: EVENT_COLORS[e.type] ?? "#656d76",
                  marginTop: 4,
                  marginLeft: 3,
                }}
              />
              {i < filtered.length - 1 ? (
                <div
                  style={{
                    position: "absolute",
                    left: 7,
                    top: 14,
                    bottom: -10,
                    width: 2,
                    background: "#d0d7de",
                  }}
                />
              ) : null}
            </div>
            <div
              style={{
                padding: "8px 12px",
                background: "#fff",
                border: "1px solid #d0d7de",
                borderRadius: 8,
              }}
            >
              <div style={{ fontSize: 12, color: "#656d76" }}>
                {new Date(e.createdAt).toLocaleString()}
              </div>
              <div style={{ fontWeight: 600, color: EVENT_COLORS[e.type] ?? "#24292f" }}>
                {e.type.replaceAll("_", " ")}
              </div>
              {e.questionId ? (
                <div style={{ fontSize: 13, color: "#656d76" }}>
                  Question {e.questionId.slice(0, 8)}…
                </div>
              ) : null}
              {e.meta ? (
                <pre
                  style={{
                    margin: "6px 0 0",
                    fontSize: 12,
                    color: "#656d76",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {JSON.stringify(e.meta)}
                </pre>
              ) : null}
            </div>
          </div>
        ))}
        {filtered.length === 0 ? (
          <p style={{ color: "#656d76" }}>No events recorded.</p>
        ) : null}
      </div>
    </main>
  );
}
