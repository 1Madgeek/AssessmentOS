"use client";

import { useState } from "react";
import type { AssessmentQuestion } from "@assessment-os/sdk";
import { getErrorMessage } from "@assessment-os/sdk";
import {
  McqRenderer,
  type McqAnswer,
  type McqConfig,
} from "@assessment-os/question-mcq/react";
import {
  CodingRenderer,
  type CodingAnswer,
  type CodingConfig,
  type CodingWorkspace,
} from "@assessment-os/question-coding/react";
import {
  SqlRenderer,
  type SqlAnswer,
  type SqlConfig,
  type SqlWorkspace,
} from "@assessment-os/question-sql/react";
import {
  TextRenderer,
  type TextAnswer,
  type TextConfig,
} from "@assessment-os/question-text/react";
import { RichTextView } from "@assessment-os/richtext/react";
import "@assessment-os/richtext/styles.css";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { errorClass, mutedClass } from "@/lib/styles";

export type AssessmentQuestionPreviewProps = {
  assessmentId: string;
  link: AssessmentQuestion;
  onClose?: () => void;
  showClose?: boolean;
};

export function AssessmentQuestionPreview({
  assessmentId,
  link,
  onClose,
  showClose = true,
}: AssessmentQuestionPreviewProps) {
  const q = link.question;
  const [mcqAnswer, setMcqAnswer] = useState<McqAnswer | null>(null);
  const [codingAnswer, setCodingAnswer] = useState<CodingAnswer | null>(null);
  const [codingWorkspace, setCodingWorkspace] =
    useState<CodingWorkspace | null>(null);
  const [sqlAnswer, setSqlAnswer] = useState<SqlAnswer | null>(null);
  const [sqlWorkspace, setSqlWorkspace] = useState<SqlWorkspace | null>(null);
  const [textAnswer, setTextAnswer] = useState<TextAnswer | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [runBusy, setRunBusy] = useState(false);

  async function runVisible() {
    setRunBusy(true);
    setRunError(null);
    try {
      if (q.type === "coding") {
        const source =
          codingAnswer?.source ??
          codingWorkspace?.source ??
          (q.config as CodingConfig).starterCode;
        const files =
          codingAnswer?.files ?? codingWorkspace?.files ?? undefined;
        const { results } = await api.previewRunQuestion(assessmentId, q.id, {
          source,
          files,
        });
        setCodingWorkspace({
          source,
          files: files ?? {},
          lastVisibleResults: results as CodingWorkspace["lastVisibleResults"],
        });
      } else if (q.type === "sql") {
        const query =
          sqlAnswer?.query ??
          sqlWorkspace?.query ??
          (q.config as SqlConfig).starterQuery ??
          "";
        const { results } = await api.previewRunQuestion(assessmentId, q.id, {
          query,
        });
        setSqlWorkspace({
          query,
          lastVisibleResults: results as SqlWorkspace["lastVisibleResults"],
        });
      }
    } catch (err) {
      setRunError(getErrorMessage(err));
    } finally {
      setRunBusy(false);
    }
  }

  return (
    <Card className="rounded-none border border-border bg-card shadow-none ring-0">
      <CardContent className="grid gap-3 pt-(--card-spacing)">
        <div className="flex items-center justify-between gap-2">
          <strong className="text-sm">Candidate preview</strong>
          {showClose && onClose ? (
            <Button variant="outline" onPress={onClose}>
              Close preview
            </Button>
          ) : null}
        </div>
        {runError ? <p className={errorClass}>{runError}</p> : null}
        {runBusy ? <p className={mutedClass}>Running…</p> : null}
        <RichTextView value={(q.promptDoc ?? q.prompt) as never} />
        {q.type === "mcq" ? (
          <McqRenderer
            config={q.config as unknown as McqConfig}
            answer={mcqAnswer}
            onChange={setMcqAnswer}
          />
        ) : q.type === "coding" ? (
          <CodingRenderer
            config={q.config as unknown as CodingConfig}
            answer={codingAnswer}
            workspace={codingWorkspace}
            onChange={setCodingAnswer}
            onWorkspaceChange={setCodingWorkspace}
            onRunVisible={() => runVisible()}
          />
        ) : q.type === "sql" ? (
          <SqlRenderer
            config={q.config as unknown as SqlConfig}
            answer={sqlAnswer}
            workspace={sqlWorkspace}
            onChange={setSqlAnswer}
            onWorkspaceChange={setSqlWorkspace}
            onRunVisible={() => runVisible()}
          />
        ) : q.type === "text" ? (
          <TextRenderer
            config={q.config as unknown as TextConfig}
            answer={textAnswer}
            onChange={setTextAnswer}
          />
        ) : (
          <p className={mutedClass}>
            Preview is not available for type “{q.type}”.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
