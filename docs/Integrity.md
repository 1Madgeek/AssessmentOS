# Integrity & AI-era anti-cheat

AssessmentOS treats integrity as **defense in depth**, not a claim that browser assessments are cheat-proof.

## Honest limits

If a computer-use or browser agent controls the same tab as the candidate, classic signals (blur, paste, focus loss) often look human. You cannot cryptographically prove “no AI helped” in an open web app.

Integrity features help you **raise the cost of cheating**, **make misuse visible**, and give reviewers a **risk score + evidence**. They do **not** guarantee no AI.

## What we ship

1. **Legal watermark + clickwrap** — Versioned terms (no AI / no agents + liability language), visible confidential watermark, machine-readable `noai` markers, per-invite canary tokens for leak tracing.
2. **Browser / behavior signals** — Focus cycles with duration, paste size (not content), copy/cut, typing aggregates, answer-burst detection, optional fullscreen.
3. **Intermittent webcam snapshots** (optional, assessment config) — When enabled, webcam is **mandatory** to start; snapshots use a **random** interval in `[min, max]`; mid-session revoke pauses answering; filmstrip on session review.
4. **Reviewer risk score** — Derived `clean` / `review` / `high_risk` from weighted signals (not a stored verdict).

## Manual verification (strongest vs agents)

For shortlisted candidates, prefer a **live or async oral follow-up**: ask them to explain or defend answers. An agent that completed the written test cannot fully substitute for the person.

Use the candidate directory shortlist + notes to track who needs an oral check.

## Admin messaging

> Integrity signals help you decide whom to interview—not a guarantee of no AI.

Have counsel review clickwrap / liability language for your jurisdiction. Pair legal notice with oral follow-up for high-stakes roles.

## Privacy

- No keylogging; no raw clipboard text (byte length only).
- Webcam: explicit consent, intermittent JPEG snapshots (not continuous video in v1), org retention via `proctoring.retainDays`.
- Do not run face recognition in v1.
