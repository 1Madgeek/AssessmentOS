"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { SessionView } from "@assessment-os/sdk";
import {
  McqReviewer,
  type McqAnswer,
  type McqConfig,
} from "@assessment-os/question-mcq/react";
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
import {
  StatusBadge,
  type StatusBadgeTone,
} from "@/components/ui/status-badge";
import { errorClass, mutedClass, pageClass } from "@/lib/styles";
import { cn } from "@/lib/utils";
import { getErrorMessage } from "@assessment-os/sdk";
import { computeIntegrityRisk } from "@/lib/integrity";
import { resolveMediaUrl } from "@/lib/media";

type EventRow = {
  id: string;
  type: string;
  questionId: string | null;
  meta: Record<string, unknown> | null;
  createdAt: string;
};

const EVENT_PAGE_SIZE = 10;

const EVENT_COLORS: Record<string, string> = {
  focus_lost: "#cf222e",
  focus_gained: "#cf222e",
  paste: "#9a6700",
  copy: "#9a6700",
  cut: "#9a6700",
  tab_hidden: "#8250df",
  tab_visible: "#8250df",
  save: "#656d76",
  submit: "#1a7f37",
  skip: "#0969da",
  open: "#0969da",
  webcam_snapshot: "#0969da",
  webcam_denied: "#cf222e",
  typing_stats: "#656d76",
  answer_burst: "#bf3989",
  fullscreen_exit: "#cf222e",
  integrity_accepted: "#1a7f37",
};

function sessionStatusTone(status: string): StatusBadgeTone {
  const s = status.toLowerCase();
  if (s === "submitted" || s === "completed") return "success";
  if (s === "in_progress" || s === "active") return "warning";
  if (s === "expired" || s === "cancelled") return "danger";
  return "muted";
}

function summarizeEvents(events: EventRow[]) {
  const focusLost = events.filter((e) => e.type === "focus_lost").length;
  const paste = events.filter((e) => e.type === "paste").length;
  const tabHidden = events.filter((e) => e.type === "tab_hidden").length;
  const copies = events.filter((e) => e.type === "copy" || e.type === "cut").length;
  const bursts = events.filter((e) => e.type === "answer_burst").length;
  const webcamDenied = events.filter((e) => e.type === "webcam_denied").length;
  let longestAwayMs = 0;
  for (const e of events) {
    const d = e.meta && typeof e.meta.durationMs === "number" ? e.meta.durationMs : 0;
    if (
      e.type === "focus_gained" ||
      e.type === "tab_visible" ||
      e.type === "focus_lost" ||
      e.type === "tab_hidden"
    ) {
      longestAwayMs = Math.max(longestAwayMs, d);
    }
  }
  // Fallback heuristic if durations were not recorded
  if (longestAwayMs === 0) {
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
  }
  return { focusLost, paste, tabHidden, copies, bursts, webcamDenied, longestAwayMs };
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

function KpiCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  return (
    <Card size="sm">
      <CardContent className="grid gap-1 pt-(--card-spacing)">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p
          className={cn(
            "font-heading text-2xl font-semibold tracking-tight tabular-nums",
            tone === "success" && "text-emerald-700 dark:text-emerald-400",
            tone === "warning" && "text-amber-700 dark:text-amber-400",
            tone === "danger" && "text-destructive",
          )}
        >
          {value}
        </p>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

export default function SessionReviewPage() {
  const { id, sessionId } = useParams<{ id: string; sessionId: string }>();
  const router = useRouter();
  const [session, setSession] = useState<SessionView | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [eventPage, setEventPage] = useState(0);
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

  useEffect(() => {
    setEventPage(0);
  }, [filter]);

  const summary = useMemo(() => summarizeEvents(events), [events]);
  const integrityRisk = useMemo(
    () =>
      computeIntegrityRisk(
        events.map((e) => ({
          type: e.type,
          meta: e.meta,
          createdAt: e.createdAt,
        })),
      ),
    [events],
  );
  const snapshots = useMemo(() => {
    return events
      .filter((e) => e.type === "webcam_snapshot")
      .map((e) => {
        const assetId =
          e.meta && typeof e.meta.assetId === "string"
            ? e.meta.assetId
            : null;
        return {
          id: e.id,
          createdAt: e.createdAt,
          reason:
            e.meta && typeof e.meta.reason === "string" ? e.meta.reason : null,
          url: assetId ? resolveMediaUrl(`/assets/${assetId}`) : null,
        };
      })
      .filter((s) => s.url);
  }, [events]);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const filtered = useMemo(
    () =>
      filter === "all" ? events : events.filter((e) => e.type === filter),
    [events, filter],
  );
  const eventPageCount = Math.max(
    1,
    Math.ceil(filtered.length / EVENT_PAGE_SIZE),
  );
  const pagedEvents = useMemo(() => {
    const start = eventPage * EVENT_PAGE_SIZE;
    return filtered.slice(start, start + EVENT_PAGE_SIZE);
  }, [filtered, eventPage]);

  const scoreKpis = useMemo(() => {
    if (!session) {
      return {
        earned: 0,
        max: 0,
        pct: 0,
        submitted: 0,
        total: 0,
        fullCredit: 0,
        zeroCredit: 0,
      };
    }
    const attempts = session.attempts;
    const earned = attempts.reduce((sum, a) => sum + (a.score ?? 0), 0);
    const max = attempts.reduce((sum, a) => sum + a.question.points, 0);
    const submitted = attempts.filter(
      (a) => a.status === "submitted" || a.score != null,
    ).length;
    const fullCredit = attempts.filter(
      (a) => a.score != null && a.score === a.question.points && a.score > 0,
    ).length;
    const zeroCredit = attempts.filter(
      (a) => a.score != null && a.score === 0,
    ).length;
    const pct = max > 0 ? Math.round((earned / max) * 100) : 0;
    return {
      earned,
      max,
      pct,
      submitted,
      total: attempts.length,
      fullCredit,
      zeroCredit,
    };
  }, [session]);

  const integrityTone: "default" | "success" | "warning" | "danger" =
    summary.focusLost + summary.paste + summary.tabHidden === 0
      ? "success"
      : summary.focusLost + summary.paste >= 5
        ? "danger"
        : "warning";

  const questionTitleById = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of session?.attempts ?? []) {
      map.set(a.questionId, a.question.title);
    }
    return map;
  }, [session]);

  if (!session) {
    return (
      <main className={pageClass}>
        {error ? <p className={errorClass}>{error}</p> : (
          <p className={mutedClass}>Loading…</p>
        )}
      </main>
    );
  }

  return (
    <main className={pageClass}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-heading text-2xl font-semibold tracking-tight">
              {session.candidateName || "Candidate"}
            </h1>
            <StatusBadge tone={sessionStatusTone(session.status)}>
              {session.status}
            </StatusBadge>
          </div>
          <p className={`${mutedClass} line-clamp-2`}>
            {session.candidateEmail} · {session.assessment.title}
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

      {error ? <p className={errorClass}>{error}</p> : null}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Total score"
          value={`${scoreKpis.earned}/${scoreKpis.max}`}
          hint={`${scoreKpis.pct}% overall`}
          tone={
            scoreKpis.pct >= 70
              ? "success"
              : scoreKpis.pct >= 40
                ? "warning"
                : "danger"
          }
        />
        <KpiCard
          label="Questions graded"
          value={`${scoreKpis.submitted}/${scoreKpis.total}`}
          hint={`${scoreKpis.fullCredit} full · ${scoreKpis.zeroCredit} zero`}
        />
        <KpiCard
          label="Risk score"
          value={String(integrityRisk.score)}
          hint={
            integrityRisk.tag === "clean"
              ? "clean — signals support review, not proof"
              : integrityRisk.tag === "review"
                ? "review recommended"
                : "high risk — verify with oral follow-up"
          }
          tone={
            integrityRisk.tag === "clean"
              ? "success"
              : integrityRisk.tag === "review"
                ? "warning"
                : "danger"
          }
        />
        <KpiCard
          label="Integrity signals"
          value={String(
            summary.focusLost + summary.paste + summary.tabHidden,
          )}
          hint={`${summary.focusLost} focus · ${summary.paste} paste · ${summary.tabHidden} tab`}
          tone={integrityTone}
        />
        <KpiCard
          label="Longest away"
          value={formatDuration(summary.longestAwayMs)}
          hint={`${events.length} activity events`}
          tone={summary.longestAwayMs >= 60_000 ? "warning" : "default"}
        />
      </section>

      <section className="grid gap-3">
        <div>
          <h2 className="font-heading text-lg font-semibold">Answers</h2>
          <p className={mutedClass}>
            Per-question review with scores and candidate responses.
          </p>
        </div>
        <div className="grid gap-4">
          {session.attempts
            .slice()
            .sort((a, b) => a.order - b.order)
            .map((a) => {
              const scorePct =
                a.score != null && a.question.points > 0
                  ? Math.round((a.score / a.question.points) * 100)
                  : null;
              return (
                <Card key={a.id}>
                  <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
                    <div className="grid min-w-0 gap-1">
                      {a.section ? (
                        <CardDescription>
                          Section: {a.section.title}
                        </CardDescription>
                      ) : null}
                      <CardTitle className="text-base">
                        {a.order + 1}. {a.question.title}
                      </CardTitle>
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge tone="muted">{a.question.type}</StatusBadge>
                        <StatusBadge
                          tone={
                            a.status === "submitted" ? "success" : "muted"
                          }
                        >
                          {a.status}
                        </StatusBadge>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-heading text-xl font-semibold tabular-nums">
                        {a.score != null ? a.score : "—"}
                        <span className="text-sm font-normal text-muted-foreground">
                          /{a.question.points}
                        </span>
                      </p>
                      {scorePct != null ? (
                        <p className="text-xs text-muted-foreground">
                          {scorePct}%
                        </p>
                      ) : null}
                    </div>
                  </CardHeader>
                  <CardContent className="grid gap-3">
                    <RichTextView
                      value={
                        (a.question.promptDoc ?? a.question.prompt) as never
                      }
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
                      <pre className="overflow-x-auto text-xs">
                        {JSON.stringify(a.answer, null, 2)}
                      </pre>
                    )}
                  </CardContent>
                </Card>
              );
            })}
        </div>
      </section>

      <section className="grid gap-3">
        <div>
          <h2 className="font-heading text-lg font-semibold">Integrity review</h2>
          <p className={mutedClass}>
            Integrity signals help you decide whom to interview — not a guarantee
            of no AI. For shortlisted candidates, prefer a live or async oral
            follow-up.
          </p>
        </div>
        {snapshots.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Webcam filmstrip</CardTitle>
              <CardDescription>
                Intermittent snapshots from mandatory webcam monitoring.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {snapshots.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className="shrink-0 border border-border"
                    onClick={() => setLightbox(s.url)}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={s.url!}
                      alt={s.reason ? `Snapshot (${s.reason})` : "Snapshot"}
                      className="h-24 w-32 object-cover"
                    />
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        ) : null}
        {lightbox ? (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
            onClick={() => setLightbox(null)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setLightbox(null);
            }}
            role="dialog"
            aria-modal="true"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={lightbox}
              alt="Webcam snapshot"
              className="max-h-[90vh] max-w-[90vw] object-contain"
            />
          </div>
        ) : null}
      </section>

      <section className="grid gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-heading text-lg font-semibold">
              Anti-cheat timeline
            </h2>
            <p className={mutedClass}>
              Focus, paste, and navigation events during the session.
            </p>
          </div>
          <Button
            variant="outline"
            onPress={() => downloadCsv(events)}
            isDisabled={events.length === 0}
          >
            Export events CSV
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard label="Focus lost" value={String(summary.focusLost)} />
          <KpiCard label="Pastes" value={String(summary.paste)} />
          <KpiCard label="Tab hidden" value={String(summary.tabHidden)} />
          <KpiCard
            label="Longest away"
            value={formatDuration(summary.longestAwayMs)}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {[
            "all",
            "focus_lost",
            "focus_gained",
            "paste",
            "copy",
            "tab_hidden",
            "webcam_snapshot",
            "webcam_denied",
            "answer_burst",
            "typing_stats",
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
          {pagedEvents.map((e, i) => (
            <div key={e.id} className="grid grid-cols-[16px_1fr] gap-3 py-2.5">
              <div className="relative">
                <div
                  className="mt-1 ml-0.5 size-2.5 rounded-full"
                  style={{
                    background:
                      EVENT_COLORS[e.type] ?? "var(--muted-foreground)",
                  }}
                />
                {i < pagedEvents.length - 1 ? (
                  <div className="absolute top-3.5 bottom-[-10px] left-[7px] w-px bg-border" />
                ) : null}
              </div>
              <div className="rounded-none border border-border bg-card p-3">
                <div className={mutedClass}>
                  {new Date(e.createdAt).toLocaleString()}
                </div>
                <div
                  className="font-semibold capitalize"
                  style={{
                    color: EVENT_COLORS[e.type] ?? "var(--foreground)",
                  }}
                >
                  {e.type.replaceAll("_", " ")}
                </div>
                {e.questionId ? (
                  <div className={`${mutedClass} text-xs`}>
                    {questionTitleById.get(e.questionId) ??
                      `Question ${e.questionId.slice(0, 8)}…`}
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

        {filtered.length > EVENT_PAGE_SIZE ? (
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              Page {eventPage + 1} of {eventPageCount} · {filtered.length}{" "}
              events
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                isDisabled={eventPage === 0}
                onPress={() => setEventPage((p) => Math.max(0, p - 1))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                isDisabled={eventPage >= eventPageCount - 1}
                onPress={() =>
                  setEventPage((p) => Math.min(eventPageCount - 1, p + 1))
                }
              >
                Next
              </Button>
            </div>
          </div>
        ) : null}
      </section>
    </main>
  );
}
