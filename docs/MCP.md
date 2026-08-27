# MCP

Stdio MCP server so Claude Code, Codex, or Cursor can create assessments, manage bank/sections/pools, invite candidates, and query results via the AssessmentOS API.

## Prerequisites

1. API running (`pnpm --filter @assessment-os/api dev`).
2. Recruiter API token:

```bash
curl -X POST http://localhost:4000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"recruiter@assessmentos.dev","password":"password123"}' \
  -c /tmp/aos-cookies.txt

curl -X POST http://localhost:4000/auth/tokens \
  -H 'Content-Type: application/json' \
  -b /tmp/aos-cookies.txt \
  -d '{"name":"mcp-local"}'
# → save token aos_… once
```

## Env

| Variable | Example |
|---|---|
| `ASSESSMENTOS_API_URL` | `http://localhost:4000` |
| `ASSESSMENTOS_API_TOKEN` | `aos_…` |

## Build and run

```bash
pnpm --filter @assessment-os/sdk build
pnpm --filter @assessment-os/mcp build
ASSESSMENTOS_API_URL=http://localhost:4000 \
ASSESSMENTOS_API_TOKEN=aos_… \
pnpm --filter @assessment-os/mcp start
```

## Cursor

```json
{
  "mcpServers": {
    "assessmentos": {
      "command": "/usr/local/bin/node",
      "args": ["/absolute/path/to/AssessmentOS/apps/mcp/dist/index.js"],
      "env": {
        "ASSESSMENTOS_API_URL": "http://localhost:4000",
        "ASSESSMENTOS_API_TOKEN": "aos_…"
      }
    }
  }
}
```

After rebuilding MCP:

1. **Settings → Tools & MCP**
2. Disable/re-enable `assessmentos` until green
3. Start a **new** agent chat

Stale tool catalogs mean an old `dist` or unreloaded server.

## Tools (summary)

**Assessments:** `list_assessments`, `get_assessment`, `create_assessment`, `update_assessment`

**Questions:** `add_mcq_question`, `add_coding_question`, `add_sql_question`, `add_text_question`, `update_question`, `delete_question`, `reorder_questions`

**Bank:** `list_bank_items`, `create_bank_item`, `update_bank_item`, `delete_bank_item`, `add_question_from_bank`

**Sections & pools:** section CRUD, `set_question_section`, pool CRUD, members, `preview_pools`

**Invites & results:** `create_invite`, `list_invites`, `revoke_invite`, `resend_invite`, `list_sessions` (`collapse=best`), `get_session_results`

Prefer unit coding with visible + hidden test code. Prompts are plain strings (API derives `prompt_doc`). Image upload is not exposed via MCP.

Full tables live in the repo at `apps/mcp/README.md`.
