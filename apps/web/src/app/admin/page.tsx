"use client";

import { useEffect, useState, type CSSProperties, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type {
  ApiScope,
  ApiTokenMeta,
  Assessment,
  MeResponse,
} from "@assessment-os/sdk";
import { api, API_URL, getActiveOrgId, setActiveOrgId } from "@/lib/api";
import { OrgSwitcher } from "@/components/OrgSwitcher";
import {
  btnPrimary,
  btnSecondary,
  cardStyle,
  inputStyle,
  pageStyle,
} from "@/lib/styles";

const ALL_SCOPES: ApiScope[] = [
  "assessments:read",
  "assessments:write",
  "bank:read",
  "bank:write",
  "invites:write",
  "sessions:read",
  "org:read",
  "org:admin",
  "webhooks:manage",
];

const DEFAULT_SCOPES: ApiScope[] = [
  "assessments:read",
  "assessments:write",
  "bank:read",
  "bank:write",
  "invites:write",
  "sessions:read",
];

const MCP_CONFIG_TEMPLATE = `{
  "mcpServers": {
    "assessmentos": {
      "command": "/usr/local/bin/node",
      "args": ["/absolute/path/to/AssessmentOS/apps/mcp/dist/index.js"],
      "env": {
        "ASSESSMENTOS_API_URL": "${API_URL}",
        "ASSESSMENTOS_API_TOKEN": "YOUR_TOKEN",
        "ASSESSMENTOS_ORG_ID": "YOUR_ORG_ID"
      }
    }
  }
}`;

export default function AdminHomePage() {
  const router = useRouter();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [tokens, setTokens] = useState<ApiTokenMeta[]>([]);
  const [tokenName, setTokenName] = useState("mcp-local");
  const [tokenOrgId, setTokenOrgId] = useState("");
  const [tokenScopes, setTokenScopes] = useState<ApiScope[]>(DEFAULT_SCOPES);
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [tokenBusy, setTokenBusy] = useState(false);

  const canWrite = me?.role !== "reviewer";

  async function load() {
    const user = await api.me();
    if (!user) {
      router.replace("/admin/login");
      return;
    }
    const activeId =
      getActiveOrgId() ??
      user.activeOrganization?.id ??
      user.organizations[0]?.id ??
      null;
    if (activeId) setActiveOrgId(activeId);
    setMe(user);
    setTokenOrgId(activeId ?? user.organizations[0]?.id ?? "");
    const [list, tokenList] = await Promise.all([
      api.listAssessments(),
      api.listApiTokens(),
    ]);
    setAssessments(list);
    setTokens(tokenList);
  }

  useEffect(() => {
    void load().catch((err) =>
      setError(err instanceof Error ? err.message : "Failed to load"),
    );
  }, [router]);

  async function createAssessment(e: FormEvent) {
    e.preventDefault();
    if (!title.trim() || !canWrite) return;
    const created = await api.createAssessment({
      title: title.trim(),
      durationSeconds: 60 * 60,
      rules: {
        allowSkip: true,
        allowReturn: true,
        perQuestionTimers: true,
        linearLock: false,
        randomizeQuestionOrder: false,
      },
    });
    router.push(`/admin/assessments/${created.id}`);
  }

  async function logout() {
    await api.logout();
    router.push("/admin/login");
  }

  async function createToken(e: FormEvent) {
    e.preventDefault();
    if (!tokenName.trim() || !tokenOrgId || tokenScopes.length === 0) return;
    setTokenBusy(true);
    setError(null);
    setCreatedToken(null);
    try {
      const row = await api.createApiToken({
        name: tokenName.trim(),
        organizationId: tokenOrgId,
        scopes: tokenScopes,
      });
      setCreatedToken(row.token);
      setTokens(await api.listApiTokens());
      setTokenName("mcp-local");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create token");
    } finally {
      setTokenBusy(false);
    }
  }

  async function revokeToken(id: string) {
    setTokenBusy(true);
    setError(null);
    try {
      await api.deleteApiToken(id);
      setTokens(await api.listApiTokens());
      if (createdToken) setCreatedToken(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke token");
    } finally {
      setTokenBusy(false);
    }
  }

  function toggleScope(scope: ApiScope) {
    setTokenScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope],
    );
  }

  if (!me) {
    return <main style={pageStyle}>Loading…</main>;
  }

  return (
    <main style={pageStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0 }}>Assessments</h1>
          <p style={{ color: "#656d76", margin: "4px 0 0" }}>
            {me.name} ({me.email})
          </p>
          <div style={{ marginTop: 8 }}>
            <OrgSwitcher me={me} />
          </div>
        </div>
        <button type="button" style={btnSecondary} onClick={() => void logout()}>
          Log out
        </button>
      </div>

      <p style={{ marginTop: 8, display: "flex", gap: 16, flexWrap: "wrap" }}>
        <Link href="/admin/org" style={{ fontSize: 14 }}>
          Organization
        </Link>
        <Link href="/admin/candidates" style={{ fontSize: 14 }}>
          Candidates
        </Link>
        <Link href="/admin/email-templates" style={{ fontSize: 14 }}>
          Email templates
        </Link>
        <Link href="/admin/bank" style={{ fontSize: 14 }}>
          Question bank
        </Link>
      </p>

      {error ? <p style={{ color: "#cf222e" }}>{error}</p> : null}

      {canWrite ? (
        <form
          onSubmit={(e) => void createAssessment(e)}
          style={{ display: "flex", gap: 8, marginTop: 24 }}
        >
          <input
            style={{ ...inputStyle, flex: 1 }}
            placeholder="New assessment title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <button type="submit" style={btnPrimary}>
            Create
          </button>
        </form>
      ) : (
        <p style={{ marginTop: 24, color: "#656d76", fontSize: 14 }}>
          Reviewer role — create and edit actions are hidden.
        </p>
      )}

      <div style={{ display: "grid", gap: 12, marginTop: 24 }}>
        {assessments.map((a) => (
          <div key={a.id} style={cardStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <div>
                <Link href={`/admin/assessments/${a.id}`} style={{ fontWeight: 600 }}>
                  {a.title}
                </Link>
                <div style={{ fontSize: 13, color: "#656d76", marginTop: 4 }}>
                  {a.published ? "Published" : "Draft"} ·{" "}
                  {Math.round(a.durationSeconds / 60)} min
                </div>
              </div>
              <Link href={`/admin/assessments/${a.id}/sessions`} style={btnSecondary}>
                Results
              </Link>
            </div>
          </div>
        ))}
        {assessments.length === 0 ? (
          <p style={{ color: "#656d76" }}>No assessments yet. Create one above.</p>
        ) : null}
      </div>

      <section style={{ ...cardStyle, marginTop: 40, display: "grid", gap: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20 }}>MCP for agents</h2>
          <p style={{ color: "#656d76", margin: "8px 0 0", lineHeight: 1.5 }}>
            Connect Claude, Codex, or Cursor to AssessmentOS. Your agent can
            create assessments, add MCQ/coding questions, invite candidates, and
            fetch session scores via MCP tools — using an API token below.
          </p>
        </div>

        <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 1.6, color: "#24292f" }}>
          <li>
            Keep the API running (
            <code style={codeInline}>pnpm --filter @assessment-os/api dev</code>
            ).
          </li>
          <li>
            Build the MCP server once:{" "}
            <code style={codeInline}>pnpm --filter @assessment-os/mcp build</code>
          </li>
          <li>Create an API token below (shown only once) and paste it into the config.</li>
          <li>
            Save the JSON as project{" "}
            <code style={codeInline}>.cursor/mcp.json</code> (Cursor) or Claude
            Desktop{" "}
            <code style={codeInline}>claude_desktop_config.json</code>. Use an
            absolute path to <code style={codeInline}>node</code> if the editor
            can’t find it on PATH.
          </li>
          <li>
            <strong>Enable the server in the editor</strong> — writing the file
            alone is not enough. In Cursor: Settings → Tools &amp; MCP → find{" "}
            <code style={codeInline}>assessmentos</code> → enable / refresh until
            it is green. Then start a <strong>new</strong> agent chat (existing
            chats won’t pick up tools automatically).
          </li>
          <li>
            Confirm with the agent: “list MCP tools for assessmentos” — you
            should see <code style={codeInline}>list_assessments</code>,{" "}
            <code style={codeInline}>list_sessions</code>, etc.
          </li>
        </ol>

        <div
          style={{
            padding: 12,
            borderRadius: 6,
            background: "#ddf4ff",
            border: "1px solid #54aeff",
            fontSize: 13,
            lineHeight: 1.5,
          }}
        >
          <strong>If the agent says it has no AssessmentOS MCP:</strong> the
          config file exists but Cursor has not attached the server to that chat.
          Toggle/reload <code style={codeInline}>assessmentos</code> under Tools
          &amp; MCP, ensure the API is up, then open a new chat.
        </div>

        <pre style={preStyle}>{MCP_CONFIG_TEMPLATE}</pre>

        <p style={{ margin: 0, fontSize: 13, color: "#656d76", lineHeight: 1.5 }}>
          API base used here: <code style={codeInline}>{API_URL}</code>. Full
          tool list and details:{" "}
          <code style={codeInline}>apps/mcp/README.md</code> in the repo.
        </p>

        <div style={{ borderTop: "1px solid #d0d7de", paddingTop: 16 }}>
          <h3 style={{ margin: "0 0 12px", fontSize: 16 }}>API tokens</h3>
          <form
            onSubmit={(e) => void createToken(e)}
            style={{ display: "grid", gap: 12 }}
          >
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input
                style={{ ...inputStyle, flex: 1, minWidth: 180 }}
                placeholder="Token name"
                value={tokenName}
                onChange={(e) => setTokenName(e.target.value)}
                disabled={tokenBusy}
              />
              <select
                style={{ ...inputStyle, width: "auto", minWidth: 180 }}
                value={tokenOrgId}
                onChange={(e) => setTokenOrgId(e.target.value)}
                disabled={tokenBusy}
                required
              >
                <option value="" disabled>
                  Organization
                </option>
                {me.organizations.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                style={btnPrimary}
                disabled={
                  tokenBusy || !tokenOrgId || tokenScopes.length === 0
                }
              >
                {tokenBusy ? "Working…" : "Create token"}
              </button>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
                gap: 6,
                fontSize: 13,
              }}
            >
              {ALL_SCOPES.map((scope) => (
                <label
                  key={scope}
                  style={{ display: "flex", gap: 6, alignItems: "center" }}
                >
                  <input
                    type="checkbox"
                    checked={tokenScopes.includes(scope)}
                    onChange={() => toggleScope(scope)}
                    disabled={tokenBusy}
                  />
                  {scope}
                </label>
              ))}
            </div>
          </form>

          {createdToken ? (
            <div
              style={{
                marginTop: 12,
                padding: 12,
                borderRadius: 6,
                background: "#fff8c5",
                border: "1px solid #d4a72c",
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: 6 }}>
                Copy this token now — it won’t be shown again
              </div>
              <code
                style={{
                  display: "block",
                  wordBreak: "break-all",
                  fontSize: 13,
                }}
              >
                {createdToken}
              </code>
              <button
                type="button"
                style={{ ...btnSecondary, marginTop: 8 }}
                onClick={() => void navigator.clipboard.writeText(createdToken)}
              >
                Copy to clipboard
              </button>
            </div>
          ) : null}

          <div style={{ display: "grid", gap: 8, marginTop: 16 }}>
            {tokens.map((t) => (
              <div
                key={t.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                  fontSize: 14,
                }}
              >
                <div>
                  <strong>{t.name}</strong>{" "}
                  <span style={{ color: "#656d76" }}>
                    {t.tokenPrefix}… · created{" "}
                    {new Date(t.createdAt).toLocaleString()}
                    {t.scopes?.length
                      ? ` · ${t.scopes.join(", ")}`
                      : ""}
                    {t.lastUsedAt
                      ? ` · last used ${new Date(t.lastUsedAt).toLocaleString()}`
                      : ""}
                  </span>
                </div>
                <button
                  type="button"
                  style={btnSecondary}
                  disabled={tokenBusy}
                  onClick={() => void revokeToken(t.id)}
                >
                  Revoke
                </button>
              </div>
            ))}
            {tokens.length === 0 ? (
              <p style={{ color: "#656d76", margin: 0, fontSize: 14 }}>
                No tokens yet. Create one to wire up MCP.
              </p>
            ) : null}
          </div>
        </div>
      </section>
    </main>
  );
}

const codeInline: CSSProperties = {
  fontSize: 13,
  background: "#f6f8fa",
  padding: "1px 6px",
  borderRadius: 4,
};

const preStyle: CSSProperties = {
  margin: 0,
  padding: 12,
  borderRadius: 8,
  background: "#0d1117",
  color: "#e6edf3",
  fontSize: 12,
  overflow: "auto",
  lineHeight: 1.45,
};
