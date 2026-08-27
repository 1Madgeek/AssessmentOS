"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { getErrorMessage } from "@assessment-os/sdk";
import { api } from "@/lib/api";
import { downloadBlob } from "@/lib/download";
import { Button, LinkButton } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DataTable,
  createColumnHelper,
  type DataTableFeatures,
} from "@/components/ui/data-table";
import {
  filterSelectClass,
  StatusBadge,
  type StatusBadgeTone,
} from "@/components/ui/status-badge";
import { errorClass, mutedClass, pageClass } from "@/lib/styles";

type SessionRow = {
  id: string;
  candidateName: string;
  candidateEmail: string;
  status: string;
  totalScore: number;
  maxScore: number;
  submittedAt: string | null;
};

type CollapsedRow = {
  candidateEmail: string;
  candidateName: string;
  bestScore: number;
  maxScore: number;
  bestSessionId: string;
  attemptCount: number;
  attempts: SessionRow[];
};

const sessionColumnHelper = createColumnHelper<DataTableFeatures, SessionRow>();
const collapsedColumnHelper = createColumnHelper<DataTableFeatures, CollapsedRow>();

function sessionStatusTone(status: string): StatusBadgeTone {
  const s = status.toLowerCase();
  if (s === "submitted" || s === "completed") return "success";
  if (s === "in_progress" || s === "in progress") return "warning";
  return "muted";
}

function SessionStatusBadge({ status }: { status: string }) {
  return (
    <StatusBadge tone={sessionStatusTone(status)}>
      {status.replace(/_/g, " ")}
    </StatusBadge>
  );
}

export default function SessionsListPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [rows, setRows] = useState<SessionRow[]>([]);
  const [collapsed, setCollapsed] = useState<CollapsedRow[]>([]);
  const [collapseBest, setCollapseBest] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [exportBusy, setExportBusy] = useState(false);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    void (async () => {
      const me = await api.me();
      if (!me) {
        router.replace("/admin/login");
        return;
      }
      if (collapseBest) {
        const data = (await api.listSessions(id, {
          collapse: "best",
        })) as CollapsedRow[];
        setCollapsed(data);
        setRows([]);
      } else {
        const data = (await api.listSessions(id)) as SessionRow[];
        setRows(data);
        setCollapsed([]);
      }
    })().catch((err) =>
      setError(err instanceof Error ? err.message : "Failed to load"),
    );
  }, [id, router, collapseBest]);

  const statusOptions = useMemo(() => {
    const set = new Set(rows.map((r) => r.status));
    return Array.from(set).sort();
  }, [rows]);

  const filteredCollapsed = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return collapsed.filter((row) => {
      if (!needle) return true;
      return (
        row.candidateName.toLowerCase().includes(needle) ||
        row.candidateEmail.toLowerCase().includes(needle)
      );
    });
  }, [collapsed, q]);

  const filteredRows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((row) => {
      if (statusFilter !== "all" && row.status !== statusFilter) return false;
      if (!needle) return true;
      return (
        row.candidateName.toLowerCase().includes(needle) ||
        row.candidateEmail.toLowerCase().includes(needle)
      );
    });
  }, [rows, q, statusFilter]);

  async function downloadResultsCsv() {
    setExportBusy(true);
    setError(null);
    try {
      const blob = await api.exportAssessmentResultsCsv(id, {
        collapse: collapseBest ? "best" : undefined,
      });
      downloadBlob(blob, `assessment-${id}-results.csv`);
    } catch (err) {
      setError(getErrorMessage(err, "Export failed"));
    } finally {
      setExportBusy(false);
    }
  }

  const collapsedColumns = useMemo(
    () =>
      collapsedColumnHelper.columns([
        collapsedColumnHelper.accessor("candidateName", {
          header: "Name",
          cell: ({ row }) => (
            <Link
              href={`/admin/assessments/${id}/sessions/${row.original.bestSessionId}`}
              className="font-medium hover:underline"
            >
              {row.original.candidateName}
            </Link>
          ),
        }),
        collapsedColumnHelper.accessor("candidateEmail", {
          header: "Email",
          cell: ({ row }) => (
            <span className={mutedClass}>{row.original.candidateEmail}</span>
          ),
        }),
        collapsedColumnHelper.display({
          id: "bestScore",
          header: "Best score",
          cell: ({ row }) => (
            <span className="tabular-nums">
              {row.original.bestScore}/{row.original.maxScore}
            </span>
          ),
        }),
        collapsedColumnHelper.accessor("attemptCount", {
          header: "Attempts",
          cell: ({ row }) => (
            <span className="tabular-nums">{row.original.attemptCount}</span>
          ),
        }),
        collapsedColumnHelper.display({
          id: "actions",
          header: () => <div className="text-right">Actions</div>,
          cell: ({ row }) => {
            const isExpanded = expanded[row.original.candidateEmail];
            return (
              <div className="flex flex-col items-end gap-2">
                <div className="flex flex-wrap justify-end gap-2">
                  <LinkButton
                    variant="outline"
                    size="sm"
                    href={`/admin/assessments/${id}/sessions/${row.original.bestSessionId}`}
                  >
                    Open
                  </LinkButton>
                  {row.original.attemptCount > 1 ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onPress={() =>
                        setExpanded((prev) => ({
                          ...prev,
                          [row.original.candidateEmail]:
                            !prev[row.original.candidateEmail],
                        }))
                      }
                    >
                      {isExpanded ? "Hide" : "Expand"}
                    </Button>
                  ) : null}
                </div>
                {isExpanded ? (
                  <div className="grid w-full gap-1 text-left text-sm">
                    {row.original.attempts.map((s) => (
                      <Link
                        key={s.id}
                        href={`/admin/assessments/${id}/sessions/${s.id}`}
                        className="text-primary hover:underline"
                      >
                        {s.status} · {s.totalScore}/{s.maxScore}
                        {s.submittedAt
                          ? ` · ${new Date(s.submittedAt).toLocaleString()}`
                          : ""}
                      </Link>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          },
        }),
      ]),
    [expanded, id],
  );

  const sessionColumns = useMemo(
    () =>
      sessionColumnHelper.columns([
        sessionColumnHelper.accessor("candidateName", {
          header: "Name",
          cell: ({ row }) => (
            <Link
              href={`/admin/assessments/${id}/sessions/${row.original.id}`}
              className="font-medium hover:underline"
            >
              {row.original.candidateName}
            </Link>
          ),
        }),
        sessionColumnHelper.accessor("candidateEmail", {
          header: "Email",
          cell: ({ row }) => (
            <span className={mutedClass}>{row.original.candidateEmail}</span>
          ),
        }),
        sessionColumnHelper.accessor("status", {
          header: "Status",
          cell: ({ row }) => (
            <SessionStatusBadge status={row.original.status} />
          ),
        }),
        sessionColumnHelper.display({
          id: "score",
          header: "Score",
          cell: ({ row }) => (
            <span className="tabular-nums">
              {row.original.totalScore}/{row.original.maxScore}
            </span>
          ),
        }),
        sessionColumnHelper.accessor("submittedAt", {
          header: "Submitted",
          cell: ({ row }) =>
            row.original.submittedAt ? (
              <span className={mutedClass}>
                {new Date(row.original.submittedAt).toLocaleString()}
              </span>
            ) : (
              <span className={mutedClass}>—</span>
            ),
        }),
        sessionColumnHelper.display({
          id: "actions",
          header: () => <div className="text-right">Actions</div>,
          cell: ({ row }) => (
            <div className="flex justify-end">
              <LinkButton
                variant="outline"
                size="sm"
                href={`/admin/assessments/${id}/sessions/${row.original.id}`}
              >
                Open
              </LinkButton>
            </div>
          ),
        }),
      ]),
    [id],
  );

  return (
    <main className={pageClass}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            Candidate sessions
          </h1>
          <p className={mutedClass}>
            {collapseBest
              ? "Best score per candidate. Expand to see all attempts."
              : "All attempts for this assessment."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            isDisabled={exportBusy}
            onPress={() => void downloadResultsCsv()}
          >
            {exportBusy ? "Exporting…" : "Download CSV"}
          </Button>
          <Button
            variant="outline"
            onPress={() => {
              setCollapseBest((v) => !v);
              setStatusFilter("all");
            }}
          >
            {collapseBest ? "Show all attempts" : "Collapse best score"}
          </Button>
        </div>
      </div>

      {error ? <p className={errorClass}>{error}</p> : null}

      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="max-w-60"
          placeholder="Search name or email"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {!collapseBest && statusOptions.length > 0 ? (
          <Label className="flex items-center gap-2 text-sm font-normal">
            Status
            <select
              className={filterSelectClass}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">All</option>
              {statusOptions.map((status) => (
                <option key={status} value={status}>
                  {status.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </Label>
        ) : null}
      </div>

      {collapseBest ? (
        <DataTable
          ariaLabel="Candidate sessions (best score)"
          columns={collapsedColumns}
          data={filteredCollapsed}
          emptyMessage={
            collapsed.length === 0
              ? "No sessions yet."
              : "No sessions match your filters."
          }
        />
      ) : (
        <DataTable
          ariaLabel="Candidate sessions (all attempts)"
          columns={sessionColumns}
          data={filteredRows}
          emptyMessage={
            rows.length === 0
              ? "No sessions yet."
              : "No sessions match your filters."
          }
        />
      )}
    </main>
  );
}
