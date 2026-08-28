# AssessmentOS MCP server

Stdio MCP server so Claude Code, Codex, or Cursor can create assessments, add questions, manage bank/sections/pools, invite candidates, and query results via any AssessmentOS API (local or production).

## Production (recommended)

No repo clone required. Create an API token in the admin UI (**MCP** page), then add to Cursor MCP settings:

```json
{
  "mcpServers": {
    "assessmentos": {
      "command": "npx",
      "args": ["-y", "assessmentos-mcp"],
      "env": {
        "ASSESSMENTOS_API_URL": "https://api.example.com",
        "ASSESSMENTOS_API_TOKEN": "aos_…",
        "ASSESSMENTOS_ORG_ID": "…"
      }
    }
  }
}
```

1. Open **Cursor Settings → Tools & MCP**.
2. Enable `assessmentos` until it shows **green**.
3. Start a **new** agent chat.

Pin a version with `"args": ["-y", "assessmentos-mcp@0.1.0"]` if you need a fixed release. After package updates, `npx -y` picks up newer versions (clear the npx cache if a stale binary sticks).

## Env

| Variable | Example |
|---|---|
| `ASSESSMENTOS_API_URL` | `https://api.example.com` or `http://localhost:4000` |
| `ASSESSMENTOS_API_TOKEN` | `aos_…` (from **MCP** page / `POST /auth/tokens`) |
| `ASSESSMENTOS_ORG_ID` | Org UUID (optional if the token belongs to exactly one org) |

Token create requires `organizationId` + `scopes`. MCP sends `X-Organization-Id` on every request. If `ASSESSMENTOS_ORG_ID` is unset, the server calls `listOrgs` and uses the sole membership, or fails when there are zero/multiple orgs.

## Create a token (API)

```bash
curl -X POST https://api.example.com/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@company.com","password":"…"}' \
  -c /tmp/aos-cookies.txt

curl -X POST https://api.example.com/auth/tokens \
  -H 'Content-Type: application/json' \
  -b /tmp/aos-cookies.txt \
  -d '{"name":"mcp","organizationId":"ORG_UUID","scopes":["assessments:read","assessments:write","bank:read","bank:write","invites:write","sessions:read"]}'
```

## Develop from this monorepo

```bash
pnpm --filter @assessment-os/sdk build
pnpm --filter assessmentos-mcp build
ASSESSMENTOS_API_URL=http://localhost:4000 \
ASSESSMENTOS_API_TOKEN=aos_… \
ASSESSMENTOS_ORG_ID=… \
pnpm --filter assessmentos-mcp start
```

Local Cursor config (contributors):

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

## Publish (`assessmentos-mcp` on npm)

```bash
# bump "version" in apps/mcp/package.json, then:
make mcp-publish
# or tag for CI: git tag mcp-v0.1.1 && git push origin mcp-v0.1.1
```

CI: `.github/workflows/publish-mcp.yml` publishes on tags `mcp-v*` when `NPM_TOKEN` is set in repo secrets.

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
| `create_bank_item` | Create bank template |
| `update_bank_item` | Patch bank item |
| `delete_bank_item` | Delete bank item |
| `add_question_from_bank` | Clone bank item into an assessment |

### Sections & pools

Section CRUD, `set_question_section`, pool CRUD / members, `preview_pools`.

### Invites & results

`create_invite`, `list_invites`, `revoke_invite`, `resend_invite`, `list_sessions` (`collapse=best`), `get_session_results`.

Prefer unit coding with visible + hidden test code. Prompts are plain strings (API derives `prompt_doc`). Image upload is not exposed via MCP.
