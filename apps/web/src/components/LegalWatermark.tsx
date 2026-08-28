"use client";

type Props = {
  orgLabel?: string;
  inviteShortId: string;
  show: boolean;
};

/** Persistent confidential / no-AI notice on question surfaces. */
export function LegalWatermark({ orgLabel, inviteShortId, show }: Props) {
  if (!show) return null;
  const who = orgLabel?.trim() || "Hiring organization";
  return (
    <p
      className="border border-dashed border-border bg-muted/40 px-2 py-1.5 text-[11px] leading-snug text-muted-foreground"
      data-ai-prohibited="true"
      data-noai="true"
      rel="nofollow noai noimageai"
    >
      CONFIDENTIAL © {who} · Invite {inviteShortId} · AI/agent use prohibited ·
      Unauthorized use may result in disqualification and legal action.
      {/* Machine-readable: copyrighted assessment content; no AI training / automated solving. */}
    </p>
  );
}
