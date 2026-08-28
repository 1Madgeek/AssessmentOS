"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Assessment, MeResponse } from "@assessment-os/sdk";
import { ArrowRight } from "lucide-react";
import { api, getActiveOrgId, setActiveOrgId } from "@/lib/api";
import { KpiCard } from "@/components/admin/kpi-card";
import { LinkButton } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DataTable,
  createColumnHelper,
  type DataTableFeatures,
} from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { errorClass, mutedClass, pageClass } from "@/lib/styles";

const MCP_AGENTS = [
  { name: "Claude", src: "/mcp/claude.png" },
  { name: "Cursor", src: "/mcp/cursor.png" },
  { name: "Codex", src: "/mcp/codex.png" },
] as const;

const assessmentHelper = createColumnHelper<DataTableFeatures, Assessment>();

export default function AdminHomePage() {
  const router = useRouter();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tokenCount, setTokenCount] = useState(0);

  const publishedCount = assessments.filter((a) => a.published).length;
  const recent = useMemo(() => assessments.slice(0, 5), [assessments]);

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
      const [list, tokenList] = await Promise.all([
        api.listAssessments(),
        api.listApiTokens(),
      ]);
      setAssessments(list);
      setTokenCount(tokenList.length);
    })().catch((err) =>
      setError(err instanceof Error ? err.message : "Failed to load"),
    );
  }, [router]);

  const columns = useMemo(
    () =>
      assessmentHelper.columns([
        assessmentHelper.accessor("title", {
          header: "Title",
          cell: (info) => (
            <span className="font-medium">{info.getValue()}</span>
          ),
        }),
        assessmentHelper.accessor("published", {
          header: "Status",
          cell: (info) => (
            <StatusBadge tone={info.getValue() ? "success" : "muted"}>
              {info.getValue() ? "Published" : "Draft"}
            </StatusBadge>
          ),
        }),
        assessmentHelper.accessor("durationSeconds", {
          header: "Duration",
          cell: (info) => (
            <span className="tabular-nums text-sm">
              {Math.round(info.getValue() / 60)} min
            </span>
          ),
        }),
        assessmentHelper.accessor("sessionCount", {
          header: "Sessions",
          cell: ({ row }) => {
            const total = row.original.sessionCount ?? 0;
            const done = row.original.submittedSessionCount ?? 0;
            return (
              <Link
                href={`/admin/assessments/${row.original.id}/sessions`}
                className="tabular-nums text-sm hover:underline"
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
        assessmentHelper.display({
          id: "actions",
          header: "",
          cell: ({ row }) => (
            <div className="flex justify-end gap-2">
              <LinkButton
                href={`/admin/assessments/${row.original.id}`}
                size="sm"
                variant="outline"
              >
                Open
              </LinkButton>
              <LinkButton
                href={`/admin/assessments/${row.original.id}/sessions`}
                size="sm"
                variant="ghost"
              >
                Sessions
              </LinkButton>
            </div>
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

  return (
    <main className={pageClass}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            Dashboard
          </h1>
          <p className={mutedClass}>
            {me.name} · {me.email}
          </p>
        </div>
        <LinkButton href="/admin/assessments">Assessments</LinkButton>
      </div>

      {error ? (
        <p role="alert" className={errorClass}>
          {error}
        </p>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Link
          href="/admin/assessments"
          className="block transition-opacity hover:opacity-90"
        >
          <KpiCard
            label="Assessments"
            value={String(assessments.length)}
            hint="In this organization"
          />
        </Link>
        <KpiCard
          label="Published"
          value={String(publishedCount)}
          hint="Ready for invites"
          tone={publishedCount > 0 ? "success" : "default"}
        />
        <Link
          href="/admin/mcp"
          className="block transition-opacity hover:opacity-90"
        >
          <KpiCard
            label="API tokens"
            value={String(tokenCount)}
            hint="For MCP / SDK access"
          />
        </Link>
      </section>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="font-heading text-base font-medium">
              Recent assessments
            </CardTitle>
            <CardDescription>
              Jump back into a take-home or open the full list.
            </CardDescription>
          </div>
          <LinkButton href="/admin/assessments" variant="outline" size="sm">
            View all
          </LinkButton>
        </CardHeader>
        <CardContent>
          <DataTable
            data={recent}
            columns={columns}
            ariaLabel="Recent assessments"
            pageSize={5}
            emptyMessage="No assessments yet."
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-(--card-spacing)">
          <Link
            href="/admin/mcp"
            className="group flex flex-wrap items-center justify-between gap-4 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                {MCP_AGENTS.map((agent) => (
                  <span
                    key={agent.name}
                    className="flex size-9 items-center justify-center overflow-hidden border border-border bg-background"
                    title={agent.name}
                  >
                    <Image
                      src={agent.src}
                      alt=""
                      width={28}
                      height={28}
                      className="size-7 object-contain"
                    />
                  </span>
                ))}
              </div>
              <div>
                <p className="font-heading text-lg font-semibold tracking-tight">
                  Connect agents with MCP
                </p>
                <p className={`${mutedClass} mt-1 max-w-xl`}>
                  Set up Claude, Cursor, or Codex to create assessments, manage
                  the bank, and send invites from chat.
                </p>
              </div>
            </div>
            <span className="inline-flex items-center gap-1.5 text-sm font-medium">
              Open MCP setup
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </span>
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}
