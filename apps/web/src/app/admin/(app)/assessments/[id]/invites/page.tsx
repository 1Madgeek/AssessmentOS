"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { Assessment, InviteRecord, OrgRole } from "@assessment-os/sdk";
import { getErrorMessage } from "@assessment-os/sdk";
import { api, getActiveOrgId, setActiveOrgId } from "@/lib/api";
import { Button, buttonVariants } from "@/components/ui/button";
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
  filterSelectClass,
  type StatusBadgeTone,
} from "@/components/ui/status-badge";
import {
  codeInlineClass,
  errorClass,
  mutedClass,
  pageClass,
} from "@/lib/styles";
import { cn } from "@/lib/utils";
import { inviteCandidateDisplay } from "@/lib/invite-display";

const columnHelper = createColumnHelper<DataTableFeatures, InviteRecord>();

type StatusFilter = "all" | "pending" | "used" | "revoked" | "expired";

function inviteStatusTone(status: string): StatusBadgeTone {
  switch (status) {
    case "pending":
      return "warning";
    case "used":
    case "accepted":
      return "success";
    case "revoked":
    case "expired":
      return "muted";
    default:
      return "neutral";
  }
}

export default function AssessmentInvitesPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [invites, setInvites] = useState<InviteRecord[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteExpiresDays, setInviteExpiresDays] = useState(14);
  const [inviteSendEmail, setInviteSendEmail] = useState(true);
  const [inviteOpenLink, setInviteOpenLink] = useState(false);
  const [inviteMode, setInviteMode] = useState<"single" | "multi">("single");
  const [inviteMaxUses, setInviteMaxUses] = useState(50);
  const [createOpen, setCreateOpen] = useState(false);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [inviteActionId, setInviteActionId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [inviteNotice, setInviteNotice] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [role, setRole] = useState<OrgRole | null>(null);
  const canWrite = role !== "reviewer";

  const reload = useCallback(async () => {
    const me = await api.me();
    if (!me) {
      router.replace("/admin/login");
      return;
    }
    const activeId =
      getActiveOrgId() ??
      me.activeOrganization?.id ??
      me.organizations[0]?.id ??
      null;
    if (activeId) setActiveOrgId(activeId);
    setRole(me.role);
    const a = await api.getAssessment(id);
    setAssessment(a);
    if (a.published) {
      setInvites(await api.listInvites(id));
    } else {
      setInvites([]);
    }
  }, [id, router]);

  useEffect(() => {
    void reload().catch((err) =>
      setError(getErrorMessage(err, "Failed to load")),
    );
  }, [reload]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return invites.filter((inv) => {
      if (statusFilter !== "all" && inv.status !== statusFilter) return false;
      if (!needle) return true;
      return (
        (inv.candidateEmail ?? "").toLowerCase().includes(needle) ||
        (inv.candidateName ?? "").toLowerCase().includes(needle)
      );
    });
  }, [invites, q, statusFilter]);

  async function createInvite() {
    setBusy(true);
    setError(null);
    setInviteNotice(null);
    try {
      const email = inviteEmail.trim();
      if (inviteMode === "single" && !inviteOpenLink && !email) {
        setError("Enter a candidate email, or check Open link (no email).");
        setBusy(false);
        return;
      }
      const created = await api.createInvite(id, {
        candidateEmail:
          inviteMode === "single" && !inviteOpenLink
            ? email || undefined
            : undefined,
        candidateName:
          inviteMode === "single" && !inviteOpenLink
            ? inviteName.trim() || undefined
            : undefined,
        expiresInDays: inviteExpiresDays,
        sendEmail:
          inviteMode === "single" && !inviteOpenLink
            ? Boolean(email) && inviteSendEmail
            : false,
        mode: inviteMode,
        maxUses: inviteMode === "multi" ? inviteMaxUses : 1,
      });
      setInvites(await api.listInvites(id));
      setInviteEmail("");
      setInviteName("");
      setInviteOpenLink(false);
      setCreateOpen(false);
      setInviteNotice(
        created.emailed
          ? "Invite created and email sent."
          : email && inviteSendEmail && !inviteOpenLink
            ? "Invite created, but email could not be sent."
            : "Invite created.",
      );
    } catch (err) {
      setError(getErrorMessage(err, "Invite failed"));
    } finally {
      setBusy(false);
    }
  }

  async function revokeInvite(inviteId: string, label: string) {
    if (
      !window.confirm(
        `Revoke invite${label ? ` for ${label}` : ""}? The link will stop working.`,
      )
    ) {
      return;
    }
    setInviteActionId(inviteId);
    setError(null);
    try {
      await api.revokeInvite(id, inviteId);
      setInvites(await api.listInvites(id));
      setInviteNotice("Invite revoked.");
    } catch (err) {
      setError(getErrorMessage(err, "Revoke failed"));
    } finally {
      setInviteActionId(null);
    }
  }

  async function resendInvite(inviteId: string) {
    setInviteActionId(inviteId);
    setError(null);
    try {
      await api.resendInvite(id, inviteId);
      setInvites(await api.listInvites(id));
      setInviteNotice("Invite email resent.");
    } catch (err) {
      setError(getErrorMessage(err, "Resend failed"));
    } finally {
      setInviteActionId(null);
    }
  }

  async function copyInviteLink(inv: InviteRecord) {
    try {
      await navigator.clipboard.writeText(inv.url);
      setCopiedId(inv.id);
      window.setTimeout(
        () => setCopiedId((cur) => (cur === inv.id ? null : cur)),
        2000,
      );
    } catch {
      setError("Could not copy link");
    }
  }

  async function handleBulkCsv(file: File) {
    setBulkBusy(true);
    setError(null);
    setInviteNotice(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("expiresInDays", String(inviteExpiresDays));
      form.append("sendEmail", "true");
      const result = await api.bulkCreateInvites(id, form);
      setInvites(await api.listInvites(id));
      setInviteNotice(
        `Bulk: ${result.created.length} created` +
          (result.errors.length ? `, ${result.errors.length} errors` : ""),
      );
      if (result.errors.length) {
        setError(
          result.errors
            .slice(0, 5)
            .map((x) => `row ${x.row}: ${x.message}`)
            .join("; "),
        );
      }
    } catch (err) {
      setError(getErrorMessage(err, "Bulk upload failed"));
    } finally {
      setBulkBusy(false);
    }
  }

  const columns = useMemo(
    () =>
      columnHelper.columns([
        columnHelper.accessor("status", {
          header: "Status",
          cell: ({ row }) => (
            <StatusBadge tone={inviteStatusTone(row.original.status)}>
              {row.original.status}
            </StatusBadge>
          ),
        }),
        columnHelper.display({
          id: "mode",
          header: "Mode",
          cell: ({ row }) => {
            const inv = row.original;
            return inv.mode === "multi"
              ? `multi (${inv.useCount ?? 0}/${inv.maxUses ?? "?"})`
              : "single";
          },
        }),
        columnHelper.display({
          id: "candidate",
          header: "Candidate",
          cell: ({ row }) => {
            const inv = row.original;
            const { primary, secondary } = inviteCandidateDisplay(inv);
            return (
              <div>
                <div className="font-medium">{primary}</div>
                {secondary ? <div className={mutedClass}>{secondary}</div> : null}
              </div>
            );
          },
        }),
        columnHelper.display({
          id: "expires",
          header: "Expires",
          cell: ({ row }) =>
            row.original.expiresAt
              ? new Date(row.original.expiresAt).toLocaleString()
              : "—",
        }),
        columnHelper.display({
          id: "link",
          header: "Link",
          cell: ({ row }) => (
            <code className={cn(codeInlineClass, "break-all text-xs")}>
              {row.original.url}
            </code>
          ),
        }),
        columnHelper.display({
          id: "actions",
          header: () => <div className="text-right">Actions</div>,
          cell: ({ row }) => {
            const inv = row.original;
            const usable = inv.status === "pending";
            const canRevoke =
              inv.status === "pending" || inv.status === "expired";
            const actionBusy = inviteActionId === inv.id;
            return (
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  isDisabled={!usable}
                  onPress={() => void copyInviteLink(inv)}
                >
                  {copiedId === inv.id ? "Copied!" : "Copy"}
                </Button>
                {usable && inv.candidateEmail ? (
                  <Button
                    variant="outline"
                    size="sm"
                    isDisabled={actionBusy || !canWrite}
                    onPress={() => void resendInvite(inv.id)}
                  >
                    Resend
                  </Button>
                ) : null}
                {canRevoke ? (
                  <Button
                    variant="outline"
                    size="sm"
                    isDisabled={actionBusy || !canWrite}
                    onPress={() =>
                      void revokeInvite(
                        inv.id,
                        inv.candidateEmail ?? inv.candidateName ?? "",
                      )
                    }
                  >
                    Revoke
                  </Button>
                ) : null}
              </div>
            );
          },
        }),
      ]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canWrite, copiedId, inviteActionId],
  );

  if (!assessment) {
    return (
      <main className={pageClass}>
        <p className={mutedClass}>Loading…</p>
      </main>
    );
  }

  return (
    <main className={pageClass}>
      {!assessment.published ? (
        <div className="space-y-4">
          <div>
            <h1 className="font-heading text-2xl font-semibold tracking-tight">
              Invites
            </h1>
            <p className={mutedClass}>
              Publish the assessment before creating invites.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="font-heading text-2xl font-semibold tracking-tight">
                Invites
              </h1>
              <p className={mutedClass}>
                {canWrite
                  ? "Default is single-use. Multi-use open links require OTP per start and allow one session per email until max uses."
                  : "Reviewers can view invites but cannot create them."}
              </p>
            </div>
            {canWrite ? (
              <div className="flex flex-wrap items-center gap-2">
                <Button onPress={() => setCreateOpen(true)}>Create</Button>
                <Label
                  className={cn(
                    buttonVariants({ variant: "outline" }),
                    "cursor-pointer font-normal",
                  )}
                >
                  {bulkBusy ? "Uploading…" : "Bulk CSV"}
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    disabled={bulkBusy}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (file) void handleBulkCsv(file);
                    }}
                  />
                </Label>
              </div>
            ) : null}
          </div>

          {inviteNotice ? (
            <p
              role="status"
              className="text-sm text-emerald-600 dark:text-emerald-400"
            >
              {inviteNotice}
            </p>
          ) : null}
          {error ? (
            <p role="alert" className={errorClass}>
              {error}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <Input
              className="max-w-60"
              placeholder="Search email or name"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <Label className="flex items-center gap-2 text-sm font-normal">
              Status
              <select
                className={filterSelectClass}
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(e.target.value as StatusFilter)
                }
              >
                <option value="all">All</option>
                <option value="pending">pending</option>
                <option value="used">used</option>
                <option value="revoked">revoked</option>
                <option value="expired">expired</option>
              </select>
            </Label>
          </div>

          <DataTable
            columns={columns}
            data={filtered}
            ariaLabel="Assessment invites"
            emptyMessage={
              invites.length === 0
                ? "No invites yet."
                : "No invites match your filters."
            }
            pageSize={10}
          />
        </div>
      )}

      <Dialog
        isOpen={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) {
            setInviteEmail("");
            setInviteName("");
            setInviteOpenLink(false);
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>Create invite</DialogTitle>
          <DialogDescription>
            Single-use invites bind to a candidate email by default. Check open link
            only when the candidate should enter their email at start. Multi-use
            links are always open and require OTP per start.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="flex flex-wrap gap-4">
            <Label className="font-normal">
              <input
                type="radio"
                className="mr-1.5"
                checked={inviteMode === "single"}
                onChange={() => setInviteMode("single")}
              />
              Single-use
            </Label>
            <Label className="font-normal">
              <input
                type="radio"
                className="mr-1.5"
                checked={inviteMode === "multi"}
                onChange={() => setInviteMode("multi")}
              />
              Multi-use open link
            </Label>
            {inviteMode === "multi" ? (
              <Label className="font-normal">
                Max uses{" "}
                <Input
                  type="number"
                  min={2}
                  max={10000}
                  className="inline-block w-20"
                  value={inviteMaxUses}
                  onChange={(e) => setInviteMaxUses(Number(e.target.value))}
                />
              </Label>
            ) : null}
          </div>
          {inviteMode === "single" ? (
            <div className="grid gap-3">
              <Label className="font-normal">
                <input
                  type="checkbox"
                  className="mr-1.5"
                  checked={inviteOpenLink}
                  onChange={(e) => {
                    setInviteOpenLink(e.target.checked);
                    if (e.target.checked) {
                      setInviteEmail("");
                      setInviteName("");
                      setInviteSendEmail(false);
                    } else {
                      setInviteSendEmail(true);
                    }
                  }}
                />
                Open link (no email — collected when they start)
              </Label>
              {!inviteOpenLink ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  <Input
                    placeholder="Candidate email"
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                  />
                  <Input
                    placeholder="Candidate name (optional)"
                    value={inviteName}
                    onChange={(e) => setInviteName(e.target.value)}
                  />
                </div>
              ) : null}
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-3">
            <Label className="font-normal">
              Expires in days{" "}
              <Input
                type="number"
                min={1}
                max={365}
                className="inline-block w-[4.5rem]"
                value={inviteExpiresDays}
                onChange={(e) => setInviteExpiresDays(Number(e.target.value))}
              />
            </Label>
            {inviteMode === "single" && !inviteOpenLink ? (
              <Label className="font-normal">
                <input
                  type="checkbox"
                  className="mr-1.5"
                  checked={inviteSendEmail}
                  onChange={(e) => setInviteSendEmail(e.target.checked)}
                  disabled={!inviteEmail.trim()}
                />
                Send email
              </Label>
            ) : null}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onPress={() => setCreateOpen(false)}>
            Cancel
          </Button>
          <Button isDisabled={busy} onPress={() => void createInvite()}>
            {inviteMode === "multi" ? "Create open link" : "Create invite"}
          </Button>
        </DialogFooter>
      </Dialog>
    </main>
  );
}
