# AssessmentOS

Open-source infrastructure for technical assessments.

Recruiters author multi-question assessments (MCQ, coding, SQL, short answer), invite candidates, run timed sessions with activity events, and review results — with a plugin contract so new question types plug in without rewriting the core.

**License:** AGPL-3.0-only

## Quick start

1. Follow [[Local-Setup]]
2. Admin: http://localhost:3000/admin/login  
   Demo: `recruiter@assessmentos.dev` / `password123`
3. Candidate invite URL is printed by `pnpm db:seed`

## Documentation

- [[Local-Setup]] — install, migrate, seed, Judge0
- [[Deploy-K8s]] — Docker images + Kubernetes (public-repo-safe templates)
- [[Architecture]] — packages and request flow
- [[Question-Types]] — MCQ, coding, SQL, text
- [[Coding-Runner]] — mock vs Judge0, unit/I/O, limits
- [[Invites-and-Sessions]] — OTP, multi-use, anti-cheat, results
- [[Authoring]] — rich text, bank, pools, sections
- [[MCP]] — agent tools for Cursor / Claude
- [[Roadmap]] — shipped v1 and next phases
- [[Contributing]] — plugins and PR basics

In-repo source of truth for this wiki: the `docs/` folder on `main`. Edits in GitHub Wiki alone will be overwritten on the next sync.

## Maintainer note — wiki sync

Docs sync to this wiki via GitHub Actions (`.github/workflows/sync-wiki.yml`).

One-time setup:

1. Enable **Settings → Features → Wikis**.
2. Create any first wiki page in the UI (initializes `*.wiki.git`).
3. Add Actions secret **`WIKI_TOKEN`**: a PAT that can push to this repo’s wiki (classic `repo`, or fine-grained Contents read/write).

Pushes to `main` that change `docs/**` (or manual **workflow_dispatch**) republish these pages.
