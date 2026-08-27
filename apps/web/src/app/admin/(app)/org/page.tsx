"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { AuditEvent, MeResponse, OrgRole } from "@assessment-os/sdk";
import { getErrorMessage } from "@assessment-os/sdk";
import { api, getActiveOrgId, setActiveOrgId } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DataTable,
  createColumnHelper,
  type DataTableFeatures,
} from "@/components/ui/data-table";
import {
  StatusBadge,
  filterSelectClass,
  type StatusBadgeTone,
} from "@/components/ui/status-badge";
import { codeInlineClass, errorClass, mutedClass, pageClass } from "@/lib/styles";

type Tab = "members" | "webhooks" | "audit";

type MemberRow = {
  membershipId: string;
  role: OrgRole;
  recruiterId: string;
  email: string;
  name: string;
  createdAt: string;
};

type WebhookRow = {
  id: string;
  url: string;
  events: string[];
  enabled: boolean;
  createdAt: string;
};

const memberColumnHelper = createColumnHelper<DataTableFeatures, MemberRow>();
const webhookColumnHelper = createColumnHelper<DataTableFeatures, WebhookRow>();
const auditColumnHelper = createColumnHelper<DataTableFeatures, AuditEvent>();

const roleSelectClass =
  "h-8 rounded-none border border-input bg-transparent px-2.5 text-xs outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30";

function roleTone(role: OrgRole): StatusBadgeTone {
  switch (role) {
    case "owner":
      return "success";
    case "author":
      return "neutral";
    case "reviewer":
      return "muted";
    default:
      return "neutral";
  }
}

export default function OrgAdminPage() {
  const router = useRouter();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [tab, setTab] = useState<Tab>("members");
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [webhooks, setWebhooks] = useState<WebhookRow[]>([]);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<OrgRole>("author");
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);
  const [webhookOpen, setWebhookOpen] = useState(false);
  const [memberQ, setMemberQ] = useState("");
  const [webhookQ, setWebhookQ] = useState("");
  const [auditQ, setAuditQ] = useState("");
  const [auditActionFilter, setAuditActionFilter] = useState("all");

  const orgId =
    getActiveOrgId() ??
    me?.activeOrganization?.id ??
    me?.organizations[0]?.id ??
    null;
  const isOwner = me?.role === "owner";

  async function loadMe() {
    const user = await api.me();
    if (!user) {
      router.replace("/admin/login");
      return null;
    }
    const activeId =
      getActiveOrgId() ??
      user.activeOrganization?.id ??
      user.organizations[0]?.id ??
      null;
    if (activeId) setActiveOrgId(activeId);
    setMe(user);
    return { user, orgId: activeId };
  }

  async function loadTab(activeOrgId: string, activeTab: Tab, owner: boolean) {
    if (activeTab === "members") {
      setMembers(await api.listOrgMembers(activeOrgId));
    } else if (activeTab === "webhooks") {
      if (!owner) {
        setWebhooks([]);
        return;
      }
      setWebhooks(await api.listWebhooks(activeOrgId));
    } else {
      if (!owner) {
        setAudit([]);
        return;
      }
      const res = await api.listAuditEvents(activeOrgId, { limit: 50 });
      setAudit(res.events);
    }
  }

  useEffect(() => {
    void (async () => {
      const ctx = await loadMe();
      if (!ctx?.orgId) return;
      const role =
        ctx.user.organizations.find((o) => o.id === ctx.orgId)?.role ??
        ctx.user.role;
      await loadTab(ctx.orgId, tab, role === "owner");
    })().catch((err) => setError(getErrorMessage(err)));
  }, [router, tab]);

  async function inviteMember(e: FormEvent) {
    e.preventDefault();
    if (!orgId || !inviteEmail.trim() || !isOwner) return;
    setBusy(true);
    setError(null);
    setInviteToken(null);
    try {
      const row = await api.inviteOrgMember(orgId, {
        email: inviteEmail.trim(),
        role: inviteRole,
      });
      setInviteToken(row.token);
      setInviteEmail("");
      setInviteOpen(false);
      await loadTab(orgId, "members", true);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(recruiterId: string, role: OrgRole) {
    if (!orgId || !isOwner) return;
    setBusy(true);
    setError(null);
    try {
      await api.updateOrgMember(orgId, recruiterId, { role });
      await loadTab(orgId, "members", true);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function removeMember(recruiterId: string, label: string) {
    if (!orgId || !isOwner) return;
    if (!confirm(`Remove ${label} from this organization?`)) return;
    setBusy(true);
    setError(null);
    try {
      await api.removeOrgMember(orgId, recruiterId);
      await loadTab(orgId, "members", true);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function createWebhook(e: FormEvent) {
    e.preventDefault();
    if (!orgId || !webhookUrl.trim() || !isOwner) return;
    setBusy(true);
    setError(null);
    setCreatedSecret(null);
    try {
      const row = await api.createWebhook(orgId, { url: webhookUrl.trim() });
      setCreatedSecret(row.secret ?? null);
      setWebhookUrl("");
      setWebhookOpen(false);
      await loadTab(orgId, "webhooks", true);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function toggleWebhook(wh: { id: string; enabled: boolean }) {
    if (!orgId || !isOwner) return;
    setBusy(true);
    try {
      await api.updateWebhook(orgId, wh.id, { enabled: !wh.enabled });
      await loadTab(orgId, "webhooks", true);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function deleteWebhook(id: string) {
    if (!orgId || !isOwner) return;
    if (!confirm("Delete this webhook?")) return;
    setBusy(true);
    try {
      await api.deleteWebhook(orgId, id);
      await loadTab(orgId, "webhooks", true);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const filteredMembers = useMemo(() => {
    const needle = memberQ.trim().toLowerCase();
    if (!needle) return members;
    return members.filter(
      (m) =>
        m.name.toLowerCase().includes(needle) ||
        m.email.toLowerCase().includes(needle) ||
        m.role.toLowerCase().includes(needle),
    );
  }, [members, memberQ]);

  const filteredWebhooks = useMemo(() => {
    const needle = webhookQ.trim().toLowerCase();
    if (!needle) return webhooks;
    return webhooks.filter(
      (w) =>
        w.url.toLowerCase().includes(needle) ||
        (w.events as string[]).some((e) => e.toLowerCase().includes(needle)),
    );
  }, [webhooks, webhookQ]);

  const auditActions = useMemo(() => {
    const actions = new Set(audit.map((e) => e.action));
    return Array.from(actions).sort();
  }, [audit]);

  const filteredAudit = useMemo(() => {
    const needle = auditQ.trim().toLowerCase();
    return audit.filter((e) => {
      if (auditActionFilter !== "all" && e.action !== auditActionFilter) {
        return false;
      }
      if (!needle) return true;
      return (
        e.action.toLowerCase().includes(needle) ||
        e.resourceType.toLowerCase().includes(needle) ||
        (e.resourceId ?? "").toLowerCase().includes(needle)
      );
    });
  }, [audit, auditQ, auditActionFilter]);

  const memberColumns = useMemo(
    () =>
      memberColumnHelper.columns([
        memberColumnHelper.accessor("name", {
          header: "Name",
          cell: ({ row }) => (
            <span className="font-medium">{row.original.name}</span>
          ),
        }),
        memberColumnHelper.accessor("email", {
          header: "Email",
          cell: ({ row }) => (
            <span className={mutedClass}>{row.original.email}</span>
          ),
        }),
        memberColumnHelper.accessor("role", {
          header: "Role",
          cell: ({ row }) =>
            isOwner ? (
              <select
                className={roleSelectClass}
                value={row.original.role}
                disabled={busy}
                onChange={(e) =>
                  void changeRole(
                    row.original.recruiterId,
                    e.target.value as OrgRole,
                  )
                }
              >
                <option value="owner">owner</option>
                <option value="author">author</option>
                <option value="reviewer">reviewer</option>
              </select>
            ) : (
              <StatusBadge tone={roleTone(row.original.role)}>
                {row.original.role}
              </StatusBadge>
            ),
        }),
        ...(isOwner
          ? [
              memberColumnHelper.display({
                id: "actions",
                header: () => <div className="text-right">Actions</div>,
                cell: ({ row }) => (
                  <div className="flex justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      isDisabled={busy}
                      onPress={() =>
                        void removeMember(
                          row.original.recruiterId,
                          row.original.email,
                        )
                      }
                    >
                      Remove
                    </Button>
                  </div>
                ),
              }),
            ]
          : []),
      ]),
    [busy, isOwner],
  );

  const webhookColumns = useMemo(
    () =>
      webhookColumnHelper.columns([
        webhookColumnHelper.accessor("url", {
          header: "URL",
          cell: ({ row }) => (
            <code className={`${codeInlineClass} text-xs`}>
              {row.original.url}
            </code>
          ),
        }),
        webhookColumnHelper.accessor("events", {
          header: "Events",
          cell: ({ row }) => (
            <span className={mutedClass}>
              {(row.original.events as string[]).join(", ")}
            </span>
          ),
        }),
        webhookColumnHelper.accessor("enabled", {
          header: "Status",
          cell: ({ row }) => (
            <StatusBadge tone={row.original.enabled ? "success" : "muted"}>
              {row.original.enabled ? "enabled" : "disabled"}
            </StatusBadge>
          ),
        }),
        webhookColumnHelper.display({
          id: "actions",
          header: () => <div className="text-right">Actions</div>,
          cell: ({ row }) => (
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                isDisabled={busy}
                onPress={() => void toggleWebhook(row.original)}
              >
                {row.original.enabled ? "Disable" : "Enable"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                isDisabled={busy}
                onPress={() => void deleteWebhook(row.original.id)}
              >
                Delete
              </Button>
            </div>
          ),
        }),
      ]),
    [busy],
  );

  const auditColumns = useMemo(
    () =>
      auditColumnHelper.columns([
        auditColumnHelper.accessor("action", {
          header: "Action",
          cell: ({ row }) => (
            <span className="font-medium">{row.original.action}</span>
          ),
        }),
        auditColumnHelper.accessor("resourceType", {
          header: "Resource",
          cell: ({ row }) => (
            <span className={mutedClass}>
              {row.original.resourceType}
              {row.original.resourceId ? ` ${row.original.resourceId}` : ""}
            </span>
          ),
        }),
        auditColumnHelper.accessor("createdAt", {
          header: "When",
          cell: ({ row }) => (
            <span className={mutedClass}>
              {new Date(row.original.createdAt).toLocaleString()}
            </span>
          ),
        }),
      ]),
    [],
  );

  if (!me) {
    return (
      <main className={pageClass}>
        <p className={mutedClass}>Loading…</p>
      </main>
    );
  }

  const tabs: Array<{ id: Tab; label: string; ownerOnly?: boolean }> = [
    { id: "members", label: "Members" },
    { id: "webhooks", label: "Webhooks", ownerOnly: true },
    { id: "audit", label: "Audit", ownerOnly: true },
  ];

  return (
    <main className={pageClass}>
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Organization
        </h1>
        <p className={mutedClass}>
          {me.activeOrganization?.name ?? "No active org"} · role{" "}
          {me.role ?? "—"}
        </p>
      </div>

      <Tabs
        selectedKey={tab}
        onSelectionChange={(key) => {
          if (key != null) setTab(String(key) as Tab);
        }}
      >
        <TabsList>
          {tabs.map((t) => {
            if (t.ownerOnly && !isOwner) return null;
            return (
              <TabsTrigger key={t.id} id={t.id}>
                {t.label}
              </TabsTrigger>
            );
          })}
        </TabsList>

        {error ? <p className={errorClass}>{error}</p> : null}

        <TabsContent id="members">
          <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="font-heading text-xl font-semibold tracking-tight">
                  Members
                </h2>
                <p className={mutedClass}>
                  Invite teammates and manage roles in this organization.
                </p>
              </div>
              {isOwner ? (
                <Button onPress={() => setInviteOpen(true)}>Invite</Button>
              ) : null}
            </div>

            {inviteToken ? (
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                Invite token (share out of band):{" "}
                <code className={`${codeInlineClass} break-all`}>
                  {inviteToken}
                </code>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              <Input
                className="max-w-60"
                placeholder="Search name or email"
                value={memberQ}
                onChange={(e) => setMemberQ(e.target.value)}
              />
            </div>

            <DataTable
              ariaLabel="Organization members"
              columns={memberColumns}
              data={filteredMembers}
              emptyMessage={
                members.length === 0
                  ? "No members yet."
                  : "No members match your search."
              }
            />
          </div>
        </TabsContent>

        {isOwner ? (
          <TabsContent id="webhooks">
            <div className="space-y-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="font-heading text-xl font-semibold tracking-tight">
                    Webhooks
                  </h2>
                  <p className={mutedClass}>
                    Receive notifications when sessions complete. Default event:{" "}
                    <code className={codeInlineClass}>session.completed</code>
                  </p>
                </div>
                <Button onPress={() => setWebhookOpen(true)}>Add webhook</Button>
              </div>

              {createdSecret ? (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                  Webhook secret (copy now):{" "}
                  <code className={`${codeInlineClass} break-all`}>
                    {createdSecret}
                  </code>
                </div>
              ) : null}

              <div className="flex flex-wrap items-center gap-2">
                <Input
                  className="max-w-60"
                  placeholder="Search URL or event"
                  value={webhookQ}
                  onChange={(e) => setWebhookQ(e.target.value)}
                />
              </div>

              <DataTable
                ariaLabel="Webhooks"
                columns={webhookColumns}
                data={filteredWebhooks}
                emptyMessage={
                  webhooks.length === 0
                    ? "No webhooks yet."
                    : "No webhooks match your search."
                }
              />
            </div>
          </TabsContent>
        ) : null}

        {isOwner ? (
          <TabsContent id="audit">
            <div className="space-y-6">
              <div>
                <h2 className="font-heading text-xl font-semibold tracking-tight">
                  Audit log
                </h2>
                <p className={mutedClass}>
                  Recent organization activity (last 50 events).
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Input
                  className="max-w-60"
                  placeholder="Search action or resource"
                  value={auditQ}
                  onChange={(e) => setAuditQ(e.target.value)}
                />
                <Label className="flex items-center gap-2 text-sm font-normal">
                  Action
                  <select
                    className={filterSelectClass}
                    value={auditActionFilter}
                    onChange={(e) => setAuditActionFilter(e.target.value)}
                  >
                    <option value="all">All</option>
                    {auditActions.map((action) => (
                      <option key={action} value={action}>
                        {action}
                      </option>
                    ))}
                  </select>
                </Label>
              </div>

              <DataTable
                ariaLabel="Audit log"
                columns={auditColumns}
                data={filteredAudit}
                emptyMessage={
                  audit.length === 0
                    ? "No audit events yet."
                    : "No events match your filters."
                }
              />
            </div>
          </TabsContent>
        ) : null}
      </Tabs>

      <Dialog
        isOpen={inviteOpen}
        onOpenChange={(open) => {
          setInviteOpen(open);
          if (!open) setInviteEmail("");
        }}
      >
        <DialogHeader>
          <DialogTitle>Invite member</DialogTitle>
          <DialogDescription>
            Send an invite link to add someone to this organization.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => void inviteMember(e)} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="invite-email">Email</Label>
            <Input
              id="invite-email"
              type="email"
              placeholder="Invite email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              disabled={busy}
              autoFocus
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="invite-role">Role</Label>
            <select
              id="invite-role"
              className={roleSelectClass}
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as OrgRole)}
              disabled={busy}
            >
              <option value="owner">owner</option>
              <option value="author">author</option>
              <option value="reviewer">reviewer</option>
            </select>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onPress={() => setInviteOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" isDisabled={busy || !inviteEmail.trim()}>
              Invite
            </Button>
          </DialogFooter>
        </form>
      </Dialog>

      <Dialog
        isOpen={webhookOpen}
        onOpenChange={(open) => {
          setWebhookOpen(open);
          if (!open) setWebhookUrl("");
        }}
      >
        <DialogHeader>
          <DialogTitle>Add webhook</DialogTitle>
          <DialogDescription>
            We will POST to this URL when a session completes.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => void createWebhook(e)} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="webhook-url">URL</Label>
            <Input
              id="webhook-url"
              placeholder="https://example.com/hooks/aos"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              disabled={busy}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onPress={() => setWebhookOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" isDisabled={busy || !webhookUrl.trim()}>
              Add webhook
            </Button>
          </DialogFooter>
        </form>
      </Dialog>
    </main>
  );
}
