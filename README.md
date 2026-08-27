# AssessmentOS

Open-source infrastructure for technical assessments.

AssessmentOS lets recruiters author multi-question assessments (MCQ, coding, SQL, short answer, and stub types), invite candidates, run timed sessions with activity events, and review results — with a plugin contract so new question types plug in without rewriting the core.

## Architecture

| Package / app | Role |
|---|---|
| `@assessment-os/core` | Session state machine, timers, plugin registry, shared types |
| `@assessment-os/db` | Postgres schema (Drizzle) + migrations |
| `@assessment-os/sdk` | Typed HTTP client for the API |
| `@assessment-os/ui` | Candidate assessment shell (nav + timers) |
| `@assessment-os/question-mcq` | MCQ plugin + React builder/renderer/reviewer |
| `@assessment-os/question-coding` | Coding plugin + Monaco; I/O + unit (pytest/Jest/PHPUnit) via Judge0/mock |
| `@assessment-os/question-sql` | SQLite SQL plugin (schema/seed + expected rows) |
| `@assessment-os/question-text` | Short-answer / text plugin |
| `@assessment-os/question-*` | Stubs (`video`, `design`, `file`) |
| `@assessment-os/runner` | Judge0 client + mock runner + sql.js SQLite executor |
| `@assessment-os/api` | Fastify API (cookie + Bearer token auth, orchestration) |
| `@assessment-os/web` | Next.js admin + candidate UI |
| `@assessment-os/mcp` | Recruiter MCP server for Claude/Codex/Cursor agents |

## Local setup

**Requirements:** Node 22+, pnpm 9+, Docker (for Postgres; Judge0 optional). For PHP unit coding questions locally: `php` + `phpunit` on PATH.

Postgres is exposed on **localhost:5433** (so it does not clash with a local Postgres on 5432).

```bash
cp .env.example .env

# Postgres (+ optional Judge0/redis)
docker compose up -d postgres

pnpm install
pnpm --filter @assessment-os/core build
pnpm --filter @assessment-os/db build
pnpm db:migrate
pnpm db:seed

# Terminal 1 — API (mock runner when JUDGE0_URL unset)
pnpm --filter @assessment-os/api dev

# Terminal 2 — Web
pnpm --filter @assessment-os/web dev
```

- Admin: http://localhost:3000/admin/login  
  Demo user: `recruiter@assessmentos.dev` / `password123`
- Candidate URL is printed by `pnpm db:seed` (also create invites from the builder)

### Optional Judge0

```bash
docker compose up -d
# set JUDGE0_URL=http://localhost:2358 and USE_MOCK_RUNNER=false in .env
```

Without Judge0, coding questions use the local mock runner (real process execution for Python/JS/PHP I/O, plus pytest/Jest/PHPUnit for unit mode). For Python unit mode, install pytest (`pip install pytest`). For PHP unit mode, install PHP and PHPUnit. Jest is pulled via `npx` when needed.

SQL questions run in-process against **SQLite** (via sql.js) — no extra database container.

## MCP (agents)

Agents can create assessments and query results via `@assessment-os/mcp`. Create an API token while logged in as a recruiter (`POST /auth/tokens`), then configure Cursor / Claude Desktop as described in [apps/mcp/README.md](./apps/mcp/README.md).

```bash
pnpm --filter @assessment-os/mcp build
```

## Invites

- Each invite token is **single-use**: the first successful `start` marks it `used`.
- Retake = create a **new invite** after the previous one is **used**, **revoked**, or **expired**. A second **pending** invite for the same email on the same assessment is rejected (`409`).
- Open (no-email) invites are capped at **5** pending per assessment.
- Public `GET /invites/:token` returns assessment metadata and `emailBound` only — never the candidate email or name.
- Starting requires a **email OTP**: candidate enters email → `POST /invites/:token/otp` → enters code on start. Bound invites must match the stored email (without revealing it).
- **CAPTCHA**: set `TURNSTILE_SECRET_KEY` (API) and `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (web). When unset, CAPTCHA is skipped for local/dev. When set, OTP and start require a valid Turnstile token.
- **IP rate limits** (Postgres): 10 OTP requests and 20 start attempts per IP per 15 minutes. Behind a reverse proxy, set `TRUST_PROXY=true` so client IP comes from `X-Forwarded-For`.
- Admin invite list still shows full candidate emails to authenticated recruiters. Expired pending invites show status `expired` (computed); Resend is only for live pending invites.
- Create requires a **published** assessment with **at least one question**.
- Default expiry is **14 days** (`expiresInDays` on create).
- With a candidate email, create/resend uses the recruiter’s `invite` email template via **Resend** (`RESEND_API_KEY`) or the console mailer locally. OTP uses the `invite_otp` template.
- Edit templates at `/admin/email-templates`. Invite placeholders: `{{candidateName}}`, `{{candidateEmail}}`, `{{assessmentTitle}}`, `{{inviteUrl}}`, `{{expiresAt}}`, `{{recruiterName}}`. OTP placeholders: `{{otp}}`, `{{assessmentTitle}}`, `{{expiresAt}}`.

## Testing

```bash
# Unit tests (core session, coding/MCQ grading, parsers, auth helpers, candidate-safe config)
pnpm test

# Also runs runner + API integration tests (needs Postgres on :5433 and pytest)
docker compose up -d postgres
pnpm db:migrate
pnpm --filter @assessment-os/runner test
pnpm --filter @assessment-os/api test
```

Python unit-mode integration requires `pip install pytest`. Jest integration uses `npx jest`.

| Script | Description |
|---|---|
| `pnpm build` | Turbo build all packages/apps |
| `pnpm test` | Run package tests |
| `pnpm db:migrate` | Apply Drizzle migrations |
| `pnpm db:seed` | Seed demo recruiter + Backend Engineer assessment |
| `pnpm --filter @assessment-os/core test` | Core session unit tests |

## License

AGPL-3.0-only — see [LICENSE](./LICENSE).
