"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getErrorMessage } from "@assessment-os/sdk";
import { api, getActiveOrgId, setActiveOrgId } from "@/lib/api";
import { Button, LinkButton } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DataTable,
  createColumnHelper,
  type DataTableFeatures,
} from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { errorClass, mutedClass, pageClass } from "@/lib/styles";

type CandidateRow = Awaited<ReturnType<typeof api.listCandidates>>[number];

const columnHelper = createColumnHelper<DataTableFeatures, CandidateRow>();

export default function CandidatesPage() {
  const router = useRouter();
  const [rows, setRows] = useState<CandidateRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [shortlistedOnly, setShortlistedOnly] = useState(false);
  const [minScore, setMinScore] = useState("");

  async function reloadList() {
    const opts: {
      q?: string;
      shortlisted?: boolean;
      minScorePct?: number;
    } = {};
    if (q.trim()) opts.q = q.trim();
    if (shortlistedOnly) opts.shortlisted = true;
    if (minScore.trim()) opts.minScorePct = Number(minScore);
    setRows(await api.listCandidates(opts));
  }

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
      await reloadList();
    })().catch((err) => setError(getErrorMessage(err)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const columns = useMemo(
    () =>
      columnHelper.columns([
        columnHelper.accessor("name", {
          header: "Name",
          cell: ({ row }) => (
            <Link
              href={`/admin/candidates/${row.original.id}`}
              className="font-medium hover:underline"
            >
              {row.original.name}
            </Link>
          ),
        }),
        columnHelper.accessor("email", {
          header: "Email",
          cell: ({ row }) => (
            <Link
              href={`/admin/candidates/${row.original.id}`}
              className={`${mutedClass} hover:underline`}
            >
              {row.original.email}
            </Link>
          ),
        }),
        columnHelper.accessor("sessionCount", {
          header: "Sessions",
          cell: ({ row }) => (
            <span className="tabular-nums">{row.original.sessionCount}</span>
          ),
        }),
        columnHelper.accessor("bestScorePct", {
          header: "Best score",
          cell: ({ row }) =>
            row.original.bestScorePct != null ? (
              <span className="tabular-nums">{row.original.bestScorePct}%</span>
            ) : (
              <span className={mutedClass}>—</span>
            ),
        }),
        columnHelper.accessor("shortlisted", {
          header: "Shortlisted",
          cell: ({ row }) =>
            row.original.shortlisted ? (
              <StatusBadge tone="success">Shortlisted</StatusBadge>
            ) : null,
        }),
        columnHelper.accessor("lastSubmittedAt", {
          header: "Last submitted",
          cell: ({ row }) =>
            row.original.lastSubmittedAt ? (
              <span className={mutedClass}>
                {new Date(row.original.lastSubmittedAt).toLocaleDateString()}
              </span>
            ) : (
              <span className={mutedClass}>—</span>
            ),
        }),
        columnHelper.display({
          id: "actions",
          header: () => <div className="text-right">Actions</div>,
          cell: ({ row }) => (
            <div className="flex justify-end">
              <LinkButton
                href={`/admin/candidates/${row.original.id}`}
                variant="outline"
                size="sm"
              >
                Open
              </LinkButton>
            </div>
          ),
        }),
      ]),
    [],
  );

  return (
    <main className={pageClass}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            Candidates
          </h1>
          <p className={`${mutedClass} max-w-2xl leading-relaxed`}>
            People who were invited or assessed in this organization. Shortlist strong
            performers and reopen past sessions across assessments.
          </p>
        </div>
      </div>

      {error ? <p className={errorClass}>{error}</p> : null}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void reloadList().catch((err) => setError(getErrorMessage(err)));
        }}
        className="flex flex-wrap items-center gap-2"
      >
        <Input
          className="max-w-60"
          placeholder="Search name or email"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Label className="flex items-center gap-2 text-sm font-normal">
          <input
            type="checkbox"
            className="size-4"
            checked={shortlistedOnly}
            onChange={(e) => setShortlistedOnly(e.target.checked)}
          />
          Shortlisted only
        </Label>
        <Label className="flex items-center gap-2 text-sm font-normal">
          Min best score %
          <Input
            type="number"
            min={0}
            max={100}
            className="w-[4.5rem]"
            value={minScore}
            onChange={(e) => setMinScore(e.target.value)}
            placeholder="e.g. 70"
          />
        </Label>
        <Button type="submit" variant="outline">
          Apply
        </Button>
      </form>

      <DataTable
        ariaLabel="Candidates"
        columns={columns}
        data={rows}
        emptyMessage="No candidates yet. Candidates appear automatically when you invite someone or they start an assessment."
      />
    </main>
  );
}
