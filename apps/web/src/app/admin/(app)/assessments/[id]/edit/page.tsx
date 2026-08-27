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

export default function EditAssessmentPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [randomize, setRandomize] = useState(false);
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
    </main>
  );
}
