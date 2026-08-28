"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import type { OrgRole } from "@assessment-os/sdk";
import { getErrorMessage } from "@assessment-os/sdk";
import { api, getActiveOrgId, setActiveOrgId } from "@/lib/api";
import { AssessmentQuestionEditor } from "@/components/admin/assessment-question-editor";
import {
  isQuestionType,
  type QuestionType,
} from "@/components/admin/question-defaults";
import { errorClass, mutedClass, pageClass } from "@/lib/styles";

export default function NewAssessmentQuestionPage() {
  return (
    <Suspense
      fallback={
        <main className={pageClass}>
          <p className={mutedClass}>Loading…</p>
        </main>
      }
    >
      <NewAssessmentQuestionPageInner />
    </Suspense>
  );
}

function NewAssessmentQuestionPageInner() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const typeParam = searchParams.get("type") ?? "mcq";
  const type: QuestionType = isQuestionType(typeParam) ? typeParam : "mcq";
  const sectionIdParam = searchParams.get("sectionId");

  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
      await api.getAssessment(id);
      setReady(true);
    })().catch((err) =>
      setError(getErrorMessage(err, "Failed to load")),
    );
  }, [id, router]);

  if (!ready && !error) {
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
          New question
        </h1>
        <p className={mutedClass}>Add a {type} question to this assessment.</p>
      </div>

      {error ? (
        <p role="alert" className={errorClass}>
          {error}
        </p>
      ) : null}

      {!canWrite ? (
        <p className={mutedClass}>
          Reviewer role — creating questions is not allowed.
        </p>
      ) : (
        <AssessmentQuestionEditor
          mode="add"
          type={type}
          busy={busy}
          onCancel={() => router.push(`/admin/assessments/${id}/builder`)}
          onSave={async (values) => {
            setBusy(true);
            setError(null);
            try {
              const before = await api.getAssessment(id);
              const beforeIds = new Set(
                (before.questions ?? []).map((q) => q.question.id),
              );
              const updated = await api.addQuestion(id, {
                type,
                title: values.title,
                promptDoc: values.promptDoc,
                timeLimitSeconds: values.timeLimitSeconds,
                points: values.points,
                config: values.config,
              });
              if (sectionIdParam) {
                const created =
                  (updated.questions ?? []).find(
                    (q) =>
                      !beforeIds.has(q.question.id) &&
                      q.question.title === values.title,
                  ) ??
                  (updated.questions ?? [])
                    .filter((q) => !beforeIds.has(q.question.id))
                    .sort((a, b) => b.order - a.order)[0];
                if (created && !created.sectionId) {
                  await api.setQuestionSection(
                    id,
                    created.question.id,
                    sectionIdParam,
                  );
                }
              }
              router.push(`/admin/assessments/${id}/builder`);
            } catch (err) {
              setError(getErrorMessage(err, "Save question failed"));
              setBusy(false);
            }
          }}
        />
      )}
    </main>
  );
}
