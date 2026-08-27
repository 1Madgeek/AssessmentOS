"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { getErrorMessage } from "@assessment-os/sdk";
import { api } from "@/lib/api";
import { downloadBlob } from "@/lib/download";
import { Button, LinkButton } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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

export default function SessionsListPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [rows, setRows] = useState<SessionRow[]>([]);
  const [collapsed, setCollapsed] = useState<CollapsedRow[]>([]);
  const [collapseBest, setCollapseBest] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [exportBusy, setExportBusy] = useState(false);

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

  return (
    <main className={pageClass}>
      <LinkButton href={`/admin/assessments/${id}`} variant="ghost" size="sm">
        ← Builder
      </LinkButton>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Candidate sessions
        </h1>
        <div className="flex flex-wrap gap-2">
          <Button
            isDisabled={exportBusy}
            onPress={() => void downloadResultsCsv()}
          >
            {exportBusy ? "Exporting…" : "Download CSV"}
          </Button>
          <Button
            variant="outline"
            onPress={() => setCollapseBest((v) => !v)}
          >
            {collapseBest ? "Show all attempts" : "Collapse best score"}
          </Button>
        </div>
      </div>
      {error ? <p className={errorClass}>{error}</p> : null}

      {collapseBest ? (
        <div className="grid gap-3">
          {collapsed.map((g) => (
            <Card key={g.candidateEmail}>
              <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
                <div>
                  <CardTitle className="text-base">
                    <Link
                      href={`/admin/assessments/${id}/sessions/${g.bestSessionId}`}
                      className="hover:underline"
                    >
                      {g.candidateName} ({g.candidateEmail})
                    </Link>
                  </CardTitle>
                  <CardDescription>
                    Best score {g.bestScore}/{g.maxScore} · {g.attemptCount}{" "}
                    attempt{g.attemptCount === 1 ? "" : "s"}
                  </CardDescription>
                </div>
                {g.attemptCount > 1 ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onPress={() =>
                      setExpanded((prev) => ({
                        ...prev,
                        [g.candidateEmail]: !prev[g.candidateEmail],
                      }))
                    }
                  >
                    {expanded[g.candidateEmail] ? "Hide" : "Expand"}
                  </Button>
                ) : null}
              </CardHeader>
              {expanded[g.candidateEmail] ? (
                <CardContent className="grid gap-1.5 pt-0">
                  {g.attempts.map((s) => (
                    <Link
                      key={s.id}
                      href={`/admin/assessments/${id}/sessions/${s.id}`}
                      className="text-sm text-primary hover:underline"
                    >
                      {s.status} · {s.totalScore}/{s.maxScore}
                      {s.submittedAt
                        ? ` · ${new Date(s.submittedAt).toLocaleString()}`
                        : ""}
                    </Link>
                  ))}
                </CardContent>
              ) : null}
            </Card>
          ))}
          {collapsed.length === 0 ? (
            <p className={mutedClass}>No sessions yet.</p>
          ) : null}
        </div>
      ) : (
        <div className="grid gap-3">
          {rows.map((s) => (
            <Link
              key={s.id}
              href={`/admin/assessments/${id}/sessions/${s.id}`}
              className="block"
            >
              <Card className="transition-colors hover:bg-muted/40">
                <CardHeader>
                  <CardTitle className="text-base">
                    {s.candidateName} ({s.candidateEmail})
                  </CardTitle>
                  <CardDescription>
                    {s.status} · score {s.totalScore}/{s.maxScore}
                    {s.submittedAt
                      ? ` · submitted ${new Date(s.submittedAt).toLocaleString()}`
                      : ""}
                  </CardDescription>
                </CardHeader>
              </Card>
            </Link>
          ))}
          {rows.length === 0 ? (
            <p className={mutedClass}>No sessions yet.</p>
          ) : null}
        </div>
      )}
    </main>
  );
}
