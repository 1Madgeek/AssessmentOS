"use client";

import type { CSSProperties, ReactNode } from "react";

export function formatMs(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

export type QuestionNavItem = {
  id: string;
  order: number;
  title: string;
  status: string;
  remainingMs: number;
  sectionTitle?: string | null;
};

export function statusIcon(status: string): string {
  switch (status) {
    case "submitted":
      return "✓";
    case "in_progress":
      return "⏳";
    case "skipped":
      return "⏸";
    case "locked":
      return "🔒";
    case "expired":
      return "⌛";
    default:
      return "○";
  }
}

export function TimerBadge({
  label,
  remainingMs,
  warnBelowMs = 60_000,
}: {
  label: string;
  remainingMs: number;
  warnBelowMs?: number;
}) {
  const warn = remainingMs <= warnBelowMs;
  return (
    <div
      style={{
        display: "inline-flex",
        gap: 8,
        alignItems: "center",
        padding: "6px 10px",
        borderRadius: 6,
        background: warn
          ? "color-mix(in oklch, var(--destructive) 15%, transparent)"
          : "var(--muted)",
        color: warn ? "var(--destructive)" : "var(--foreground)",
        border: "1px solid var(--border)",
        fontVariantNumeric: "tabular-nums",
        fontWeight: 600,
        fontSize: 14,
      }}
    >
      <span style={{ fontWeight: 500, opacity: 0.7 }}>{label}</span>
      <span>{formatMs(remainingMs)}</span>
    </div>
  );
}

export function QuestionNav({
  items,
  currentQuestionId,
  onSelect,
}: {
  items: QuestionNavItem[];
  currentQuestionId?: string | null;
  onSelect: (questionId: string) => void;
}) {
  let lastSection: string | null | undefined = undefined;
  return (
    <nav style={{ display: "grid", gap: 8 }}>
      {items.map((item) => {
        const locked = item.status === "locked";
        const active = item.id === currentQuestionId;
        const showSection =
          item.sectionTitle && item.sectionTitle !== lastSection;
        if (item.sectionTitle) lastSection = item.sectionTitle;
        return (
          <div key={item.id} style={{ display: "grid", gap: 6 }}>
            {showSection ? (
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  color: "var(--muted-foreground)",
                  marginTop: 4,
                }}
              >
                {item.sectionTitle}
              </div>
            ) : null}
            <button
              type="button"
              disabled={locked}
              onClick={() => onSelect(item.id)}
              style={{
                textAlign: "left",
                padding: "10px 12px",
                borderRadius: 8,
                border: active
                  ? "2px solid var(--primary)"
                  : "1px solid var(--border)",
                background: active
                  ? "color-mix(in oklch, var(--primary) 18%, transparent)"
                  : "var(--card)",
                color: "var(--card-foreground)",
                cursor: locked ? "not-allowed" : "pointer",
                opacity: locked ? 0.55 : 1,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>
                  {statusIcon(item.status)} {item.order + 1}. {item.title}
                </span>
                {item.status !== "locked" && item.status !== "not_started" ? (
                  <span style={{ fontVariantNumeric: "tabular-nums" }}>
                    {formatMs(item.remainingMs)}
                  </span>
                ) : null}
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: "var(--muted-foreground)",
                  marginTop: 4,
                }}
              >
                {item.status.replaceAll("_", " ")}
              </div>
            </button>
          </div>
        );
      })}
    </nav>
  );
}

export function AssessmentShell({
  title,
  overallRemainingMs,
  questionRemainingMs,
  navItems,
  currentQuestionId,
  onSelectQuestion,
  onSkip,
  onSubmit,
  submitLabel = "Submit answer",
  onFinish,
  allowSkip,
  children,
}: {
  title: string;
  overallRemainingMs: number;
  questionRemainingMs?: number | null;
  navItems: QuestionNavItem[];
  currentQuestionId?: string | null;
  onSelectQuestion: (id: string) => void;
  onSkip?: () => void;
  onSubmit?: () => void;
  /** Label for the primary question action (e.g. "Submit answer" or "Next question"). */
  submitLabel?: string;
  /** End the whole assessment (shown in the sidebar, away from per-question actions). */
  onFinish?: () => void;
  allowSkip?: boolean;
  children: ReactNode;
}) {
  const actionBtn: CSSProperties = {
    borderRadius: 0,
    padding: "8px 14px",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit",
  };

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "280px 1fr",
        minHeight: "100vh",
        fontFamily: "var(--font-sans), ui-sans-serif, system-ui, sans-serif",
        background: "var(--background)",
        color: "var(--foreground)",
      }}
    >
      <aside
        style={{
          borderRight: "1px solid var(--border)",
          padding: 16,
          background: "var(--sidebar, var(--muted))",
          display: "grid",
          gridTemplateRows: "auto auto auto 1fr auto",
          gap: 16,
          alignContent: "start",
          minHeight: "100vh",
        }}
      >
        <div>
          <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
            Assessment
          </div>
          <h1 style={{ fontSize: 18, margin: "4px 0 0" }}>{title}</h1>
        </div>
        <TimerBadge label="Overall" remainingMs={overallRemainingMs} />
        {questionRemainingMs != null ? (
          <TimerBadge label="Question" remainingMs={questionRemainingMs} />
        ) : null}
        <QuestionNav
          items={navItems}
          currentQuestionId={currentQuestionId}
          onSelect={onSelectQuestion}
        />
        {onFinish ? (
          <button
            type="button"
            onClick={() => {
              if (
                window.confirm(
                  "Submit the whole assessment? You will not be able to change answers after this.",
                )
              ) {
                onFinish();
              }
            }}
            style={{
              ...actionBtn,
              marginTop: "auto",
              background: "transparent",
              color: "var(--muted-foreground)",
              border: "1px solid var(--border)",
              fontWeight: 500,
            }}
          >
            Finish assessment
          </button>
        ) : null}
      </aside>
      <main
        style={{
          padding: 24,
          display: "grid",
          gap: 16,
          alignContent: "start",
          background: "var(--background)",
        }}
      >
        {children}
        {onSkip || onSubmit ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {allowSkip && onSkip ? (
              <button
                type="button"
                onClick={onSkip}
                style={{
                  ...actionBtn,
                  background: "var(--background)",
                  color: "var(--foreground)",
                  border: "1px solid var(--border)",
                  fontWeight: 500,
                }}
              >
                Skip question
              </button>
            ) : null}
            {onSubmit ? (
              <button
                type="button"
                onClick={onSubmit}
                style={{
                  ...actionBtn,
                  background: "var(--primary)",
                  color: "var(--primary-foreground)",
                  border: "1px solid var(--primary)",
                }}
              >
                {submitLabel}
              </button>
            ) : null}
          </div>
        ) : null}
      </main>
    </div>
  );
}
