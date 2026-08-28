"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Assessment, MeResponse } from "@assessment-os/sdk";
import { api, getActiveOrgId, setActiveOrgId } from "@/lib/api";
import { Button, LinkButton } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  filterSelectClass,
  StatusBadge,
} from "@/components/ui/status-badge";
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
import { errorClass, mutedClass, pageClass } from "@/lib/styles";

const columnHelper = createColumnHelper<DataTableFeatures, Assessment>();

type StatusFilter = "all" | "published" | "draft";

export default function AssessmentsListPage() {
  const router = useRouter();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [title, setTitle] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [error, setError] = useState<string | null>(null);

  const canWrite = me?.role !== "reviewer";

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return assessments.filter((a) => {
      if (statusFilter === "published" && !a.published) return false;
      if (statusFilter === "draft" && a.published) return false;
      if (!needle) return true;
      return (
        a.title.toLowerCase().includes(needle) ||
        a.description.toLowerCase().includes(needle)
      );
    });
  }, [assessments, q, statusFilter]);

  const columns = useMemo(
    () =>
      columnHelper.columns([
        columnHelper.accessor("title", {
          header: "Title",
          cell: ({ row }) => (
            <Link
              href={`/admin/assessments/${row.original.id}`}
              className="font-medium hover:underline"
            >
              {row.original.title}
            </Link>
          ),
        }),
        columnHelper.accessor("published", {
          header: "Status",
          cell: ({ row }) => (
            <StatusBadge tone={row.original.published ? "success" : "muted"}>
              {row.original.published ? "Published" : "Draft"}
            </StatusBadge>
          ),
        }),
        columnHelper.accessor("durationSeconds", {
          header: "Duration",
          cell: ({ row }) => (
            <span className="tabular-nums">
              {Math.round(row.original.durationSeconds / 60)} min
            </span>
          ),
        }),
        columnHelper.accessor("sessionCount", {
          header: "Sessions",
          cell: ({ row }) => {
            const total = row.original.sessionCount ?? 0;
            const done = row.original.submittedSessionCount ?? 0;
            return (
              <Link
                href={`/admin/assessments/${row.original.id}/sessions`}
                className="tabular-nums hover:underline"
              >
                {total === 0
                  ? "0"
                  : done > 0
                    ? `${total} (${done} done)`
                    : String(total)}
              </Link>
            );
          },
        }),
        columnHelper.display({
          id: "actions",
          header: () => <div className="text-right">Actions</div>,
          cell: ({ row }) => (
            <div className="flex flex-wrap justify-end gap-2">
              <LinkButton
                variant="outline"
                size="sm"
                href={`/admin/assessments/${row.original.id}`}
              >
                Open
              </LinkButton>
              <LinkButton
                variant="ghost"
                size="sm"
                href={`/admin/assessments/${row.original.id}/sessions`}
              >
                Sessions
              </LinkButton>
            </div>
          ),
        }),
      ]),
    [],
  );

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
      setAssessments(await api.listAssessments());
    })().catch((err) =>
      setError(err instanceof Error ? err.message : "Failed to load"),
    );
  }, [router]);

  async function createAssessment(e: FormEvent) {
    e.preventDefault();
    if (!title.trim() || !canWrite) return;
    setCreating(true);
    setError(null);
    try {
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
      setCreateOpen(false);
      setTitle("");
      router.push(`/admin/assessments/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setCreating(false);
    }
  }

  if (!me) {
    return <p className={mutedClass}>Loading…</p>;
  }

  return (
    <main className={pageClass}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            Assessments
          </h1>
          <p className={mutedClass}>
            Create and open take-homes for your organization.
          </p>
        </div>
        {canWrite ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button onPress={() => setCreateOpen(true)}>Create</Button>
          </div>
        ) : null}
      </div>

      {error ? <p className={errorClass}>{error}</p> : null}

      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="max-w-60"
          placeholder="Search title or description"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Label className="flex items-center gap-2 text-sm font-normal">
          Status
          <select
            className={filterSelectClass}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          >
            <option value="all">All</option>
            <option value="published">Published</option>
            <option value="draft">Draft</option>
          </select>
        </Label>
      </div>

      <DataTable
        ariaLabel="Assessments"
        columns={columns}
        data={filtered}
        emptyMessage={
          assessments.length === 0
            ? "No assessments yet. Create one to get started."
            : "No assessments match your filters."
        }
      />

      <Dialog
        isOpen={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) setTitle("");
        }}
      >
        <DialogHeader>
          <DialogTitle>Create assessment</DialogTitle>
          <DialogDescription>
            Give it a title — you can edit duration and questions next.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => void createAssessment(e)} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="new-assessment-title">Title</Label>
            <Input
              id="new-assessment-title"
              placeholder="e.g. Backend Engineer"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onPress={() => setCreateOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" isDisabled={creating || !title.trim()}>
              Create
            </Button>
          </DialogFooter>
        </form>
      </Dialog>
    </main>
  );
}
