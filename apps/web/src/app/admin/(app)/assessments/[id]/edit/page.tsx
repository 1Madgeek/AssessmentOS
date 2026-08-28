"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import type { Assessment, OrgRole } from "@assessment-os/sdk";
import { getErrorMessage } from "@assessment-os/sdk";
import { api, getActiveOrgId, setActiveOrgId } from "@/lib/api";
import { Button, LinkButton } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/ui/status-badge";
import { errorClass, mutedClass, pageClass } from "@/lib/styles";
import {
  DEFAULT_INTEGRITY_NOTICE,
  DEFAULT_INTEGRITY_SIGNALS,
  DEFAULT_PROCTORING,
} from "@/lib/integrity";

export default function EditAssessmentPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [randomize, setRandomize] = useState(false);
  const [noticeEnabled, setNoticeEnabled] = useState(false);
  const [forbidAi, setForbidAi] = useState(true);
  const [legalWatermark, setLegalWatermark] = useState(true);
  const [canaryTokens, setCanaryTokens] = useState(true);
  const [liabilityLanguage, setLiabilityLanguage] = useState(true);
  const [trackPasteSize, setTrackPasteSize] = useState(true);
  const [flagCopy, setFlagCopy] = useState(true);
  const [requireFullscreen, setRequireFullscreen] = useState(false);
  const [trackTypingStats, setTrackTypingStats] = useState(true);
  const [webcamSnapshots, setWebcamSnapshots] = useState(false);
  const [snapMin, setSnapMin] = useState(45);
  const [snapMax, setSnapMax] = useState(120);
  const [snapshotOnFocusLoss, setSnapshotOnFocusLoss] = useState(true);
  const [retainDays, setRetainDays] = useState(30);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [role, setRole] = useState<OrgRole | null>(null);
  const canWrite = role !== "reviewer";

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
      const a = await api.getAssessment(id);
      setAssessment(a);
      setTitle(a.title);
      setDescription(a.description);
      setDurationMinutes(Math.max(1, Math.round(a.durationSeconds / 60)));
      setRandomize(Boolean(a.rules.randomizeQuestionOrder));
      const n = a.rules.integrityNotice ?? DEFAULT_INTEGRITY_NOTICE;
      setNoticeEnabled(Boolean(n.enabled));
      setForbidAi(n.forbidAiAssistance !== false);
      setLegalWatermark(n.legalWatermark !== false);
      setCanaryTokens(n.canaryTokens !== false);
      setLiabilityLanguage(n.liabilityLanguage !== false);
      const s = a.rules.integrity ?? DEFAULT_INTEGRITY_SIGNALS;
      setTrackPasteSize(s.trackPasteSize !== false);
      setFlagCopy(s.flagCopy !== false);
      setRequireFullscreen(Boolean(s.requireFullscreen));
      setTrackTypingStats(s.trackTypingStats !== false);
      const p = a.rules.proctoring ?? DEFAULT_PROCTORING;
      setWebcamSnapshots(Boolean(p.webcamSnapshots));
      setSnapMin(p.snapshotIntervalMinSeconds ?? 45);
      setSnapMax(p.snapshotIntervalMaxSeconds ?? 120);
      setSnapshotOnFocusLoss(p.snapshotOnFocusLoss !== false);
      setRetainDays(p.retainDays ?? 30);
    })().catch((err) =>
      setError(getErrorMessage(err, "Failed to load")),
    );
  }, [id, router]);

  async function save(e?: FormEvent) {
    e?.preventDefault();
    if (!assessment || !canWrite) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await api.updateAssessment(id, {
        title: title.trim() || assessment.title,
        description,
        durationSeconds: Math.max(1, durationMinutes) * 60,
        rules: {
          ...assessment.rules,
          randomizeQuestionOrder: randomize,
          integrityNotice: {
            enabled: noticeEnabled,
            forbidAiAssistance: forbidAi,
            legalWatermark,
            canaryTokens,
            liabilityLanguage,
          },
          integrity: {
            trackPasteSize,
            flagCopy,
            requireFullscreen,
            trackTypingStats,
          },
          proctoring: {
            webcamSnapshots,
            snapshotIntervalMinSeconds: Math.max(15, Math.min(600, snapMin)),
            snapshotIntervalMaxSeconds: Math.max(
              Math.max(15, Math.min(600, snapMin)),
              Math.min(900, snapMax),
            ),
            snapshotOnFocusLoss,
            retainDays: Math.max(1, Math.min(365, retainDays)),
          },
        },
      });
      setAssessment(updated);
      router.push(`/admin/assessments/${id}`);
    } catch (err) {
      setError(getErrorMessage(err, "Save failed"));
      setBusy(false);
    }
  }

  async function publish() {
    if (!assessment || !canWrite) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await api.updateAssessment(id, {
        title: title.trim() || assessment.title,
        description,
        durationSeconds: Math.max(1, durationMinutes) * 60,
        rules: {
          ...assessment.rules,
          randomizeQuestionOrder: randomize,
          integrityNotice: {
            enabled: noticeEnabled,
            forbidAiAssistance: forbidAi,
            legalWatermark,
            canaryTokens,
            liabilityLanguage,
          },
          integrity: {
            trackPasteSize,
            flagCopy,
            requireFullscreen,
            trackTypingStats,
          },
          proctoring: {
            webcamSnapshots,
            snapshotIntervalMinSeconds: Math.max(15, Math.min(600, snapMin)),
            snapshotIntervalMaxSeconds: Math.max(
              Math.max(15, Math.min(600, snapMin)),
              Math.min(900, snapMax),
            ),
            snapshotOnFocusLoss,
            retainDays: Math.max(1, Math.min(365, retainDays)),
          },
        },
        published: true,
      });
      setAssessment(updated);
      router.push(`/admin/assessments/${id}`);
    } catch (err) {
      setError(getErrorMessage(err, "Publish failed"));
      setBusy(false);
    }
  }

  if (!assessment) {
    return (
      <main className={pageClass}>
        <p className={mutedClass}>Loading…</p>
      </main>
    );
  }

  return (
    <main className={pageClass}>
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Edit assessment
        </h1>
        <p className={mutedClass}>
          {assessment.title || "Untitled assessment"}
        </p>
      </div>

      {!canWrite ? (
        <p className={mutedClass}>
          Reviewer role — editing is not allowed.
        </p>
      ) : null}

      {error ? (
        <p role="alert" className={errorClass}>
          {error}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
          <CardDescription>
            Title, description, duration, and rules.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4" onSubmit={(e) => void save(e)}>
            <div className="grid gap-2">
              <Label htmlFor="edit-title">Title</Label>
              <Input
                id="edit-title"
                value={title}
                disabled={!canWrite}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-description">Description</Label>
              <Textarea
                id="edit-description"
                className="min-h-[4.5rem]"
                value={description}
                disabled={!canWrite}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Description"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-duration">Duration (minutes)</Label>
              <Input
                id="edit-duration"
                type="number"
                min={1}
                className="max-w-[8rem]"
                value={durationMinutes}
                disabled={!canWrite}
                onChange={(e) => setDurationMinutes(Number(e.target.value))}
              />
            </div>
            <Label className="font-normal">
              <input
                type="checkbox"
                className="mr-1.5"
                checked={randomize}
                disabled={!canWrite}
                onChange={(e) => setRandomize(e.target.checked)}
              />
              Randomize question order
            </Label>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge tone={assessment.published ? "success" : "muted"}>
                {assessment.published ? "Published" : "Draft"}
              </StatusBadge>
              {canWrite && !assessment.published ? (
                <Button
                  type="button"
                  isDisabled={busy}
                  onPress={() => void publish()}
                >
                  Publish
                </Button>
              ) : null}
            </div>
            {canWrite ? (
              <div className="flex flex-wrap gap-2">
                <Button type="submit" isDisabled={busy}>
                  {busy ? "Saving…" : "Save"}
                </Button>
                <LinkButton
                  variant="outline"
                  href={`/admin/assessments/${id}`}
                >
                  Cancel
                </LinkButton>
              </div>
            ) : (
              <LinkButton
                variant="outline"
                href={`/admin/assessments/${id}`}
              >
                Cancel
              </LinkButton>
            )}
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Integrity notice</CardTitle>
          <CardDescription>
            Legal watermarks and clickwrap create notice and liability; they do
            not stop all agents. Pair with oral follow-up for shortlists. Have
            counsel review terms for your jurisdiction.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <Label className="font-normal">
            <input
              type="checkbox"
              className="mr-1.5"
              checked={noticeEnabled}
              disabled={!canWrite}
              onChange={(e) => setNoticeEnabled(e.target.checked)}
            />
            Require start clickwrap (no-AI / confidential terms)
          </Label>
          <Label className="font-normal">
            <input
              type="checkbox"
              className="mr-1.5"
              checked={forbidAi}
              disabled={!canWrite || !noticeEnabled}
              onChange={(e) => setForbidAi(e.target.checked)}
            />
            Forbid AI assistants and computer-use agents
          </Label>
          <Label className="font-normal">
            <input
              type="checkbox"
              className="mr-1.5"
              checked={legalWatermark}
              disabled={!canWrite || !noticeEnabled}
              onChange={(e) => setLegalWatermark(e.target.checked)}
            />
            Visible confidential watermark on questions
          </Label>
          <Label className="font-normal">
            <input
              type="checkbox"
              className="mr-1.5"
              checked={canaryTokens}
              disabled={!canWrite || !noticeEnabled}
              onChange={(e) => setCanaryTokens(e.target.checked)}
            />
            Per-session canary tokens (leak tracing)
          </Label>
          <Label className="font-normal">
            <input
              type="checkbox"
              className="mr-1.5"
              checked={liabilityLanguage}
              disabled={!canWrite || !noticeEnabled}
              onChange={(e) => setLiabilityLanguage(e.target.checked)}
            />
            Explicit liability / legal-action language
          </Label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Browser signals</CardTitle>
          <CardDescription>
            Privacy-first activity events for the anti-cheat timeline. No
            keylogging or clipboard contents.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <Label className="font-normal">
            <input
              type="checkbox"
              className="mr-1.5"
              checked={trackPasteSize}
              disabled={!canWrite}
              onChange={(e) => setTrackPasteSize(e.target.checked)}
            />
            Log paste byte length
          </Label>
          <Label className="font-normal">
            <input
              type="checkbox"
              className="mr-1.5"
              checked={flagCopy}
              disabled={!canWrite}
              onChange={(e) => setFlagCopy(e.target.checked)}
            />
            Flag copy / cut of prompt content
          </Label>
          <Label className="font-normal">
            <input
              type="checkbox"
              className="mr-1.5"
              checked={trackTypingStats}
              disabled={!canWrite}
              onChange={(e) => setTrackTypingStats(e.target.checked)}
            />
            Typing cadence aggregates
          </Label>
          <Label className="font-normal">
            <input
              type="checkbox"
              className="mr-1.5"
              checked={requireFullscreen}
              disabled={!canWrite}
              onChange={(e) => setRequireFullscreen(e.target.checked)}
            />
            Request fullscreen and flag exits
          </Label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Webcam snapshots</CardTitle>
          <CardDescription>
            When enabled, webcam permission is mandatory before the timed test.
            Snapshot timing is randomized in the min–max range and never shown
            to the candidate.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <Label className="font-normal">
            <input
              type="checkbox"
              className="mr-1.5"
              checked={webcamSnapshots}
              disabled={!canWrite}
              onChange={(e) => setWebcamSnapshots(e.target.checked)}
            />
            Require intermittent webcam snapshots
          </Label>
          <div className="flex flex-wrap gap-4">
            <div className="grid gap-2">
              <Label htmlFor="snap-min">Min interval (seconds)</Label>
              <Input
                id="snap-min"
                type="number"
                min={15}
                max={600}
                className="max-w-[8rem]"
                value={snapMin}
                disabled={!canWrite || !webcamSnapshots}
                onChange={(e) => setSnapMin(Number(e.target.value))}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="snap-max">Max interval (seconds)</Label>
              <Input
                id="snap-max"
                type="number"
                min={30}
                max={900}
                className="max-w-[8rem]"
                value={snapMax}
                disabled={!canWrite || !webcamSnapshots}
                onChange={(e) => setSnapMax(Number(e.target.value))}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="retain-days">Retain (days)</Label>
              <Input
                id="retain-days"
                type="number"
                min={1}
                max={365}
                className="max-w-[8rem]"
                value={retainDays}
                disabled={!canWrite || !webcamSnapshots}
                onChange={(e) => setRetainDays(Number(e.target.value))}
              />
            </div>
          </div>
          <Label className="font-normal">
            <input
              type="checkbox"
              className="mr-1.5"
              checked={snapshotOnFocusLoss}
              disabled={!canWrite || !webcamSnapshots}
              onChange={(e) => setSnapshotOnFocusLoss(e.target.checked)}
            />
            Extra snapshot on tab hide / focus loss (jittered)
          </Label>
        </CardContent>
      </Card>
    </main>
  );
}
