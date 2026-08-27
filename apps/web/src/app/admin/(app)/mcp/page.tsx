"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { ApiScope, ApiTokenMeta, MeResponse } from "@assessment-os/sdk";
import { api, API_URL, getActiveOrgId, setActiveOrgId } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { codeInlineClass, errorClass, mutedClass, preClass } from "@/lib/styles";

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

export default function McpPage() {
  const router = useRouter();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tokens, setTokens] = useState<ApiTokenMeta[]>([]);
  const [tokenName, setTokenName] = useState("mcp-local");
  const [tokenOrgId, setTokenOrgId] = useState("");
  const [tokenScopes, setTokenScopes] = useState<ApiScope[]>(DEFAULT_SCOPES);
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [tokenBusy, setTokenBusy] = useState(false);

  useEffect(() => {
    void (async () => {
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
      setTokens(await api.listApiTokens());
    })().catch((err) =>
      setError(err instanceof Error ? err.message : "Failed to load"),
    );
  }, [router]);

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
    return <p className={mutedClass}>Loading…</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          MCP for agents
        </h1>
        <p className={mutedClass}>
          Connect Claude, Codex, or Cursor with an org-scoped API token.
        </p>
      </div>

      {error ? <p className={errorClass}>{error}</p> : null}

      <Card>
        <CardHeader>
          <CardTitle>Setup</CardTitle>
          <CardDescription>
            Point your agent at the AssessmentOS MCP server.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
            <li>
              Keep the API running (
              <code className={codeInlineClass}>
                pnpm --filter @assessment-os/api dev
              </code>
              ).
            </li>
            <li>
              Build MCP:{" "}
              <code className={codeInlineClass}>
                pnpm --filter @assessment-os/mcp build
              </code>
            </li>
            <li>Create a token below and paste into your MCP config.</li>
            <li>
              Enable the server in Cursor Settings → Tools &amp; MCP, then start
              a new chat.
            </li>
          </ol>
          <pre className={preClass}>{MCP_CONFIG_TEMPLATE}</pre>
          <p className={mutedClass}>
            API base: <code className={codeInlineClass}>{API_URL}</code>
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>API tokens</CardTitle>
          <CardDescription>
            Org-scoped tokens for MCP and the SDK.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={(e) => void createToken(e)} className="grid gap-3">
            <div className="flex flex-wrap gap-2">
              <Input
                className="min-w-[160px] flex-1"
                placeholder="Token name"
                value={tokenName}
                onChange={(e) => setTokenName(e.target.value)}
                disabled={tokenBusy}
              />
              <select
                className="h-8 rounded-none border border-input bg-transparent px-2 text-xs dark:bg-input/30"
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
              <Button
                type="submit"
                isDisabled={
                  tokenBusy || !tokenOrgId || tokenScopes.length === 0
                }
              >
                {tokenBusy ? "Working…" : "Create token"}
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {ALL_SCOPES.map((scope) => (
                <Label
                  key={scope}
                  className="flex items-center gap-2 text-xs font-normal"
                >
                  <input
                    type="checkbox"
                    checked={tokenScopes.includes(scope)}
                    onChange={() => toggleScope(scope)}
                    disabled={tokenBusy}
                  />
                  {scope}
                </Label>
              ))}
            </div>
          </form>

          {createdToken ? (
            <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
              <p className="mb-2 font-medium">Copy this token now</p>
              <code className="break-all text-xs">{createdToken}</code>
            </div>
          ) : null}

          <ul className="space-y-2 text-sm">
            {tokens.map((t) => (
              <li
                key={t.id}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-border py-2 last:border-0"
              >
                <span>
                  <strong>{t.name}</strong>{" "}
                  <span className={mutedClass}>
                    · {t.tokenPrefix}… · {t.scopes?.join(", ")}
                  </span>
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onPress={() => void revokeToken(t.id)}
                  isDisabled={tokenBusy}
                >
                  Revoke
                </Button>
              </li>
            ))}
            {tokens.length === 0 ? (
              <li className={mutedClass}>No tokens yet.</li>
            ) : null}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
