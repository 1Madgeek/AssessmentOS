"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { Assessment, AssessmentQuestion, OrgRole } from "@assessment-os/sdk";
import { getErrorMessage } from "@assessment-os/sdk";
import { api, getActiveOrgId, setActiveOrgId } from "@/lib/api";
import {
  AssessmentQuestionEditor,
  type AssessmentQuestionEditorValues,
} from "@/components/admin/assessment-question-editor";
import {
  isQuestionType,
  type QuestionType,
} from "@/components/admin/question-defaults";
import { errorClass, mutedClass, pageClass } from "@/lib/styles";

export default function EditAssessmentQuestionPage() {
  const { id, questionId } = useParams<{ id: string; questionId: string }>();
  const router = useRouter();
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [link, setLink] = useState<AssessmentQuestion | null>(null);
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
      const a = await api.getAssessment(id);
      setAssessment(a);
      const found =
        (a.questions ?? []).find((q) => q.question.id === questionId) ?? null;
      setLink(found);
      if (!found) {
        setError("Question not found on this assessment.");
      }
    })().catch((err) =>
      setError(getErrorMessage(err, "Failed to load")),
    );
  }, [id, questionId, router]);

  if (!assessment && !error) {
    return (
      <main className={pageClass}>
        <p className={mutedClass}>Loading…</p>
      </main>
    );
  }

  const q = link?.question;
  const type: QuestionType | null =
    q && isQuestionType(q.type) ? q.type : null;

  return (
    <main className={pageClass}>
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          {canWrite ? "Edit question" : "View question"}
        </h1>
        <p className={mutedClass}>
          {q?.title ?? assessment?.title ?? "Assessment question"}
        </p>
      </div>

      {error ? (
        <p role="alert" className={errorClass}>
          {error}
        </p>
      ) : null}

      {!canWrite ? (
        <p className={mutedClass}>
          Reviewer role — editing questions is not allowed.
        </p>
      ) : q && type ? (
        <AssessmentQuestionEditor
          mode="edit"
          type={type}
          busy={busy}
          initial={{
            title: q.title,
            prompt: q.prompt,
            promptDoc: q.promptDoc as
              | AssessmentQuestionEditorValues["promptDoc"]
              | undefined,
            points: q.points,
            timeLimitSeconds: q.timeLimitSeconds,
            config: q.config,
          }}
          onCancel={() => router.push(`/admin/assessments/${id}/builder`)}
          onSave={async (values) => {
            setBusy(true);
            setError(null);
            try {
              await api.updateQuestion(id, questionId, {
                title: values.title,
                promptDoc: values.promptDoc,
                timeLimitSeconds: values.timeLimitSeconds,
                points: values.points,
                config: values.config,
              });
              router.push(`/admin/assessments/${id}/builder`);
            } catch (err) {
              setError(getErrorMessage(err, "Save question failed"));
              setBusy(false);
            }
          }}
        />
      ) : q && !type ? (
        <p className={errorClass}>
          Editing “{q.type}” questions is not supported yet.
        </p>
      ) : null}
    </main>
  );
}
