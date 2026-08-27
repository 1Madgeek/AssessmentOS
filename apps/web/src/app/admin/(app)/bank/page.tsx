"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { BankQuestion, OrgRole } from "@assessment-os/sdk";
import { getErrorMessage } from "@assessment-os/sdk";
import { api, getActiveOrgId, setActiveOrgId } from "@/lib/api";
import { Button, LinkButton } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DataTable,
  createColumnHelper,
  type DataTableFeatures,
} from "@/components/ui/data-table";
import {
  filterSelectClass,
  StatusBadge,
} from "@/components/ui/status-badge";
import {
  TYPE_LABELS,
  bankTypeTone,
  configSummary,
  parseBankType,
  type BankType,
} from "@/components/admin/bank-question-editor";
import { errorClass, mutedClass, pageClass } from "@/lib/styles";

const columnHelper = createColumnHelper<DataTableFeatures, BankQuestion>();

type TypeFilter = "all" | BankType;

export default function QuestionBankPage() {
  const router = useRouter();
  const [items, setItems] = useState<BankQuestion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState<OrgRole | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const canWrite = role !== "reviewer";

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items.filter((item) => {
      if (typeFilter !== "all" && item.type !== typeFilter) return false;
      if (!needle) return true;
      const tags = item.tags?.join(" ").toLowerCase() ?? "";
      return (
        item.title.toLowerCase().includes(needle) ||
        item.prompt.toLowerCase().includes(needle) ||
        tags.includes(needle)
      );
    });
  }, [items, q, typeFilter]);

  async function reload() {
    setItems(await api.listBankQuestions());
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
      setRole(me.role);
      await reload();
    })().catch((err) =>
      setError(err instanceof Error ? err.message : "Failed to load"),
    );
  }, [router]);

  async function remove(id: string) {
    if (!canWrite) return;
    if (!confirm("Delete this bank template?")) return;
    try {
      await api.deleteBankQuestion(id);
      await reload();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  const columns = useMemo(
    () =>
      columnHelper.columns([
        columnHelper.accessor("title", {
          header: "Title",
          cell: ({ row }) => (
            <Link
              href={`/admin/bank/${row.original.id}`}
              className="font-medium hover:underline"
            >
              {row.original.title}
            </Link>
          ),
        }),
        columnHelper.accessor("type", {
          header: "Type",
          cell: ({ row }) => {
            const type = parseBankType(row.original.type);
            return (
              <StatusBadge tone={bankTypeTone(type)}>
                {TYPE_LABELS[type]}
              </StatusBadge>
            );
          },
        }),
        columnHelper.accessor("points", {
          header: "Points",
          cell: ({ row }) => (
            <span className="tabular-nums">{row.original.points}</span>
          ),
        }),
        columnHelper.accessor("timeLimitSeconds", {
          header: "Time",
          cell: ({ row }) => (
            <span className="tabular-nums">{row.original.timeLimitSeconds}s</span>
          ),
        }),
        columnHelper.display({
          id: "tags",
          header: "Tags / summary",
          cell: ({ row }) => (
            <span className={mutedClass}>
              {[
                configSummary(row.original),
                row.original.tags?.length
                  ? row.original.tags.join(", ")
                  : null,
              ]
                .filter(Boolean)
                .join(" · ") || "—"}
            </span>
          ),
        }),
        columnHelper.accessor("prompt", {
          header: "Prompt",
          cell: ({ row }) => (
            <span className="line-clamp-2 max-w-xs text-sm">
              {row.original.prompt.slice(0, 160)}
              {row.original.prompt.length > 160 ? "…" : ""}
            </span>
          ),
        }),
        ...(canWrite
          ? [
              columnHelper.display({
                id: "actions",
                header: () => <div className="text-right">Actions</div>,
                cell: ({ row }) => (
                  <div className="flex flex-wrap justify-end gap-2">
                    <LinkButton
                      href={`/admin/bank/${row.original.id}`}
                      variant="outline"
                      size="sm"
                    >
                      Edit
                    </LinkButton>
                    <Button
                      variant="outline"
                      size="sm"
                      onPress={() => void remove(row.original.id)}
                    >
                      Delete
                    </Button>
                  </div>
                ),
              }),
            ]
          : []),
      ]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canWrite],
  );

  return (
    <main className={pageClass}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            Question bank
          </h1>
          <p className={`${mutedClass} max-w-2xl leading-relaxed`}>
            Full question templates (config, tests, scoring) for pools and cloning
            into assessments. Edit templates here — “Add from bank” copies them as-is.
          </p>
        </div>
        {canWrite ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button onPress={() => setCreateOpen(true)}>Create</Button>
          </div>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className={errorClass}>
          {error}
        </p>
      ) : null}

      {!canWrite ? (
        <p className={mutedClass}>
          Reviewer role — bank write actions are hidden.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="max-w-60"
          placeholder="Search title, prompt, or tags"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Label className="flex items-center gap-2 text-sm font-normal">
          Type
          <select
            className={filterSelectClass}
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
          >
            <option value="all">All</option>
            {(Object.keys(TYPE_LABELS) as BankType[]).map((t) => (
              <option key={t} value={t}>
                {TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </Label>
      </div>

      <DataTable
        ariaLabel="Question bank templates"
        columns={columns}
        data={filtered}
        emptyMessage={
          items.length === 0
            ? "No bank templates yet. Create a coding, MCQ, SQL, or short-answer template."
            : "No templates match your filters."
        }
      />

      <Dialog isOpen={createOpen} onOpenChange={setCreateOpen}>
        <DialogHeader>
          <DialogTitle>Create template</DialogTitle>
          <DialogDescription>
            Choose a question type to start a new bank template.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(TYPE_LABELS) as BankType[]).map((t) => (
            <LinkButton
              key={t}
              href={`/admin/bank/new?type=${t}`}
              variant="outline"
              onPress={() => setCreateOpen(false)}
            >
              {TYPE_LABELS[t]}
            </LinkButton>
          ))}
        </div>
      </Dialog>
    </main>
  );
}
