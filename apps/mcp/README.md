# AssessmentOS MCP server

Stdio MCP server so Claude Code, Codex, or Cursor can create assessments, add questions, manage bank/sections/pools, invite candidates, and query results via the AssessmentOS API.

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
  -d '{"name":"mcp-local","organizationId":"ORG_UUID","scopes":["assessments:read","assessments:write","bank:read","bank:write","invites:write","sessions:read"]}'
# → { "id": "...", "token": "aos_...", ... }  save the token once
```

## Env

| Variable | Example |
|---|---|
| `ASSESSMENTOS_API_URL` | `http://localhost:4000` |
| `ASSESSMENTOS_API_TOKEN` | `aos_…` (from `POST /auth/tokens`) |
| `ASSESSMENTOS_ORG_ID` | Org UUID (optional if the token belongs to exactly one org) |

Token create now requires `organizationId` + `scopes`. MCP sends `X-Organization-Id` on every request. If `ASSESSMENTOS_ORG_ID` is unset, the server calls `listOrgs` and uses the sole membership, or fails when there are zero/multiple orgs.

## Run locally

```bash
pnpm --filter @assessment-os/sdk build
pnpm --filter @assessment-os/mcp build
ASSESSMENTOS_API_URL=http://localhost:4000 \
ASSESSMENTOS_API_TOKEN=aos_… \
ASSESSMENTOS_ORG_ID=… \
pnpm --filter @assessment-os/mcp start
```

## Cursor

Add to Cursor MCP settings (or `.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "assessmentos": {
      "command": "/usr/local/bin/node",
      "args": ["/absolute/path/to/AssessmentOS/apps/mcp/dist/index.js"],
      "env": {
        "ASSESSMENTOS_API_URL": "http://localhost:4000",
        "ASSESSMENTOS_API_TOKEN": "aos_…",
        "ASSESSMENTOS_ORG_ID": "…"
      }
    }
  }
}
```

After rebuilding MCP:

1. Open **Cursor Settings → Tools & MCP**.
2. **Disable then re-enable** (or refresh) `assessmentos` until it shows **green** — a config file alone does not attach tools, and an old process keeps stale schemas.
3. Start a **new** agent chat and ask it to list AssessmentOS MCP tools.

If an agent says it has no `assessmentos` MCP or is missing tools like `list_bank_items` / `create_pool`, the server is not attached or is running an old `dist` — rebuild, reload under Tools & MCP, and open a new chat. Keep the API running on `ASSESSMENTOS_API_URL`.

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
        "ASSESSMENTOS_API_TOKEN": "aos_…",
        "ASSESSMENTOS_ORG_ID": "…"
      }
    }
  }
}
```

## Tools

### Assessments

| Tool | Purpose |
|---|---|
| `list_assessments` | List recruiter assessments |
| `get_assessment` | Assessment + questions / sections / pools |
| `create_assessment` | Create draft (`randomize_question_order` supported) |
| `update_assessment` | Patch / publish |

### Questions

| Tool | Purpose |
|---|---|
| `add_mcq_question` | Add MCQ (`section_id` optional) |
| `add_coding_question` | Add coding (`unit`/`io`; PHP/Java/C++; `starter_files`, limits, `scoring`, `checker_code`) |
| `add_sql_question` | Add SQLite SQL question |
| `add_text_question` | Add short-answer / text question |
| `update_question` | Patch title/prompt/points/time/`config` |
| `delete_question` | Remove question |
| `reorder_questions` | Set order by question UUID list |

### Bank

| Tool | Purpose |
|---|---|
| `list_bank_items` | List bank items |
| `create_bank_item` | Create bank item (`type` + `config` shapes match add_* ) |
| `update_bank_item` | Update bank item |
| `delete_bank_item` | Delete bank item |
| `add_question_from_bank` | Clone bank item into assessment |

### Sections & pools

| Tool | Purpose |
|---|---|
| `create_section` / `update_section` / `delete_section` | Section CRUD |
| `set_question_section` | Assign / clear section on a question |
| `create_pool` / `update_pool` / `delete_pool` | Pool CRUD |
| `add_pool_member` / `remove_pool_member` | Pool membership |
| `preview_pools` | Preview one random draw |

### Invites & results

| Tool | Purpose |
|---|---|
| `create_invite` | Invite link (`mode` single\|multi, `max_uses`) |
| `bulk_create_invites` | Bulk single-use invites from email/name rows |
| `list_invites` | List invites |
| `revoke_invite` | Revoke pending invite |
| `resend_invite` | Resend pending invite email |
| `list_sessions` | Session scores (`collapse=best` optional) |
| `get_session_results` | Session detail + activity |
| `list_candidates` | Org candidate directory (search / shortlisted / min score) |
| `get_candidate` | Candidate profile + cross-assessment history |
| `update_candidate` | Shortlist / notes / name |
| `export_session_csv` | Single session CSV |
| `export_assessment_results_csv` | Assessment results CSV |

### Organizations

| Tool | Purpose |
|---|---|
| `list_orgs` | List memberships |
| `create_org` | Create org (caller = owner) |
| `list_org_members` | List members |
| `invite_org_member` | Invite member (owner) |
| `update_org_member` | Change role (owner) |
| `remove_org_member` | Remove member (owner) |
| `list_audit_events` | Audit log (owner) |
| `list_webhooks` | List webhooks (owner) |
| `create_webhook` | Create webhook (owner; secret once) |
| `delete_webhook` | Delete webhook (owner) |

Prefer `add_coding_question` with `mode: "unit"`, `visible_test_code`, and `hidden_test_code` for Python/JS/TS/PHP/Java/C++. See [CONTRIBUTING.md](../../CONTRIBUTING.md#coding-question-harness).

Prompts are plain strings (API derives TipTap `prompt_doc`). Image upload is not exposed via MCP.
