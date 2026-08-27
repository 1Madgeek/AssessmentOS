"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { getErrorMessage } from "@assessment-os/sdk";
import { api, getActiveOrgId, setActiveOrgId } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { errorClass, mutedClass, pageClass } from "@/lib/styles";

type CandidateDetail = Awaited<ReturnType<typeof api.getCandidate>>;

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

  return (
    <main className={pageClass}>
      {error ? <p className={errorClass}>{error}</p> : null}

      {!detail && !error ? (
        <p className={mutedClass}>Loading…</p>
      ) : null}

      {detail ? (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
            <div className="grid gap-1">
              <CardTitle className="text-base">{detail.name}</CardTitle>
              <p className={mutedClass}>{detail.email}</p>
            </div>
            <Button
              variant={detail.shortlisted ? "outline" : "default"}
              isDisabled={busy}
              onPress={() => void toggleShortlist()}
            >
              {detail.shortlisted ? "Remove shortlist" : "Shortlist"}
            </Button>
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
            <Button
              variant="outline"
              isDisabled={busy}
              onPress={() => void saveNotes()}
            >
              Save notes
            </Button>
            <h3 className="text-sm font-medium">Assessment history</h3>
            <ul className="list-inside list-disc space-y-2 text-sm">
              {detail.sessions.map((s) => (
                <li key={s.sessionId}>
                  <Link
                    href={`/admin/assessments/${s.assessmentId}/sessions/${s.sessionId}`}
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    {s.assessmentTitle}
                  </Link>{" "}
                  — {s.status}
                  {s.maxScore > 0
                    ? ` · ${s.totalScore}/${s.maxScore}`
                    : ""}
                  {s.submittedAt
                    ? ` · ${new Date(s.submittedAt).toLocaleString()}`
                    : ""}
                </li>
              ))}
              {detail.sessions.length === 0 ? (
                <li className={`${mutedClass} list-none`}>
                  Invited but no sessions yet.
                </li>
              ) : null}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </main>
  );
}
