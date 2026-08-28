"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import type {
  Assessment,
  AssessmentQuestion,
  InviteRecord,
  OrgRole,
} from "@assessment-os/sdk";
import { getErrorMessage } from "@assessment-os/sdk";
import { api, getActiveOrgId, setActiveOrgId } from "@/lib/api";
import { LinkButton } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  StatusBadge,
  type StatusBadgeTone,
} from "@/components/ui/status-badge";
import {
  DataTable,
  createColumnHelper,
  type DataTableFeatures,
} from "@/components/ui/data-table";
import { errorClass, mutedClass, pageClass } from "@/lib/styles";
import { cn } from "@/lib/utils";
import { inviteCandidateDisplay } from "@/lib/invite-display";

type SessionRow = {
  id: string;
  candidateName: string;
  candidateEmail: string;
  status: string;
  totalScore: number;
  maxScore: number;
  submittedAt: string | null;
};

const questionHelper =
  createColumnHelper<DataTableFeatures, AssessmentQuestion>();
const inviteHelper = createColumnHelper<DataTableFeatures, InviteRecord>();
const sessionHelper = createColumnHelper<DataTableFeatures, SessionRow>();

function questionTypeTone(type: string): StatusBadgeTone {
  switch (type) {
    case "coding":
      return "success";
    case "sql":
      return "warning";
    case "text":
      return "muted";
    default:
      return "neutral";
  }
}

function sessionStatusTone(status: string): StatusBadgeTone {
  switch (status) {
    case "submitted":
    case "completed":
      return "success";
    case "in_progress":
    case "started":
      return "warning";
    case "expired":
      return "danger";
    default:
      return "muted";
  }
}

function inviteStatusTone(status: string): StatusBadgeTone {
  switch (status) {
    case "active":
    case "used":
      return "success";
    case "revoked":
      return "danger";
    case "expired":
      return "muted";
    default:
      return "neutral";
  }
}

function KpiCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  return (
    <Card size="sm">
      <CardContent className="grid gap-1 pt-(--card-spacing)">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p
          className={cn(
            "font-heading text-2xl font-semibold tracking-tight tabular-nums",
            tone === "success" && "text-emerald-700 dark:text-emerald-400",
            tone === "warning" && "text-amber-700 dark:text-amber-400",
            tone === "danger" && "text-destructive",
          )}
        >
          {value}
        </p>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

function sortQuestions(assessment: Assessment): AssessmentQuestion[] {
  return (assessment.questions ?? []).slice().sort((a, b) => {
    const sa = a.sectionId
      ? (assessment.sections ?? []).find((s) => s.id === a.sectionId)?.order ??
        999
      : 998;
    const sb = b.sectionId
      ? (assessment.sections ?? []).find((s) => s.id === b.sectionId)?.order ??
        999
      : 998;
    if (sa !== sb) return sa - sb;
    return a.order - b.order;
  });
}

export default function AssessmentHubPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [invites, setInvites] = useState<InviteRecord[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [error, setError] = useState<string | null>(null);
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
    try {
      setSessions((await api.listSessions(id)) as SessionRow[]);
    } catch {
      setSessions([]);
    }
  }, [id, router]);

  useEffect(() => {
    void reload().catch((err) =>
      setError(getErrorMessage(err, "Failed to load")),
    );
  }, [reload]);

  const questionRows = useMemo(
    () => (assessment ? sortQuestions(assessment) : []),
    [assessment],
  );

  const sessionKpis = useMemo(() => {
    const total = sessions.length;
    const submitted = sessions.filter(
      (s) =>
        s.status === "submitted" ||
        s.status === "completed" ||
        s.submittedAt != null,
    );
    const inProgress = sessions.filter(
      (s) =>
        s.status === "in_progress" ||
        s.status === "started" ||
        s.status === "active",
    ).length;
    const expired = sessions.filter((s) => s.status === "expired").length;
    const scored = submitted.filter((s) => s.maxScore > 0);
    const avgPct =
      scored.length > 0
        ? Math.round(
            scored.reduce(
              (sum, s) => sum + (s.totalScore / s.maxScore) * 100,
              0,
            ) / scored.length,
          )
        : null;
    const passPct =
      scored.length > 0
        ? Math.round(
            (scored.filter((s) => s.totalScore / s.maxScore >= 0.7).length /
              scored.length) *
              100,
          )
        : null;
    const completionPct =
      total > 0 ? Math.round((submitted.length / total) * 100) : 0;
    return {
      total,
      submitted: submitted.length,
      inProgress,
      expired,
      avgPct,
      passPct,
      completionPct,
    };
  }, [sessions]);

  const questionColumns = useMemo(
    () =>
      questionHelper.columns([
        questionHelper.accessor("order", {
          header: "#",
          cell: ({ row }) => (
            <span className="tabular-nums">{row.original.order + 1}</span>
          ),
        }),
        questionHelper.display({
          id: "type",
          header: "Type",
          cell: ({ row }) => (
            <StatusBadge tone={questionTypeTone(row.original.question.type)}>
              {row.original.question.type}
            </StatusBadge>
          ),
        }),
        questionHelper.display({
          id: "title",
          header: "Title",
          cell: ({ row }) => (
            <span className="font-medium">{row.original.question.title}</span>
          ),
        }),
        questionHelper.display({
          id: "points",
          header: "Pts",
          cell: ({ row }) => (
            <span className="tabular-nums">
              {row.original.question.points}
            </span>
          ),
        }),
        questionHelper.display({
          id: "time",
          header: "Time",
          cell: ({ row }) => (
            <span className="tabular-nums">
              {row.original.question.timeLimitSeconds}s
            </span>
          ),
        }),
        questionHelper.display({
          id: "section",
          header: "Section",
          cell: ({ row }) => {
            const sectionId = row.original.sectionId;
            if (!sectionId) return <span className={mutedClass}>—</span>;
            const section = (assessment?.sections ?? []).find(
              (s) => s.id === sectionId,
            );
            return (
              <span className="text-sm">{section?.title ?? "—"}</span>
            );
          },
        }),
      ]),
    [assessment?.sections],
  );

  const inviteColumns = useMemo(
    () =>
      inviteHelper.columns([
        inviteHelper.accessor("status", {
          header: "Status",
          cell: ({ row }) => (
            <StatusBadge tone={inviteStatusTone(row.original.status)}>
              {row.original.status}
            </StatusBadge>
          ),
        }),
        inviteHelper.display({
          id: "candidate",
          header: "Candidate",
          cell: ({ row }) => {
            const { primary, secondary } = inviteCandidateDisplay(row.original);
            return (
              <div>
                <div className="font-medium">{primary}</div>
                {secondary ? (
                  <div className={mutedClass}>{secondary}</div>
                ) : null}
              </div>
            );
          },
        }),
        inviteHelper.display({
          id: "mode",
          header: "Mode",
          cell: ({ row }) =>
            row.original.mode === "multi" ? "multi" : "single",
        }),
        inviteHelper.display({
          id: "expires",
          header: "Expires",
          cell: ({ row }) =>
            row.original.expiresAt
              ? new Date(row.original.expiresAt).toLocaleDateString()
              : "—",
        }),
      ]),
    [],
  );

  const sessionColumns = useMemo(
    () =>
      sessionHelper.columns([
        sessionHelper.accessor("candidateName", {
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
        sessionHelper.accessor("candidateEmail", {
          header: "Email",
          cell: ({ row }) => (
            <span className={mutedClass}>{row.original.candidateEmail}</span>
          ),
        }),
        sessionHelper.accessor("status", {
          header: "Status",
          cell: ({ row }) => (
            <StatusBadge tone={sessionStatusTone(row.original.status)}>
              {row.original.status}
            </StatusBadge>
          ),
        }),
        sessionHelper.display({
          id: "score",
          header: "Score",
          cell: ({ row }) => (
            <span className="tabular-nums">
              {row.original.totalScore}/{row.original.maxScore}
            </span>
          ),
        }),
        sessionHelper.display({
          id: "open",
          header: () => <div className="text-right">Open</div>,
          cell: ({ row }) => (
            <div className="flex justify-end">
              <LinkButton
                variant="outline"
                size="sm"
                href={`/admin/assessments/${id}/sessions/${row.original.id}`}
              >
                View
              </LinkButton>
            </div>
          ),
        }),
      ]),
    [id],
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
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-heading text-2xl font-semibold tracking-tight">
              {assessment.title || "Untitled assessment"}
            </h1>
            <StatusBadge tone={assessment.published ? "success" : "muted"}>
              {assessment.published ? "Published" : "Draft"}
            </StatusBadge>
          </div>
          <p className={`${mutedClass} line-clamp-2 max-w-3xl`}>
            {assessment.description.trim()
              ? assessment.description
              : "Sections, questions, invites, and results."}
          </p>
        </div>
        {canWrite ? (
          <div className="flex flex-wrap items-center gap-2">
            <LinkButton
              variant="outline"
              href={`/admin/assessments/${id}/edit`}
            >
              Edit
            </LinkButton>
            <LinkButton href={`/admin/assessments/${id}/builder`}>
              Open builder
            </LinkButton>
          </div>
        ) : (
          <LinkButton
            variant="outline"
            href={`/admin/assessments/${id}/builder`}
          >
            View builder
          </LinkButton>
        )}
      </div>

      {!canWrite ? (
        <p className={mutedClass}>
          Reviewer role — editing and invites are hidden.
        </p>
      ) : null}

      {error ? (
        <p role="alert" className={errorClass}>
          {error}
        </p>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Sessions"
          value={String(sessionKpis.total)}
          hint={`${sessionKpis.inProgress} in progress · ${sessionKpis.expired} expired`}
        />
        <KpiCard
          label="Submitted"
          value={String(sessionKpis.submitted)}
          hint={
            sessionKpis.total > 0
              ? `${sessionKpis.completionPct}% completion`
              : "No sessions yet"
          }
          tone={
            sessionKpis.submitted === 0
              ? "default"
              : sessionKpis.completionPct >= 50
                ? "success"
                : "warning"
          }
        />
        <KpiCard
          label="Avg score"
          value={
            sessionKpis.avgPct != null ? `${sessionKpis.avgPct}%` : "—"
          }
          hint="Among submitted sessions with a max score"
          tone={
            sessionKpis.avgPct == null
              ? "default"
              : sessionKpis.avgPct >= 70
                ? "success"
                : sessionKpis.avgPct >= 40
                  ? "warning"
                  : "danger"
          }
        />
        <KpiCard
          label="Pass rate (≥70%)"
          value={
            sessionKpis.passPct != null ? `${sessionKpis.passPct}%` : "—"
          }
          hint={`${sessionKpis.submitted} results considered`}
          tone={
            sessionKpis.passPct == null
              ? "default"
              : sessionKpis.passPct >= 50
                ? "success"
                : "warning"
          }
        />
      </section>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <div className="grid gap-1.5">
            <CardTitle>Questions</CardTitle>
            <CardDescription>
              Fixed questions on this assessment.
            </CardDescription>
          </div>
          <LinkButton
            variant="outline"
            size="sm"
            href={`/admin/assessments/${id}/builder`}
          >
            Manage all
          </LinkButton>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={questionColumns}
            data={questionRows}
            ariaLabel="Assessment questions preview"
            emptyMessage="No questions yet."
            pageSize={5}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <div className="grid gap-1.5">
            <CardTitle>Pools</CardTitle>
            <CardDescription>
              Random draws from bank questions at session start.
            </CardDescription>
          </div>
          <LinkButton
            variant="outline"
            size="sm"
            href={`/admin/assessments/${id}/builder#pools`}
          >
            Manage pools
          </LinkButton>
        </CardHeader>
        <CardContent className="grid gap-2">
          {(assessment.pools ?? []).length === 0 ? (
            <p className={mutedClass}>No pools yet.</p>
          ) : (
            <ul className="grid gap-2 text-sm">
              {(assessment.pools ?? []).map((pool) => (
                <li
                  key={pool.id}
                  className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2 last:border-0 last:pb-0"
                >
                  <span className="font-medium">{pool.name}</span>
                  <span className={mutedClass}>
                    Draw {pool.drawCount} of {pool.members.length}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {assessment.published ? (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
            <div className="grid gap-1.5">
              <CardTitle>Invites</CardTitle>
              <CardDescription>
                Recent invites for this assessment.
              </CardDescription>
            </div>
            <LinkButton
              variant="outline"
              size="sm"
              href={`/admin/assessments/${id}/invites`}
            >
              Manage invites
            </LinkButton>
          </CardHeader>
          <CardContent>
            <DataTable
              columns={inviteColumns}
              data={invites}
              ariaLabel="Assessment invites preview"
              emptyMessage="No invites yet."
              pageSize={5}
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Invites</CardTitle>
            <CardDescription>
              Invites unlock after you publish this assessment.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <div className="grid gap-1.5">
            <CardTitle>Sessions / Results</CardTitle>
            <CardDescription>
              Latest candidate sessions for this assessment.
            </CardDescription>
          </div>
          <LinkButton
            variant="outline"
            size="sm"
            href={`/admin/assessments/${id}/sessions`}
          >
            View all results
          </LinkButton>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={sessionColumns}
            data={sessions}
            ariaLabel="Assessment sessions preview"
            emptyMessage="No sessions yet."
            pageSize={5}
          />
        </CardContent>
      </Card>
    </main>
  );
}
