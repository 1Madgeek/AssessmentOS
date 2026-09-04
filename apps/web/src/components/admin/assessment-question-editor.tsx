"use client";

import { useEffect, useState } from "react";
import {
  McqBuilder,
  type McqConfig,
} from "@assessment-os/question-mcq/react";
import {
  CodingBuilder,
  type CodingConfig,
} from "@assessment-os/question-coding/react";
import {
  SqlBuilder,
  type SqlConfig,
} from "@assessment-os/question-sql/react";
import {
  TextBuilder,
  type TextConfig,
} from "@assessment-os/question-text/react";
import {
  VideoBuilder,
  type VideoConfig,
} from "@assessment-os/question-video/react";
import { RichTextEditor } from "@assessment-os/richtext/react";
import {
  type RichDoc,
  coerceRichDoc,
  emptyRichDoc,
} from "@assessment-os/richtext";
import "@assessment-os/richtext/styles.css";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  defaultCoding,
  defaultMcq,
  defaultSql,
  defaultText,
  defaultVideo,
  type QuestionType,
} from "@/components/admin/question-defaults";

export type AssessmentQuestionEditorValues = {
  title: string;
  promptDoc: RichDoc;
  points: number;
  timeLimitSeconds: number;
  config: Record<string, unknown>;
};

export type AssessmentQuestionEditorProps = {
  mode: "add" | "edit";
  type: QuestionType;
  initial?: Partial<AssessmentQuestionEditorValues> & {
    prompt?: string;
    promptDoc?: RichDoc | Record<string, unknown> | null;
    config?: Record<string, unknown>;
  };
  busy?: boolean;
  /** When false, hide Save/Cancel and stream values via onChange (builder page Save). Default true. */
  showActions?: boolean;
  onChange?: (values: AssessmentQuestionEditorValues) => void;
  onSave?: (values: AssessmentQuestionEditorValues) => void | Promise<void>;
  onCancel?: () => void;
};

function configForType(
  type: QuestionType,
  mcq: McqConfig,
  coding: CodingConfig,
  sql: SqlConfig,
  text: TextConfig,
  video: VideoConfig,
): Record<string, unknown> {
  if (type === "mcq") return mcq as unknown as Record<string, unknown>;
  if (type === "coding") return coding as unknown as Record<string, unknown>;
  if (type === "sql") return sql as unknown as Record<string, unknown>;
  if (type === "video") return video as unknown as Record<string, unknown>;
  return text as unknown as Record<string, unknown>;
}

export function AssessmentQuestionEditor({
  mode,
  type,
  initial,
  busy = false,
  showActions = true,
  onChange,
  onSave,
  onCancel,
}: AssessmentQuestionEditorProps) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [promptDoc, setPromptDoc] = useState<RichDoc>(() =>
    coerceRichDoc(initial?.promptDoc ?? initial?.prompt ?? emptyRichDoc()),
  );
  const [points, setPoints] = useState(initial?.points ?? 10);
  const [timeLimitSeconds, setTimeLimitSeconds] = useState(
    initial?.timeLimitSeconds ?? 300,
  );
  const [mcqConfig, setMcqConfig] = useState<McqConfig>(() =>
    type === "mcq" && initial?.config
      ? (initial.config as unknown as McqConfig)
      : defaultMcq,
  );
  const [codingConfig, setCodingConfig] = useState<CodingConfig>(() =>
    type === "coding" && initial?.config
      ? (initial.config as unknown as CodingConfig)
      : defaultCoding,
  );
  const [sqlConfig, setSqlConfig] = useState<SqlConfig>(() =>
    type === "sql" && initial?.config
      ? (initial.config as unknown as SqlConfig)
      : defaultSql,
  );
  const [textConfig, setTextConfig] = useState<TextConfig>(() =>
    type === "text" && initial?.config
      ? (initial.config as unknown as TextConfig)
      : defaultText,
  );
  const [videoConfig, setVideoConfig] = useState<VideoConfig>(() =>
    type === "video" && initial?.config
      ? (initial.config as unknown as VideoConfig)
      : defaultVideo,
  );

  function emit(
    next: Partial<{
      title: string;
      promptDoc: RichDoc;
      points: number;
      timeLimitSeconds: number;
      mcq: McqConfig;
      coding: CodingConfig;
      sql: SqlConfig;
      text: TextConfig;
      video: VideoConfig;
    }> = {},
  ) {
    if (!onChange) return;
    const t = next.title ?? title;
    const doc = next.promptDoc ?? promptDoc;
    const pts = next.points ?? points;
    const time = next.timeLimitSeconds ?? timeLimitSeconds;
    const mcq = next.mcq ?? mcqConfig;
    const coding = next.coding ?? codingConfig;
    const sql = next.sql ?? sqlConfig;
    const text = next.text ?? textConfig;
    const video = next.video ?? videoConfig;
    onChange({
      title: t.trim() ? t : t,
      promptDoc: doc,
      points: pts,
      timeLimitSeconds: time,
      config: configForType(type, mcq, coding, sql, text, video),
    });
  }

  useEffect(() => {
    emit();
    // Seed parent draft once on mount when using continuous onChange.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Card size="sm" className="ring-foreground/10">
      <CardHeader>
        <CardTitle>
          {mode === "edit" ? "Edit" : "New"} {type} question
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        <Input
          placeholder="Title"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            emit({ title: e.target.value });
          }}
        />
        <RichTextEditor
          value={promptDoc}
          onChange={(doc) => {
            setPromptDoc(doc);
            emit({ promptDoc: doc });
          }}
          onUploadImage={async (file) => {
            const uploaded = await api.uploadAsset(file, file.name);
            return uploaded.url;
          }}
        />
        <div className="flex flex-wrap gap-4">
          <Label className="font-normal">
            Points{" "}
            <Input
              type="number"
              className="inline-block w-20"
              value={points}
              onChange={(e) => {
                const next = Number(e.target.value);
                setPoints(next);
                emit({ points: next });
              }}
            />
          </Label>
          <Label className="font-normal">
            Time (s){" "}
            <Input
              type="number"
              className="inline-block w-24"
              value={timeLimitSeconds}
              onChange={(e) => {
                const next = Number(e.target.value);
                setTimeLimitSeconds(next);
                emit({ timeLimitSeconds: next });
              }}
            />
          </Label>
        </div>
        {type === "mcq" ? (
          <McqBuilder
            value={mcqConfig}
            onChange={(cfg) => {
              setMcqConfig(cfg);
              emit({ mcq: cfg });
            }}
          />
        ) : type === "coding" ? (
          <CodingBuilder
            value={codingConfig}
            onChange={(cfg) => {
              setCodingConfig(cfg);
              emit({ coding: cfg });
            }}
          />
        ) : type === "sql" ? (
          <SqlBuilder
            value={sqlConfig}
            onChange={(cfg) => {
              setSqlConfig(cfg);
              emit({ sql: cfg });
            }}
          />
        ) : type === "text" ? (
          <TextBuilder
            value={textConfig}
            onChange={(cfg) => {
              setTextConfig(cfg);
              emit({ text: cfg });
            }}
          />
        ) : (
          <VideoBuilder
            value={videoConfig}
            onChange={(cfg) => {
              setVideoConfig(cfg);
              emit({ video: cfg });
            }}
          />
        )}
        {showActions ? (
          <div className="flex gap-2">
            <Button
              isDisabled={busy || !title.trim()}
              onPress={() =>
                void onSave?.({
                  title: title.trim(),
                  promptDoc,
                  points,
                  timeLimitSeconds,
                  config: configForType(
                    type,
                    mcqConfig,
                    codingConfig,
                    sqlConfig,
                    textConfig,
                    videoConfig,
                  ),
                })
              }
            >
              {mode === "edit" ? "Save changes" : "Save question"}
            </Button>
            {onCancel ? (
              <Button variant="outline" isDisabled={busy} onPress={onCancel}>
                Cancel
              </Button>
            ) : null}
          </div>
        ) : onCancel ? (
          <div className="flex gap-2">
            <Button variant="outline" isDisabled={busy} onPress={onCancel}>
              Close
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
