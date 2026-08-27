"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { EmailTemplate } from "@assessment-os/sdk";
import { getErrorMessage } from "@assessment-os/sdk";
import { api, getActiveOrgId, setActiveOrgId } from "@/lib/api";
import { LinkButton } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DataTable,
  createColumnHelper,
  type DataTableFeatures,
} from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { errorClass, mutedClass, pageClass } from "@/lib/styles";

const columnHelper = createColumnHelper<DataTableFeatures, EmailTemplate>();

function keyTone(key: string) {
  switch (key) {
    case "invite":
      return "success" as const;
    case "otp":
      return "warning" as const;
    default:
      return "neutral" as const;
  }
}

export default function EmailTemplatesListPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [q, setQ] = useState("");

  useEffect(() => {
    void (async () => {
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
      setTemplates(await api.listEmailTemplates());
      setReady(true);
    })().catch((err) => {
      setError(getErrorMessage(err, "Failed to load"));
      setReady(true);
    });
  }, [router]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return templates;
    return templates.filter(
      (t) =>
        t.name.toLowerCase().includes(needle) ||
        t.key.toLowerCase().includes(needle) ||
        t.subject.toLowerCase().includes(needle),
    );
  }, [templates, q]);

  const columns = useMemo(
    () =>
      columnHelper.columns([
        columnHelper.accessor("name", {
          header: "Name",
          cell: ({ row }) => (
            <Link
              href={`/admin/email-templates/${row.original.key}`}
              className="font-medium hover:underline"
            >
              {row.original.name}
            </Link>
          ),
        }),
        columnHelper.accessor("key", {
          header: "Key",
          cell: ({ row }) => (
            <StatusBadge tone={keyTone(row.original.key)}>
              {row.original.key}
            </StatusBadge>
          ),
        }),
        columnHelper.accessor("subject", {
          header: "Subject",
          cell: ({ row }) => (
            <span className="line-clamp-1 max-w-md text-sm">
              {row.original.subject}
            </span>
          ),
        }),
        columnHelper.accessor("updatedAt", {
          header: "Updated",
          cell: ({ row }) => (
            <span className={`${mutedClass} tabular-nums`}>
              {new Date(row.original.updatedAt).toLocaleString()}
            </span>
          ),
        }),
        columnHelper.display({
          id: "actions",
          header: () => <div className="text-right">Actions</div>,
          cell: ({ row }) => (
            <div className="flex justify-end">
              <LinkButton
                href={`/admin/email-templates/${row.original.key}`}
                variant="outline"
                size="sm"
              >
                Edit
              </LinkButton>
            </div>
          ),
        }),
      ]),
    [],
  );

  if (!ready) {
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
            Email templates
          </h1>
          <p className={mutedClass}>
            Customize invite and OTP emails sent to candidates.
          </p>
        </div>
      </div>

      {error ? (
        <p role="alert" className={errorClass}>
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="max-w-60"
          placeholder="Search name, key, or subject"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <DataTable
        ariaLabel="Email templates"
        columns={columns}
        data={filtered}
        emptyMessage={
          templates.length === 0
            ? "No email templates yet."
            : "No templates match your search."
        }
      />
    </main>
  );
}
