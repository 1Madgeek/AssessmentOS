# MCP

Stdio MCP server so Claude Code, Codex, or Cursor can create assessments, manage bank/sections/pools, invite candidates, and query results via any AssessmentOS API.

## Production setup (no clone)

1. Sign in to your AssessmentOS admin UI → **MCP**.
2. Create an API token (copy it once).
3. Add this to Cursor MCP settings (replace token / org / API URL):

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

4. **Settings → Tools & MCP** → enable `assessmentos` → new chat.

Requires Node 22+ on the machine running Cursor. Package: [`assessmentos-mcp`](https://www.npmjs.com/package/assessmentos-mcp) on npm.

## Env

| Variable | Example |
|---|---|
| `ASSESSMENTOS_API_URL` | `https://api.example.com` |
| `ASSESSMENTOS_API_TOKEN` | `aos_…` |
| `ASSESSMENTOS_ORG_ID` | Org UUID (optional if the token has exactly one org) |

## Develop from the monorepo

```bash
pnpm --filter @assessment-os/sdk build
pnpm --filter @assessment-os/mcp build
ASSESSMENTOS_API_URL=http://localhost:4000 \
ASSESSMENTOS_API_TOKEN=aos_… \
pnpm --filter @assessment-os/mcp start
```

Publish: bump `apps/mcp/package.json` version, then `make mcp-publish` (or tag `mcp-vX.Y.Z` for CI).

## Tools (summary)

**Assessments:** `list_assessments`, `get_assessment`, `create_assessment`, `update_assessment`

**Questions:** `add_mcq_question`, `add_coding_question`, `add_sql_question`, `add_text_question`, `update_question`, `delete_question`, `reorder_questions`

**Bank:** `list_bank_items`, `create_bank_item`, `update_bank_item`, `delete_bank_item`, `add_question_from_bank`

**Sections & pools:** section CRUD, `set_question_section`, pool CRUD, members, `preview_pools`

**Invites & results:** `create_invite`, `list_invites`, `revoke_invite`, `resend_invite`, `list_sessions` (`collapse=best`), `get_session_results`

Full tables: [`apps/mcp/README.md`](../apps/mcp/README.md).
