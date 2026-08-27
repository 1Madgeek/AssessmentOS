"use client";

import { useEffect, useMemo, useState } from "react";
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
import { downloadBlob } from "@/lib/download";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { errorClass, mutedClass, pageClass } from "@/lib/styles";
import { getErrorMessage } from "@assessment-os/sdk";

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
  const [exportBusy, setExportBusy] = useState(false);

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
      <main className={pageClass}>
        {error ? <p className={errorClass}>{error}</p> : "Loading…"}
      </main>
    );
  }

  return (
    <main className={pageClass}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            {session.candidateName} — {session.assessment.title}
          </h1>
          <p className={mutedClass}>
            {session.candidateEmail} · {session.status}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            isDisabled={exportBusy}
            onPress={() =>
              void (async () => {
                setExportBusy(true);
                try {
                  const blob = await api.exportSessionCsv(id, sessionId);
                  downloadBlob(blob, `session-${sessionId}.csv`);
                } catch (err) {
                  setError(getErrorMessage(err, "CSV export failed"));
                } finally {
                  setExportBusy(false);
                }
              })()
            }
          >
            Download CSV
          </Button>
          <Button
            variant="outline"
            isDisabled={exportBusy}
            onPress={() =>
              void (async () => {
                setExportBusy(true);
                try {
                  const blob = await api.exportSessionPdf(id, sessionId);
                  downloadBlob(blob, `session-${sessionId}.pdf`);
                } catch (err) {
                  setError(getErrorMessage(err, "PDF export failed"));
                } finally {
                  setExportBusy(false);
                }
              })()
            }
          >
            Download PDF
          </Button>
        </div>
      </div>

      <h2 className="font-heading text-lg font-semibold">Answers</h2>
      <div className="grid gap-4">
        {session.attempts
          .slice()
          .sort((a, b) => a.order - b.order)
          .map((a) => (
            <Card key={a.id}>
              <CardHeader>
                {a.section ? (
                  <CardDescription>Section: {a.section.title}</CardDescription>
                ) : null}
                <CardTitle className="text-base">
                  {a.order + 1}. {a.question.title}{" "}
                  <span className="font-normal text-muted-foreground">
                    ({a.status}
                    {a.score != null ? ` · ${a.score}/${a.question.points}` : ""})
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3">
                <RichTextView
                  value={(a.question.promptDoc ?? a.question.prompt) as never}
                />
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
              </CardContent>
            </Card>
          ))}
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <h2 className="m-0 font-heading text-lg font-semibold">
          Anti-cheat timeline
        </h2>
        <Button
          variant="outline"
          onPress={() => downloadCsv(events)}
          isDisabled={events.length === 0}
        >
          Export CSV
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Badge variant="outline">Focus lost: {summary.focusLost}</Badge>
        <Badge variant="outline">Pastes: {summary.paste}</Badge>
        <Badge variant="outline">Tab hidden: {summary.tabHidden}</Badge>
        <Badge variant="outline">
          Longest away: {formatDuration(summary.longestAwayMs)}
        </Badge>
        <Badge variant="secondary">Total events: {events.length}</Badge>
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        {[
          "all",
          "focus_lost",
          "paste",
          "tab_hidden",
          "open",
          "save",
          "submit",
          "skip",
        ].map((t) => (
          <Button
            key={t}
            size="sm"
            variant={filter === t ? "default" : "outline"}
            onPress={() => setFilter(t)}
          >
            {t === "all" ? "All" : t.replaceAll("_", " ")}
          </Button>
        ))}
      </div>

      <div className="grid gap-0">
        {filtered.map((e, i) => (
          <div key={e.id} className="grid grid-cols-[16px_1fr] gap-3 py-2.5">
            <div className="relative">
              <div
                className="mt-1 ml-0.5 size-2.5 rounded-full"
                style={{
                  background: EVENT_COLORS[e.type] ?? "var(--muted-foreground)",
                }}
              />
              {i < filtered.length - 1 ? (
                <div
                  className="absolute top-3.5 bottom-[-10px] left-[7px] w-px bg-border"
                />
              ) : null}
            </div>
            <div className="rounded-lg border border-border bg-card p-3">
              <div className={mutedClass}>
                {new Date(e.createdAt).toLocaleString()}
              </div>
              <div
                className="font-semibold"
                style={{ color: EVENT_COLORS[e.type] ?? "var(--foreground)" }}
              >
                {e.type.replaceAll("_", " ")}
              </div>
              {e.questionId ? (
                <div className={`${mutedClass} text-xs`}>
                  Question {e.questionId.slice(0, 8)}…
                </div>
              ) : null}
              {e.meta ? (
                <pre className="mt-1 overflow-x-auto whitespace-pre-wrap font-mono text-xs text-muted-foreground">
                  {JSON.stringify(e.meta)}
                </pre>
              ) : null}
            </div>
          </div>
        ))}
        {filtered.length === 0 ? (
          <p className={mutedClass}>No events recorded.</p>
        ) : null}
      </div>
      {error ? <p className={errorClass}>{error}</p> : null}
    </main>
  );
}
