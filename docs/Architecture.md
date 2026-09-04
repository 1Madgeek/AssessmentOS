# Architecture

AssessmentOS is a TypeScript monorepo (pnpm + Turborepo).

## Packages and apps

| Package / app | Role |
|---|---|
| `@assessment-os/core` | Session state machine, timers, plugin registry, shared types |
| `@assessment-os/richtext` | TipTap rich prompts (quotes, code blocks, images) |
| `@assessment-os/db` | Postgres schema (Drizzle) + migrations |
| `@assessment-os/sdk` | Typed HTTP client for the API |
| `@assessment-os/ui` | Candidate assessment shell (nav + timers) |
| `@assessment-os/question-mcq` | MCQ plugin + React builder/renderer/reviewer |
| `@assessment-os/question-coding` | Coding + Monaco; I/O + unit via Judge0/mock |
| `@assessment-os/question-sql` | SQLite SQL plugin |
| `@assessment-os/question-text` | Short-answer plugin |
| `@assessment-os/question-*` | Implemented: mcq, coding, sql, text, video; stubs: `design`, `file` |
| `@assessment-os/runner` | Judge0 client + mock runner + sql.js |
| `@assessment-os/api` | Fastify API (cookie + Bearer auth, orchestration) |
| `@assessment-os/web` | Next.js admin + candidate UI |
| `assessmentos-mcp` | Recruiter MCP server for agents (`npx -y assessmentos-mcp`) |

## Request flow

```text
Admin / Candidate (web)
        │
        ▼
   @assessment-os/sdk  ──HTTP──►  API (Fastify)
                                      │
                    ┌─────────────────┼─────────────────┐
                    ▼                 ▼                 ▼
                 Postgres         Runner            Mailer /
                 (Drizzle)     (mock|Judge0)       Turnstile
```

- Recruiter admin uses cookie session (`credentials: include`).
- MCP / agents use Bearer API tokens (`aos_…`).
- Candidate flows use invite token URLs (`/t/:token`) plus OTP; no recruiter session.

Session mutations go through `@assessment-os/core` helpers — the API must not invent a parallel state machine. See [[Contributing]].
