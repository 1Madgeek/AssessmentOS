"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
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
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DataTable,
  createColumnHelper,
  type DataTableFeatures,
} from "@/components/ui/data-table";
import {
  StatusBadge,
} from "@/components/ui/status-badge";
import {
  codeInlineClass,
  errorClass,
  mutedClass,
  pageClass,
  preClass,
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
      "command": "npx",
      "args": ["-y", "assessmentos-mcp"],
      "env": {
        "ASSESSMENTOS_API_URL": "${API_URL}",
        "ASSESSMENTOS_API_TOKEN": "YOUR_TOKEN",
        "ASSESSMENTOS_ORG_ID": "YOUR_ORG_ID"
      }
    }
  }
}`;

const columnHelper = createColumnHelper<DataTableFeatures, ApiTokenMeta>();

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
  const [createOpen, setCreateOpen] = useState(false);
  const [q, setQ] = useState("");

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

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return tokens;
    return tokens.filter(
      (t) =>
        t.name.toLowerCase().includes(needle) ||
        t.tokenPrefix.toLowerCase().includes(needle) ||
        (t.scopes ?? []).some((s) => s.toLowerCase().includes(needle)),
    );
  }, [tokens, q]);

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
      setCreateOpen(false);
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

  const tokenColumns = useMemo(
    () =>
      columnHelper.columns([
        columnHelper.accessor("name", {
          header: "Name",
          cell: ({ row }) => (
            <span className="font-medium">{row.original.name}</span>
          ),
        }),
        columnHelper.accessor("tokenPrefix", {
          header: "Prefix",
          cell: ({ row }) => (
            <code className={codeInlineClass}>{row.original.tokenPrefix}…</code>
          ),
        }),
        columnHelper.accessor("scopes", {
          header: "Scopes",
          cell: ({ row }) => {
            const scopes = row.original.scopes ?? [];
            if (scopes.length === 0) {
              return <span className={mutedClass}>—</span>;
            }
            return (
              <div className="flex max-w-md flex-wrap gap-1 whitespace-normal">
                {scopes.map((scope) => (
                  <StatusBadge key={scope} tone="muted">
                    {scope}
                  </StatusBadge>
                ))}
              </div>
            );
          },
        }),
        columnHelper.accessor("createdAt", {
          header: "Created",
          cell: ({ row }) => (
            <span className={mutedClass}>
              {new Date(row.original.createdAt).toLocaleString()}
            </span>
          ),
        }),
        columnHelper.accessor("lastUsedAt", {
          header: "Last used",
          cell: ({ row }) =>
            row.original.lastUsedAt ? (
              <span className={mutedClass}>
                {new Date(row.original.lastUsedAt).toLocaleString()}
              </span>
            ) : (
              <span className={mutedClass}>Never</span>
            ),
        }),
        columnHelper.display({
          id: "actions",
          header: () => <div className="text-right">Actions</div>,
          cell: ({ row }) => (
            <div className="flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onPress={() => void revokeToken(row.original.id)}
                isDisabled={tokenBusy}
              >
                Revoke
              </Button>
            </div>
          ),
        }),
      ]),
    [tokenBusy],
  );

  if (!me) {
    return (
      <main className={pageClass}>
        <p className={mutedClass}>Loading…</p>
      </main>
    );
  }

  return (
    <main className={pageClass}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            MCP for agents
          </h1>
          <p className={mutedClass}>
            Connect Claude, Codex, or Cursor with an org-scoped API token.
          </p>
        </div>
        <Button onPress={() => setCreateOpen(true)}>Create token</Button>
      </div>

      {error ? (
        <p role="alert" className={errorClass}>
          {error}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-base font-medium">
            Setup
          </CardTitle>
          <CardDescription>
            Point your agent at the AssessmentOS MCP server.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
            <li>
              Create a token below (copy it once — it is shown only at creation).
            </li>
            <li>
              Paste the config into Cursor MCP settings. Production users need
              Node 22+ and{" "}
              <code className={codeInlineClass}>npx -y assessmentos-mcp</code>
              (no repo clone).
            </li>
            <li>
              Enable the server in Cursor Settings → Tools &amp; MCP, then start
              a new chat.
            </li>
          </ol>
          <pre className={preClass}>{MCP_CONFIG_TEMPLATE}</pre>
          <p className={mutedClass}>
            API base: <code className={codeInlineClass}>{API_URL}</code>
            . Set <code className={codeInlineClass}>ASSESSMENTOS_ORG_ID</code>{" "}
            to your org UUID from Org settings (optional if the token has only
            one org).
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="font-heading text-base font-medium">
              API tokens
            </CardTitle>
            <CardDescription>
              Org-scoped tokens for MCP and the SDK.
            </CardDescription>
          </div>
          <Button size="sm" onPress={() => setCreateOpen(true)}>
            Create
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {createdToken ? (
            <div
              role="status"
              className="rounded-none border border-border bg-muted/30 p-3 text-sm"
            >
              <p className="mb-2 font-medium">Copy this token now</p>
              <code className="break-all text-xs">{createdToken}</code>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <Input
              className="max-w-60"
              placeholder="Search name, prefix, or scope"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>

          <DataTable
            ariaLabel="API tokens"
            columns={tokenColumns}
            data={filtered}
            emptyMessage={
              tokens.length === 0
                ? "No tokens yet."
                : "No tokens match your search."
            }
          />
        </CardContent>
      </Card>

      <Dialog
        isOpen={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) {
            setTokenName("mcp-local");
            setTokenScopes(DEFAULT_SCOPES);
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>Create API token</DialogTitle>
          <DialogDescription>
            Tokens are scoped to an organization and a set of API permissions.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => void createToken(e)} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="token-name">Name</Label>
            <Input
              id="token-name"
              placeholder="Token name"
              value={tokenName}
              onChange={(e) => setTokenName(e.target.value)}
              disabled={tokenBusy}
              autoFocus
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="token-org">Organization</Label>
            <select
              id="token-org"
              className="h-8 rounded-none border border-input bg-transparent px-2 text-xs dark:bg-input/30"
              value={tokenOrgId}
              onChange={(e) => setTokenOrgId(e.target.value)}
              disabled={tokenBusy}
              required
            >
              <option value="" disabled>
                Select organization
              </option>
              {me.organizations.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-2">
            <Label>Scopes</Label>
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
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onPress={() => setCreateOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              isDisabled={
                tokenBusy || !tokenOrgId || tokenScopes.length === 0
              }
            >
              {tokenBusy ? "Working…" : "Create token"}
            </Button>
          </DialogFooter>
        </form>
      </Dialog>
    </main>
  );
}
