import type { CSSProperties } from "react";

/** Shared layout class names (prefer these for new UI). */
export const pageClass = "mx-auto w-full max-w-5xl space-y-4";
export const cardClass =
  "rounded-lg border border-border bg-card p-4 text-card-foreground shadow-sm";
export const mutedClass = "text-sm text-muted-foreground";
export const errorClass = "text-sm text-destructive";
export const preClass =
  "overflow-x-auto rounded-lg border border-border bg-muted/40 p-3 font-mono text-xs";
export const codeInlineClass =
  "rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]";

/**
 * Legacy inline styles mapped to CSS variables so existing pages inherit
 * the Lyra / Neutral dark theme without a full rewrite.
 */
export const pageStyle: CSSProperties = {
  fontFamily: "var(--font-sans), ui-sans-serif, system-ui, sans-serif",
  maxWidth: 960,
  margin: "0 auto",
  padding: 24,
  color: "var(--foreground)",
};

export const cardStyle: CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: 16,
  background: "var(--card)",
  color: "var(--card-foreground)",
};

export const btnPrimary: CSSProperties = {
  background: "var(--primary)",
  color: "var(--primary-foreground)",
  border: "none",
  padding: "8px 14px",
  borderRadius: 6,
  cursor: "pointer",
  fontWeight: 600,
};

export const btnSecondary: CSSProperties = {
  background: "var(--secondary)",
  color: "var(--secondary-foreground)",
  border: "1px solid var(--border)",
  padding: "8px 14px",
  borderRadius: 6,
  cursor: "pointer",
};

export const inputStyle: CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  borderRadius: 6,
  border: "1px solid var(--input)",
  boxSizing: "border-box",
  background: "var(--background)",
  color: "var(--foreground)",
};
