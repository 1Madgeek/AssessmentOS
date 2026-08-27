# Invites and sessions

## Invites

- Default mode is **single-use**: first successful `start` marks the invite `used`.
- **Multi-use** (`mode: multi`, `maxUses`): multiple OTP starts until the cap; still **one completed session per email** per multi invite. Create as “Open link (multi-use)” in admin.
- Retake on single-use = create a **new** invite after used / revoked / expired. A second **pending** invite for the same email on the same assessment is rejected (`409`).
- Open (no-email) single-use invites are capped at **5** pending per assessment.
- Public `GET /invites/:token` returns assessment metadata and `emailBound` only — never candidate email or name.
- Create requires a **published** assessment with **at least one question**.
- Default expiry: **14 days** (`expiresInDays`).

### OTP gate

1. Candidate enters email → `POST /invites/:token/otp`
2. Enters code on start
3. Bound invites must match the stored email (without revealing it)

OTP mail uses template `invite_otp`. Invite mail uses `invite`. Edit at `/admin/email-templates`.

### CAPTCHA and rate limits

- **Turnstile**: set `TURNSTILE_SECRET_KEY` + `NEXT_PUBLIC_TURNSTILE_SITE_KEY`. When unset, CAPTCHA is skipped (local/dev).
- **IP limits** (Postgres): 10 OTP and 20 start attempts per IP per 15 minutes. Behind a proxy, set `TRUST_PROXY=true`.

With a candidate email, create/resend uses Resend (`RESEND_API_KEY`) or the console mailer.

## Sessions and review

- Timed overall + optional per-question timers (assessment rules).
- Activity events: `focus_lost`, `paste`, `tab_hidden`, `open`, `save`, `submit`, `skip`.
- Admin session review: **anti-cheat timeline** with summary chips (focus lost, pastes, longest away) and filters; optional CSV of events.
- Results list: `GET .../sessions?collapse=best` groups by email showing **best total score** (expand for all attempts).
