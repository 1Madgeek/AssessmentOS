"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type {
  AuditEvent,
  MeResponse,
  OrgRole,
} from "@assessment-os/sdk";
import { getErrorMessage } from "@assessment-os/sdk";
import { api, getActiveOrgId, setActiveOrgId } from "@/lib/api";
import { OrgSwitcher } from "@/components/OrgSwitcher";
import {
  btnPrimary,
  btnSecondary,
  cardStyle,
  inputStyle,
  pageStyle,
} from "@/lib/styles";

type Tab = "members" | "webhooks" | "audit";

type MemberRow = {
  membershipId: string;
  role: OrgRole;
  recruiterId: string;
  email: string;
  name: string;
  createdAt: string;
};

export default function OrgAdminPage() {
  const router = useRouter();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [tab, setTab] = useState<Tab>("members");
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [webhooks, setWebhooks] = useState<
    Array<{
      id: string;
      url: string;
      events: string[];
      enabled: boolean;
      createdAt: string;
    }>
  >([]);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<OrgRole>("author");
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);

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
      await loadTab(orgId, "webhooks", true);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function toggleWebhook(wh: {
    id: string;
    enabled: boolean;
  }) {
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

  if (!me) {
    return <main style={pageStyle}>Loading…</main>;
  }

  const tabs: Array<{ id: Tab; label: string; ownerOnly?: boolean }> = [
    { id: "members", label: "Members" },
    { id: "webhooks", label: "Webhooks", ownerOnly: true },
    { id: "audit", label: "Audit", ownerOnly: true },
  ];

  return (
    <main style={pageStyle}>
      <Link href="/admin">← Admin</Link>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          alignItems: "flex-start",
          marginTop: 8,
        }}
      >
        <div>
          <h1 style={{ margin: 0 }}>Organization</h1>
          <p style={{ color: "#656d76", margin: "4px 0 0" }}>
            {me.activeOrganization?.name ?? "No active org"} · role{" "}
            {me.role ?? "—"}
          </p>
          <div style={{ marginTop: 8 }}>
            <OrgSwitcher me={me} />
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 20, flexWrap: "wrap" }}>
        {tabs.map((t) => {
          if (t.ownerOnly && !isOwner) return null;
          return (
            <button
              key={t.id}
              type="button"
              style={tab === t.id ? btnPrimary : btnSecondary}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {error ? <p style={{ color: "#cf222e" }}>{error}</p> : null}

      {tab === "members" ? (
        <section style={{ ...cardStyle, marginTop: 16, display: "grid", gap: 12 }}>
          {isOwner ? (
            <form
              onSubmit={(e) => void inviteMember(e)}
              style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
            >
              <input
                style={{ ...inputStyle, flex: 1, minWidth: 200 }}
                type="email"
                placeholder="Invite email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                disabled={busy}
              />
              <select
                style={{ ...inputStyle, width: "auto" }}
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as OrgRole)}
                disabled={busy}
              >
                <option value="owner">owner</option>
                <option value="author">author</option>
                <option value="reviewer">reviewer</option>
              </select>
              <button type="submit" style={btnPrimary} disabled={busy}>
                Invite
              </button>
            </form>
          ) : null}
          {inviteToken ? (
            <div
              style={{
                padding: 12,
                background: "#fff8c5",
                border: "1px solid #d4a72c",
                borderRadius: 6,
                fontSize: 13,
              }}
            >
              Invite token (share out of band):{" "}
              <code style={{ wordBreak: "break-all" }}>{inviteToken}</code>
            </div>
          ) : null}
          <div style={{ display: "grid", gap: 8 }}>
            {members.map((m) => (
              <div
                key={m.membershipId}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <strong>{m.name}</strong>{" "}
                  <span style={{ color: "#656d76" }}>({m.email})</span>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {isOwner ? (
                    <>
                      <select
                        style={{ ...inputStyle, width: "auto" }}
                        value={m.role}
                        disabled={busy}
                        onChange={(e) =>
                          void changeRole(
                            m.recruiterId,
                            e.target.value as OrgRole,
                          )
                        }
                      >
                        <option value="owner">owner</option>
                        <option value="author">author</option>
                        <option value="reviewer">reviewer</option>
                      </select>
                      <button
                        type="button"
                        style={btnSecondary}
                        disabled={busy}
                        onClick={() =>
                          void removeMember(m.recruiterId, m.email)
                        }
                      >
                        Remove
                      </button>
                    </>
                  ) : (
                    <span style={{ fontSize: 13, color: "#656d76" }}>
                      {m.role}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {tab === "webhooks" && isOwner ? (
        <section style={{ ...cardStyle, marginTop: 16, display: "grid", gap: 12 }}>
          <form
            onSubmit={(e) => void createWebhook(e)}
            style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
          >
            <input
              style={{ ...inputStyle, flex: 1, minWidth: 240 }}
              placeholder="https://example.com/hooks/aos"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              disabled={busy}
            />
            <button type="submit" style={btnPrimary} disabled={busy}>
              Add webhook
            </button>
          </form>
          {createdSecret ? (
            <div
              style={{
                padding: 12,
                background: "#fff8c5",
                border: "1px solid #d4a72c",
                borderRadius: 6,
                fontSize: 13,
              }}
            >
              Webhook secret (copy now):{" "}
              <code style={{ wordBreak: "break-all" }}>{createdSecret}</code>
            </div>
          ) : null}
          <p style={{ margin: 0, fontSize: 13, color: "#656d76" }}>
            Default event: <code>session.completed</code>
          </p>
          <div style={{ display: "grid", gap: 8 }}>
            {webhooks.map((wh) => (
              <div
                key={wh.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  flexWrap: "wrap",
                  alignItems: "center",
                }}
              >
                <div>
                  <code style={{ fontSize: 13 }}>{wh.url}</code>
                  <div style={{ fontSize: 12, color: "#656d76" }}>
                    {(wh.events as string[]).join(", ")} ·{" "}
                    {wh.enabled ? "enabled" : "disabled"}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    style={btnSecondary}
                    disabled={busy}
                    onClick={() => void toggleWebhook(wh)}
                  >
                    {wh.enabled ? "Disable" : "Enable"}
                  </button>
                  <button
                    type="button"
                    style={btnSecondary}
                    disabled={busy}
                    onClick={() => void deleteWebhook(wh.id)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
            {webhooks.length === 0 ? (
              <p style={{ color: "#656d76", margin: 0 }}>No webhooks yet.</p>
            ) : null}
          </div>
        </section>
      ) : null}

      {tab === "audit" && isOwner ? (
        <section style={{ ...cardStyle, marginTop: 16, display: "grid", gap: 8 }}>
          {audit.map((ev) => (
            <div key={ev.id} style={{ fontSize: 13 }}>
              <strong>{ev.action}</strong>{" "}
              <span style={{ color: "#656d76" }}>
                {ev.resourceType}
                {ev.resourceId ? ` ${ev.resourceId}` : ""} ·{" "}
                {new Date(ev.createdAt).toLocaleString()}
              </span>
            </div>
          ))}
          {audit.length === 0 ? (
            <p style={{ color: "#656d76", margin: 0 }}>No audit events yet.</p>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}
