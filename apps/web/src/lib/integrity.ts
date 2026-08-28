export const INTEGRITY_TERMS_VERSION = "2026-08-28";

/** Embed a per-invite canary as zero-width chars (forensic leak tracing). */
export function canaryMark(inviteOrSessionId: string): string {
  const hex = inviteOrSessionId.replace(/-/g, "").slice(0, 16);
  return [...hex]
    .map((ch) => {
      const n = parseInt(ch, 16);
      // Mix ZWSP / ZWNJ / ZWJ based on nibble
      if (n % 3 === 0) return "\u200B";
      if (n % 3 === 1) return "\u200C";
      return "\u200D";
    })
    .join("");
}

export function withCanary(text: string, id: string): string {
  return `${text}${canaryMark(id)}`;
}

export const DEFAULT_INTEGRITY_NOTICE = {
  enabled: false,
  forbidAiAssistance: true,
  legalWatermark: true,
  canaryTokens: true,
  liabilityLanguage: true,
} as const;

export const DEFAULT_INTEGRITY_SIGNALS = {
  trackPasteSize: true,
  flagCopy: true,
  requireFullscreen: false,
  trackTypingStats: true,
} as const;

export const DEFAULT_PROCTORING = {
  webcamSnapshots: false,
  snapshotIntervalMinSeconds: 45,
  snapshotIntervalMaxSeconds: 120,
  snapshotOnFocusLoss: true,
  retainDays: 30,
} as const;

export function randomSnapshotDelayMs(minSec: number, maxSec: number): number {
  const lo = Math.min(minSec, maxSec);
  const hi = Math.max(minSec, maxSec);
  const sec = lo + Math.random() * (hi - lo);
  return Math.round(sec * 1000);
}

export type IntegrityEventLike = {
  type: string;
  meta: Record<string, unknown> | null;
  createdAt: string;
};

/** Derived 0–100 risk score for session review (not stored). */
export function computeIntegrityRisk(events: IntegrityEventLike[]): {
  score: number;
  tag: "clean" | "review" | "high_risk";
  longestAwayMs: number;
} {
  let score = 0;
  let longestAwayMs = 0;

  for (const e of events) {
    const meta = e.meta ?? {};
    const durationMs =
      typeof meta.durationMs === "number" ? meta.durationMs : 0;
    if (
      e.type === "focus_gained" ||
      e.type === "tab_visible" ||
      e.type === "focus_lost" ||
      e.type === "tab_hidden"
    ) {
      longestAwayMs = Math.max(longestAwayMs, durationMs);
    }

    switch (e.type) {
      case "paste": {
        score += 8;
        const bytes =
          typeof meta.byteLength === "number" ? meta.byteLength : 0;
        if (bytes >= 200) score += 15;
        else if (bytes >= 80) score += 8;
        break;
      }
      case "copy":
      case "cut":
        score += 10;
        break;
      case "focus_lost":
      case "tab_hidden":
        score += 5;
        if (durationMs >= 60_000) score += 12;
        else if (durationMs >= 15_000) score += 6;
        break;
      case "webcam_denied":
        score += 25;
        break;
      case "answer_burst":
        score += 12;
        break;
      case "fullscreen_exit":
        score += 8;
        break;
      case "typing_stats": {
        const median =
          typeof meta.medianGapMs === "number" ? meta.medianGapMs : null;
        if (median != null && median < 30) score += 10;
        break;
      }
      default:
        break;
    }
  }

  score = Math.min(100, Math.round(score));
  const tag: "clean" | "review" | "high_risk" =
    score < 20 ? "clean" : score < 50 ? "review" : "high_risk";
  return { score, tag, longestAwayMs };
}
