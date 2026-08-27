# AssessmentOS

Open-source infrastructure for technical assessments.

AssessmentOS lets recruiters author multi-question assessments (MCQ, coding, and stub types), invite candidates, run timed sessions with activity events, and review results — with a plugin contract so new question types plug in without rewriting the core.

## Architecture

| Package / app | Role |
|---|---|
| `@assessment-os/core` | Session state machine, timers, plugin registry, shared types |
| `@assessment-os/db` | Postgres schema (Drizzle) + migrations |
| `@assessment-os/sdk` | Typed HTTP client for the API |
| `@assessment-os/ui` | Candidate assessment shell (nav + timers) |
| `@assessment-os/question-mcq` | MCQ plugin + React builder/renderer/reviewer |
| `@assessment-os/question-coding` | Coding plugin + Monaco renderer; grades via Judge0/mock |
| `@assessment-os/question-*` | Stubs (`sql`, `text`, `video`, `design`, `file`) |
| `@assessment-os/runner` | Judge0 client + offline mock runner (I/O + pytest/Jest unit) |
| `@assessment-os/api` | Fastify API (cookie + Bearer token auth, orchestration) |
| `@assessment-os/web` | Next.js admin + candidate UI |
| `@assessment-os/mcp` | Recruiter MCP server for Claude/Codex/Cursor agents |

## Local setup

**Requirements:** Node 22+, pnpm 9+, Docker (for Postgres; Judge0 optional).

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

Without Judge0, coding questions use the local mock runner (real process execution for Python/JS I/O, plus pytest/Jest for unit mode). For Python unit mode, install pytest (`pip install pytest`). Jest is pulled via `npx` when needed.

## MCP (agents)

Agents can create assessments and query results via `@assessment-os/mcp`. Create an API token while logged in as a recruiter (`POST /auth/tokens`), then configure Cursor / Claude Desktop as described in [apps/mcp/README.md](./apps/mcp/README.md).

```bash
pnpm --filter @assessment-os/mcp build
```

## Invites

- Each invite token is **single-use**: the first successful `start` marks it `used`.
- Retake = create a **new invite** (same email is allowed on a new invite).
- Optional email binding: if set on the invite, start must match (case-insensitive).
- Default expiry is **14 days** (`expiresInDays` on create).
- With a candidate email, create/resend uses the recruiter’s `invite` email template via **Resend** (`RESEND_API_KEY`) or the console mailer locally.
- Edit templates at `/admin/email-templates`. Placeholders: `{{candidateName}}`, `{{candidateEmail}}`, `{{assessmentTitle}}`, `{{inviteUrl}}`, `{{expiresAt}}`, `{{recruiterName}}`.

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
