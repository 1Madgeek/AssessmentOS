"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getErrorMessage } from "@assessment-os/sdk";
import { api, getActiveOrgId, setActiveOrgId } from "@/lib/api";
import { KpiCard } from "@/components/admin/kpi-card";
import { Button, LinkButton } from "@/components/ui/button";
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
import {
  StatusBadge,
  type StatusBadgeTone,
} from "@/components/ui/status-badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { errorClass, mutedClass, pageClass } from "@/lib/styles";

type CandidateDetail = Awaited<ReturnType<typeof api.getCandidate>>;
type SessionRow = CandidateDetail["sessions"][number];

const sessionHelper = createColumnHelper<DataTableFeatures, SessionRow>();

function sessionStatusTone(status: string): StatusBadgeTone {
  switch (status) {
    case "submitted":
    case "completed":
      return "success";
    case "in_progress":
    case "started":
    case "active":
      return "warning";
    case "expired":
      return "danger";
    default:
      return "muted";
  }
}

export default function CandidateDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [detail, setDetail] = useState<CandidateDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notesDraft, setNotesDraft] = useState("");

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
      const c = await api.getCandidate(id);
      setDetail(c);
      setNotesDraft(c.notes ?? "");
    })().catch((err) => setError(getErrorMessage(err)));
  }, [id, router]);

  const kpis = useMemo(() => {
    if (!detail) return null;
    const sessions = detail.sessions;
    const total = sessions.length;
    const submitted = sessions.filter(
      (s) =>
        s.status === "submitted" ||
        s.status === "completed" ||
        s.submittedAt != null,
    );
    const scored = submitted.filter((s) => s.maxScore > 0);
    const avgPct =
      scored.length > 0
        ? Math.round(
            (scored.reduce((sum, s) => sum + s.totalScore / s.maxScore, 0) /
              scored.length) *
              100,
          )
        : null;
    const latest = [...sessions]
      .sort((a, b) => {
        const ta = a.submittedAt ? Date.parse(a.submittedAt) : 0;
        const tb = b.submittedAt ? Date.parse(b.submittedAt) : 0;
        return tb - ta;
      })
      .find((s) => s.maxScore > 0);

    return {
      total,
      submittedCount: submitted.length,
      avgPct,
      latestScore:
        latest != null
          ? `${latest.totalScore}/${latest.maxScore}`
          : null,
    };
  }, [detail]);

  const columns = useMemo(
    () =>
      sessionHelper.columns([
        sessionHelper.accessor("assessmentTitle", {
          header: "Assessment",
          cell: (info) => (
            <span className="font-medium">{info.getValue()}</span>
          ),
        }),
        sessionHelper.accessor("status", {
          header: "Status",
          cell: (info) => (
            <StatusBadge tone={sessionStatusTone(info.getValue())}>
              {info.getValue().replace(/_/g, " ")}
            </StatusBadge>
          ),
        }),
        sessionHelper.display({
          id: "score",
          header: "Score",
          cell: ({ row }) => {
            const s = row.original;
            if (s.maxScore <= 0) {
              return <span className={mutedClass}>—</span>;
            }
            return (
              <span className="tabular-nums">
                {s.totalScore}
                <span className="text-muted-foreground">/{s.maxScore}</span>
              </span>
            );
          },
        }),
        sessionHelper.accessor("submittedAt", {
          header: "Submitted",
          cell: (info) => {
            const v = info.getValue();
            return v ? (
              <span className="text-sm tabular-nums">
                {new Date(v).toLocaleString()}
              </span>
            ) : (
              <span className={mutedClass}>—</span>
            );
          },
        }),
        sessionHelper.display({
          id: "actions",
          header: "",
          cell: ({ row }) => (
            <div className="flex justify-end">
              <LinkButton
                href={`/admin/assessments/${row.original.assessmentId}/sessions/${row.original.sessionId}`}
                size="sm"
                variant="outline"
              >
                View
              </LinkButton>
            </div>
          ),
        }),
      ]),
    [],
  );

  async function toggleShortlist() {
    if (!detail) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await api.updateCandidate(detail.id, {
        shortlisted: !detail.shortlisted,
      });
      setDetail({ ...detail, ...updated });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function saveNotes() {
    if (!detail) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await api.updateCandidate(detail.id, {
        notes: notesDraft.trim() || null,
      });
      setDetail({ ...detail, ...updated });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (!detail && !error) {
    return (
      <main className={pageClass}>
        <p className={mutedClass}>Loading…</p>
      </main>
    );
  }

  return (
    <main className={pageClass}>
      {error ? <p role="alert" className={errorClass}>{error}</p> : null}

      {detail ? (
        <>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-heading text-2xl font-semibold tracking-tight">
                  {detail.name}
                </h1>
                <StatusBadge
                  tone={detail.shortlisted ? "success" : "muted"}
                >
                  {detail.shortlisted ? "Shortlisted" : "Not shortlisted"}
                </StatusBadge>
              </div>
              <p className={mutedClass}>{detail.email}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant={detail.shortlisted ? "outline" : "default"}
                isDisabled={busy}
                onPress={() => void toggleShortlist()}
              >
                {detail.shortlisted ? "Remove shortlist" : "Shortlist"}
              </Button>
            </div>
          </div>

          {kpis ? (
            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <KpiCard label="Sessions" value={String(kpis.total)} />
              <KpiCard
                label="Submitted"
                value={String(kpis.submittedCount)}
                hint={
                  kpis.total > 0
                    ? `${Math.round((kpis.submittedCount / kpis.total) * 100)}% of sessions`
                    : undefined
                }
              />
              <KpiCard
                label="Avg score"
                value={kpis.avgPct != null ? `${kpis.avgPct}%` : "—"}
                tone={
                  kpis.avgPct == null
                    ? "default"
                    : kpis.avgPct >= 70
                      ? "success"
                      : kpis.avgPct >= 40
                        ? "warning"
                        : "danger"
                }
              />
              <KpiCard
                label="Latest score"
                value={kpis.latestScore ?? "—"}
                hint={detail.shortlisted ? "Shortlisted" : "Not shortlisted"}
                tone={detail.shortlisted ? "success" : "default"}
              />
            </section>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="font-heading text-base font-medium">
                Notes
              </CardTitle>
              <CardDescription>
                Internal notes visible only to your organization.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              <div className="grid gap-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  className="min-h-20"
                  value={notesDraft}
                  onChange={(e) => setNotesDraft(e.target.value)}
                />
              </div>
              <div>
                <Button
                  variant="outline"
                  isDisabled={busy}
                  onPress={() => void saveNotes()}
                >
                  Save notes
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="font-heading text-base font-medium">
                Assessment history
              </CardTitle>
              <CardDescription>
                Sessions this candidate has taken across assessments.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <DataTable
                data={detail.sessions}
                columns={columns}
                ariaLabel="Candidate assessment history"
                pageSize={10}
                emptyMessage="Invited but no sessions yet."
              />
            </CardContent>
          </Card>
        </>
      ) : null}
    </main>
  );
}
