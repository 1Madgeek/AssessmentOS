# Local setup

**Requirements:** Node 22+, pnpm 9+, Docker (Postgres; Judge0 optional).

Optional for coding unit questions:

- PHP unit: `php` + `phpunit` on PATH
- Java unit (mock): JDK; optional `JUNIT_CONSOLE_JAR` (auto-downloaded to `~/.cache/assessment-os` when network allows)
- C++ unit (mock): `g++` + GoogleTest (`brew install googletest` / `libgtest-dev`)
- Python unit: `pip install pytest`

Postgres is exposed on **localhost:5433** (avoids clashing with a local Postgres on 5432).

## Boot the stack

```bash
cp .env.example .env

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
  Demo: `recruiter@assessmentos.dev` / `password123`
- Candidate URL is printed by `pnpm db:seed` (or create invites in the builder)

Useful env keys (see `.env.example`): `DATABASE_URL`, `SESSION_SECRET`, `CORS_ORIGIN`, `WEB_ORIGIN`, `NEXT_PUBLIC_API_URL`, `STORAGE_DIR`, `JUDGE0_URL`, `USE_MOCK_RUNNER`, Turnstile, Resend, `TRUST_PROXY`.

## Optional Judge0

Stock image (I/O; unit tools may be missing):

```bash
docker compose up -d judge0 judge0-workers redis
# set JUDGE0_URL=http://localhost:2358 and USE_MOCK_RUNNER=false in .env
```

**Unit-ready image** (pytest, Jest, PHPUnit, JUnit, GoogleTest):

```bash
docker compose -f docker-compose.yml -f docker-compose.judge0-unit.yml up -d --build
# set JUDGE0_URL=http://localhost:2358 and USE_MOCK_RUNNER=false in .env
./scripts/smoke-judge0-unit.sh
```

See [[Coding-Runner]] for unit multi-file submissions and image details.

## Testing

```bash
pnpm test

docker compose up -d postgres
pnpm db:migrate
pnpm --filter @assessment-os/runner test
pnpm --filter @assessment-os/api test
```

| Script | Description |
|---|---|
| `pnpm build` | Turbo build all packages/apps |
| `pnpm test` | Package tests |
| `pnpm db:migrate` | Apply Drizzle migrations |
| `pnpm db:seed` | Demo recruiter + sample assessment |
