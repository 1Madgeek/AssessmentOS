"use client";

import { useEffect, useId, useState, type CSSProperties, type ReactNode } from "react";

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

function ConfirmModal({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  const btnBase: CSSProperties = {
    borderRadius: 0,
    padding: "8px 14px",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit",
  };

  return (
    <div
      role="presentation"
      onClick={onCancel}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        display: "grid",
        placeItems: "center",
        padding: 16,
        background: "color-mix(in oklch, black 45%, transparent)",
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 420,
          background: "var(--card, var(--background))",
          color: "var(--card-foreground, var(--foreground))",
          border: "1px solid var(--border)",
          borderRadius: 8,
          padding: 20,
          display: "grid",
          gap: 16,
          boxShadow: "0 16px 48px color-mix(in oklch, black 25%, transparent)",
        }}
      >
        <div style={{ display: "grid", gap: 8 }}>
          <h2 id={titleId} style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
            {title}
          </h2>
          <p
            id={descId}
            style={{ margin: 0, fontSize: 14, color: "var(--muted-foreground)" }}
          >
            {description}
          </p>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          <button
            type="button"
            onClick={onCancel}
            style={{
              ...btnBase,
              background: "var(--background)",
              color: "var(--foreground)",
              border: "1px solid var(--border)",
              fontWeight: 500,
            }}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            autoFocus
            style={{
              ...btnBase,
              background: "var(--primary)",
              color: "var(--primary-foreground)",
              border: "1px solid var(--primary)",
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
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
  const [finishOpen, setFinishOpen] = useState(false);

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
          position: "sticky",
          top: 0,
          alignSelf: "start",
          height: "100vh",
          borderRight: "1px solid var(--border)",
          padding: 16,
          background: "var(--sidebar, var(--muted))",
          display: "flex",
          flexDirection: "column",
          gap: 16,
          minHeight: "100vh",
          boxSizing: "border-box",
        }}
      >
        <div style={{ flexShrink: 0, display: "grid", gap: 16 }}>
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
        </div>

        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            paddingRight: 2,
          }}
        >
          <QuestionNav
            items={navItems}
            currentQuestionId={currentQuestionId}
            onSelect={onSelectQuestion}
          />
        </div>

        {onFinish ? (
          <div
            style={{
              flexShrink: 0,
              paddingTop: 8,
              borderTop: "1px solid var(--border)",
            }}
          >
            <button
              type="button"
              onClick={() => setFinishOpen(true)}
              style={{
                ...actionBtn,
                width: "100%",
                background: "var(--primary)",
                color: "var(--primary-foreground)",
                border: "1px solid var(--primary)",
              }}
            >
              Finish assessment
            </button>
          </div>
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

      <ConfirmModal
        open={finishOpen}
        title="Submit assessment?"
        description="Submit the whole assessment? You will not be able to change answers after this."
        confirmLabel="Submit assessment"
        onCancel={() => setFinishOpen(false)}
        onConfirm={() => {
          setFinishOpen(false);
          onFinish?.();
        }}
      />
    </div>
  );
}
