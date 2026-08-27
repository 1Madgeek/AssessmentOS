"use client";

import { useMemo } from "react";
import { RichTextEditor, RichTextView } from "@assessment-os/richtext/react";
import {
  coerceRichDoc,
  plainTextToRichDoc,
  type RichDoc,
} from "@assessment-os/richtext";
import type { McqAnswer, McqConfig } from "./index.js";

function labelToDoc(
  label: McqConfig["options"][number]["label"],
): RichDoc {
  if (typeof label === "string") return plainTextToRichDoc(label);
  return coerceRichDoc(label);
}

export function McqBuilder({
  value,
  onChange,
}: {
  value: McqConfig;
  onChange: (config: McqConfig) => void;
}) {
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          type="checkbox"
          checked={value.multiSelect}
          onChange={(e) =>
            onChange({
              ...value,
              multiSelect: e.target.checked,
              correctOptionIds: e.target.checked
                ? value.correctOptionIds
                : value.correctOptionIds.slice(0, 1),
            })
          }
        />
        Allow multiple correct answers
      </label>
      {value.options.map((opt, i) => (
        <div
          key={opt.id}
          style={{
            display: "grid",
            gridTemplateColumns: "auto 1fr auto",
            gap: 8,
            alignItems: "start",
          }}
        >
          <input
            type={value.multiSelect ? "checkbox" : "radio"}
            name="correct"
            checked={value.correctOptionIds.includes(opt.id)}
            onChange={() => {
              if (value.multiSelect) {
                const set = new Set(value.correctOptionIds);
                if (set.has(opt.id)) set.delete(opt.id);
                else set.add(opt.id);
                onChange({ ...value, correctOptionIds: [...set] });
              } else {
                onChange({ ...value, correctOptionIds: [opt.id] });
              }
            }}
            style={{ marginTop: 12 }}
          />
          <RichTextEditor
            value={labelToDoc(opt.label)}
            onChange={(doc) => {
              const options = value.options.map((o, idx) =>
                idx === i ? { ...o, label: doc } : o,
              );
              onChange({ ...value, options });
            }}
            placeholder={`Option ${i + 1}`}
          />
          <button
            type="button"
            disabled={value.options.length <= 2}
            onClick={() => {
              const options = value.options.filter((_, idx) => idx !== i);
              onChange({
                ...value,
                options,
                correctOptionIds: value.correctOptionIds.filter(
                  (id) => id !== opt.id,
                ),
              });
            }}
            style={{ marginTop: 8 }}
          >
            Remove
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() =>
          onChange({
            ...value,
            options: [
              ...value.options,
              {
                id: crypto.randomUUID(),
                label: plainTextToRichDoc(
                  `Option ${value.options.length + 1}`,
                ),
              },
            ],
          })
        }
      >
        Add option
      </button>
    </div>
  );
}

export function McqRenderer({
  config,
  answer,
  readOnly,
  onChange,
}: {
  config: McqConfig;
  answer: McqAnswer | null;
  readOnly?: boolean;
  onChange: (answer: McqAnswer) => void;
}) {
  const selected = useMemo(() => new Set(answer?.selected ?? []), [answer]);

  return (
    <div style={{ display: "grid", gap: 10 }}>
      {config.options.map((opt) => (
        <label
          key={opt.id}
          style={{
            display: "flex",
            gap: 10,
            alignItems: "flex-start",
            padding: "10px 12px",
            border: "1px solid #d0d7de",
            borderRadius: 8,
            background: selected.has(opt.id) ? "#eef6ff" : "#fff",
          }}
        >
          <input
            type={config.multiSelect ? "checkbox" : "radio"}
            name="mcq"
            disabled={readOnly}
            checked={selected.has(opt.id)}
            onChange={() => {
              if (readOnly) return;
              if (config.multiSelect) {
                const next = new Set(selected);
                if (next.has(opt.id)) next.delete(opt.id);
                else next.add(opt.id);
                onChange({ selected: [...next] });
              } else {
                onChange({ selected: [opt.id] });
              }
            }}
            style={{ marginTop: 4 }}
          />
          <RichTextView value={labelToDoc(opt.label)} />
        </label>
      ))}
    </div>
  );
}

export function McqReviewer({
  config,
  answer,
  score,
  maxScore,
}: {
  config: McqConfig;
  answer: McqAnswer | null;
  score: number | null;
  maxScore: number;
}) {
  const selected = new Set(answer?.selected ?? []);
  const correct = new Set(config.correctOptionIds);
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <p>
        Score: {score ?? 0} / {maxScore}
      </p>
      {config.options.map((opt) => {
        const isCorrect = correct.has(opt.id);
        const wasSelected = selected.has(opt.id);
        return (
          <div
            key={opt.id}
            style={{
              padding: 8,
              borderRadius: 6,
              background: isCorrect
                ? "#e6ffed"
                : wasSelected
                  ? "#ffebe9"
                  : "#f6f8fa",
            }}
          >
            <RichTextView value={labelToDoc(opt.label)} />
            <span style={{ fontSize: 13, color: "#57606a" }}>
              {isCorrect ? " ✓ correct" : ""}
              {wasSelected && !isCorrect ? " ✗ selected" : ""}
              {wasSelected && isCorrect ? " (selected)" : ""}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export { mcqPlugin, validateMcqConfig, gradeMcq } from "./index.js";
export type { McqConfig, McqAnswer } from "./index.js";
