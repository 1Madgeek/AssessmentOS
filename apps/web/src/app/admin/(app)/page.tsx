"use client";

import { useEffect, useMemo, useState } from "react";
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

function ClaudeLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path
        fill="currentColor"
        d="M12.7 3.2 16.4 12l-3.7 8.8h-2.8L6.2 12l3.7-8.8h2.8Zm-1.4 3.3L8.7 12l2.6 5.5h.8L14.7 12l-2.6-5.5h-.8Z"
      />
    </svg>
  );
}

function CursorLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path
        fill="currentColor"
        d="M5 3.5 19.5 12 11 13.8 8.8 20.5 5 3.5Zm2.7 4.2 1.7 8.1.9-2.7 4.4-.9L7.7 7.7Z"
      />
    </svg>
  );
}

function CodexLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path
        fill="currentColor"
        d="M22.3 12c0 5.5-4.5 10-10 10a10 10 0 0 1-9.7-7.6h3.2A6.9 6.9 0 0 0 12.3 19c3.9 0 7-3.1 7-7s-3.1-7-7-7A6.9 6.9 0 0 0 5.8 9.6H2.6A10 10 0 0 1 12.3 2c5.5 0 10 4.5 10 10Z"
      />
    </svg>
  );
}

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
        assessmentHelper.display({
          id: "actions",
          header: "",
          cell: ({ row }) => (
            <div className="flex justify-end">
              <LinkButton
                href={`/admin/assessments/${row.original.id}`}
                size="sm"
                variant="outline"
              >
                Open
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
                <span className="flex size-9 items-center justify-center border border-border bg-background text-foreground">
                  <ClaudeLogo className="size-5" />
                </span>
                <span className="flex size-9 items-center justify-center border border-border bg-background text-foreground">
                  <CursorLogo className="size-5" />
                </span>
                <span className="flex size-9 items-center justify-center border border-border bg-background text-foreground">
                  <CodexLogo className="size-5" />
                </span>
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
