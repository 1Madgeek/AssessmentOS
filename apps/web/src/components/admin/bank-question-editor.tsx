"use client";

import { useState } from "react";
import type { BankQuestion } from "@assessment-os/sdk";
import { getErrorMessage } from "@assessment-os/sdk";
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
  richDocToPlainText,
} from "@assessment-os/richtext";
import "@assessment-os/richtext/styles.css";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  StatusBadge,
  type StatusBadgeTone,
  filterSelectClass,
} from "@/components/ui/status-badge";
import { errorClass, mutedClass } from "@/lib/styles";

export type BankType = "mcq" | "coding" | "sql" | "text" | "video";

export const TYPE_LABELS: Record<BankType, string> = {
  mcq: "MCQ",
  coding: "Coding",
  sql: "SQL",
  text: "Short answer",
  video: "Video",
};

export function bankTypeTone(type: BankType): StatusBadgeTone {
  switch (type) {
    case "coding":
      return "success";
    case "sql":
      return "warning";
    case "text":
      return "muted";
    case "video":
      return "muted";
    default:
      return "neutral";
  }
}

export const defaultMcq: McqConfig = {
  multiSelect: false,
  options: [
    { id: "a", label: "Option A" },
    { id: "b", label: "Option B" },
  ],
  correctOptionIds: ["a"],
};

export const defaultCoding: CodingConfig = {
  language: "python",
  mode: "io",
  starterCode: "print('hello')\n",
  starterFiles: [],
  visibleTests: [
    { id: "v1", stdin: "", expectedStdout: "hello\n", label: "Example" },
  ],
  hiddenTests: [],
  visibleTestCode: "",
  hiddenTestCode: "",
  scoring: "proportional",
  timeLimitMs: 15000,
  memoryMb: 256,
};

export const defaultSql: SqlConfig = {
  dialect: "sqlite",
  schemaSql: "CREATE TABLE employees (id INTEGER, name TEXT, dept TEXT);\n",
  seedSql:
    "INSERT INTO employees VALUES (1, 'Ada', 'Eng'), (2, 'Bob', 'Sales');\n",
  starterQuery: "SELECT name FROM employees WHERE dept = 'Eng';\n",
  visibleTests: [
    { id: "v1", label: "Eng names", expectedRows: [{ name: "Ada" }] },
  ],
  hiddenTests: [],
};

export const defaultText: TextConfig = {
  gradingMode: "exact",
  acceptedAnswers: ["answer"],
  caseSensitive: false,
  normalizeWhitespace: true,
};

export const defaultVideo: VideoConfig = {
  maxDurationSeconds: 120,
  maxBytes: 50_000_000,
  allowUpload: true,
};

export function defaultTimeLimit(type: BankType): number {
  if (type === "coding") return 900;
  if (type === "sql") return 600;
  if (type === "video") return 300;
  return 120;
}

export function parseBankType(value: string | null | undefined): BankType {
  if (
    value === "mcq" ||
    value === "coding" ||
    value === "sql" ||
    value === "text" ||
    value === "video"
  ) {
    return value;
  }
  return "mcq";
}

export function configSummary(item: BankQuestion): string {
  const cfg = item.config as Record<string, unknown>;
  if (item.type === "coding") {
    const lang = String(cfg.language ?? "?");
    const mode = String(cfg.mode ?? "io");
    return `${lang} · ${mode}`;
  }
  if (item.type === "mcq") {
    const opts = Array.isArray(cfg.options) ? cfg.options.length : 0;
    return `${opts} options`;
  }
  if (item.type === "sql") {
    return String(cfg.dialect ?? "sqlite");
  }
  if (item.type === "text") {
    return String(cfg.gradingMode ?? "exact");
  }
  if (item.type === "video") {
    const secs = Number(cfg.maxDurationSeconds ?? 120);
    return `max ${secs}s`;
  }
  return "";
}

type BankQuestionEditorProps = {
  mode: "create" | "edit";
  type: BankType;
  initial?: BankQuestion | null;
  canWrite: boolean;
  onCancel: () => void;
  onSaved: (question: BankQuestion) => void;
  /** When true (create), show an intentional type picker that remounts config defaults. */
  allowTypeChange?: boolean;
  onTypeChange?: (type: BankType) => void;
};

export function BankQuestionEditor({
  mode,
  type,
  initial = null,
  canWrite,
  onCancel,
  onSaved,
  allowTypeChange = false,
  onTypeChange,
}: BankQuestionEditorProps) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [promptDoc, setPromptDoc] = useState<RichDoc>(
    initial
      ? coerceRichDoc(initial.promptDoc ?? initial.prompt)
      : emptyRichDoc(),
  );
  const [tags, setTags] = useState((initial?.tags ?? []).join(", "));
  const [points, setPoints] = useState(initial?.points ?? 10);
  const [timeLimit, setTimeLimit] = useState(
    initial?.timeLimitSeconds ?? defaultTimeLimit(type),
  );
  const [mcqConfig, setMcqConfig] = useState<McqConfig>(
    type === "mcq" && initial
      ? (initial.config as unknown as McqConfig)
      : defaultMcq,
  );
  const [codingConfig, setCodingConfig] = useState<CodingConfig>(
    type === "coding" && initial
      ? (initial.config as unknown as CodingConfig)
      : defaultCoding,
  );
  const [sqlConfig, setSqlConfig] = useState<SqlConfig>(
    type === "sql" && initial
      ? (initial.config as unknown as SqlConfig)
      : defaultSql,
  );
  const [textConfig, setTextConfig] = useState<TextConfig>(
    type === "text" && initial
      ? (initial.config as unknown as TextConfig)
      : defaultText,
  );
  const [videoConfig, setVideoConfig] = useState<VideoConfig>(
    type === "video" && initial
      ? (initial.config as unknown as VideoConfig)
      : defaultVideo,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function currentConfig(): Record<string, unknown> {
    if (type === "mcq") return mcqConfig as unknown as Record<string, unknown>;
    if (type === "coding")
      return codingConfig as unknown as Record<string, unknown>;
    if (type === "sql") return sqlConfig as unknown as Record<string, unknown>;
    if (type === "video")
      return videoConfig as unknown as Record<string, unknown>;
    return textConfig as unknown as Record<string, unknown>;
  }

  async function save() {
    if (!title.trim() || !canWrite) return;
    if (mode === "edit" && !initial?.id) return;
    setBusy(true);
    setError(null);
    try {
      const tagList = tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      const prompt = richDocToPlainText(promptDoc) || title.trim();
      const body = {
        title: title.trim(),
        prompt,
        promptDoc: promptDoc as unknown as Record<string, unknown>,
        timeLimitSeconds: timeLimit,
        points,
        config: currentConfig(),
        tags: tagList,
      };
      const saved =
        mode === "create"
          ? await api.createBankQuestion({ type, ...body })
          : await api.updateBankQuestion(initial!.id, body);
      onSaved(saved);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (!canWrite) {
    return (
      <p className={mutedClass}>
        Reviewer role — bank write actions are hidden.
      </p>
    );
  }

  return (
    <div className="grid gap-6">
      {allowTypeChange && onTypeChange ? (
        <Card>
          <CardHeader>
            <CardTitle className="font-heading text-base font-medium">
              Question type
            </CardTitle>
            <CardDescription>
              Choose the template type before filling in the prompt and scoring.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid max-w-sm gap-2">
              <Label htmlFor="bank-type">Type</Label>
              <select
                id="bank-type"
                className={filterSelectClass}
                value={type}
                onChange={(e) => onTypeChange(parseBankType(e.target.value))}
              >
                {(Object.keys(TYPE_LABELS) as BankType[]).map((t) => (
                  <option key={t} value={t}>
                    {TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <div className="grid gap-1">
            <CardTitle className="font-heading text-base font-medium">
              {mode === "edit" ? "Template details" : "New template"}
            </CardTitle>
            <CardDescription>
              Title, prompt, scoring, and type-specific configuration.
            </CardDescription>
          </div>
          <StatusBadge tone={bankTypeTone(type)}>
            {TYPE_LABELS[type]}
          </StatusBadge>
        </CardHeader>
        <CardContent className="grid gap-4">
          {error ? (
            <p role="alert" className={errorClass}>
              {error}
            </p>
          ) : null}
          <div className="grid gap-2">
            <Label htmlFor="bank-title">Title</Label>
            <Input
              id="bank-title"
              placeholder="Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label>Prompt</Label>
            <RichTextEditor
              value={promptDoc}
              onChange={setPromptDoc}
              onUploadImage={async (file) => {
                const uploaded = await api.uploadAsset(file, file.name);
                return uploaded.url;
              }}
            />
          </div>
          <div className="flex flex-wrap gap-3">
            <Label className="flex items-center gap-2 text-sm font-normal">
              Points
              <Input
                type="number"
                min={1}
                className="w-20"
                value={points}
                onChange={(e) => setPoints(Number(e.target.value))}
              />
            </Label>
            <Label className="flex items-center gap-2 text-sm font-normal">
              Time (s)
              <Input
                type="number"
                min={30}
                className="w-24"
                value={timeLimit}
                onChange={(e) => setTimeLimit(Number(e.target.value))}
              />
            </Label>
            <Label className="flex min-w-[11.25rem] flex-1 items-center gap-2 text-sm font-normal">
              Tags
              <Input
                className="flex-1"
                placeholder="comma-separated"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
              />
            </Label>
          </div>

          {type === "mcq" ? (
            <McqBuilder value={mcqConfig} onChange={setMcqConfig} />
          ) : type === "coding" ? (
            <CodingBuilder value={codingConfig} onChange={setCodingConfig} />
          ) : type === "sql" ? (
            <SqlBuilder value={sqlConfig} onChange={setSqlConfig} />
          ) : type === "text" ? (
            <TextBuilder value={textConfig} onChange={setTextConfig} />
          ) : (
            <VideoBuilder value={videoConfig} onChange={setVideoConfig} />
          )}

          <div className="flex gap-2">
            <Button
              isDisabled={busy || !title.trim()}
              onPress={() => void save()}
            >
              {mode === "edit" ? "Save template" : "Add to bank"}
            </Button>
            <Button variant="outline" onPress={onCancel}>
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
