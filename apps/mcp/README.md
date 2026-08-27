# AssessmentOS MCP server

Stdio MCP server so Claude Code, Codex, or Cursor can create assessments, add questions, invite candidates, and query results via the AssessmentOS API.

## Prerequisites

1. API running (`pnpm --filter @assessment-os/api dev`).
2. Recruiter API token from a logged-in session:

```bash
# after logging in via the web UI (cookie session), or:
curl -X POST http://localhost:4000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"recruiter@assessmentos.dev","password":"password123"}' \
  -c /tmp/aos-cookies.txt

curl -X POST http://localhost:4000/auth/tokens \
  -H 'Content-Type: application/json' \
  -b /tmp/aos-cookies.txt \
  -d '{"name":"mcp-local"}'
# → { "id": "...", "token": "aos_...", ... }  save the token once
```

## Env

| Variable | Example |
|---|---|
| `ASSESSMENTOS_API_URL` | `http://localhost:4000` |
| `ASSESSMENTOS_API_TOKEN` | `aos_…` (from `POST /auth/tokens`) |

## Run locally

```bash
pnpm --filter @assessment-os/mcp build
ASSESSMENTOS_API_URL=http://localhost:4000 \
ASSESSMENTOS_API_TOKEN=aos_… \
pnpm --filter @assessment-os/mcp start
```

## Cursor

Add to Cursor MCP settings (or `.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "assessmentos": {
      "command": "node",
      "args": ["/absolute/path/to/AssessmentOS/apps/mcp/dist/index.js"],
      "env": {
        "ASSESSMENTOS_API_URL": "http://localhost:4000",
        "ASSESSMENTOS_API_TOKEN": "aos_…"
      }
    }
  }
}
```

After `pnpm --filter @assessment-os/mcp build`, restart Cursor MCP.

## Claude Desktop

In `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "assessmentos": {
      "command": "node",
      "args": ["/absolute/path/to/AssessmentOS/apps/mcp/dist/index.js"],
      "env": {
        "ASSESSMENTOS_API_URL": "http://localhost:4000",
        "ASSESSMENTOS_API_TOKEN": "aos_…"
      }
    }
  }
}
```

## Tools

| Tool | Purpose |
|---|---|
| `list_assessments` | List recruiter assessments |
| `get_assessment` | Assessment + questions |
| `create_assessment` | Create draft |
| `update_assessment` | Patch / publish |
| `add_mcq_question` | Add MCQ |
| `add_coding_question` | Add coding (`unit` or `io`) |
| `create_invite` | Invite link |
| `list_sessions` | Session scores |
| `get_session_results` | Session detail + events |

Prefer `add_coding_question` with `mode: "unit"`, `visible_test_code`, and `hidden_test_code` for Python/JS/TS. See [CONTRIBUTING.md](../../CONTRIBUTING.md#coding-question-harness).
