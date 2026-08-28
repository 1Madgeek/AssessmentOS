"use client";

import type { TextAnswer, TextConfig } from "./index.js";

export function TextBuilder({
  value,
  onChange,
}: {
  value: TextConfig;
  onChange: (config: TextConfig) => void;
}) {
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <label>
        Grading mode{" "}
        <select
          value={value.gradingMode}
          onChange={(e) =>
            onChange({
              ...value,
              gradingMode: e.target.value as TextConfig["gradingMode"],
            })
          }
        >
          <option value="exact">Exact match</option>
          <option value="contains_any">Contains any accepted phrase</option>
          <option value="contains_all">Contains all accepted phrases</option>
          <option value="manual">Manual review</option>
        </select>
      </label>
      <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          type="checkbox"
          checked={value.caseSensitive}
          onChange={(e) =>
            onChange({ ...value, caseSensitive: e.target.checked })
          }
        />
        Case sensitive
      </label>
      <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          type="checkbox"
          checked={value.normalizeWhitespace}
          onChange={(e) =>
            onChange({ ...value, normalizeWhitespace: e.target.checked })
          }
        />
        Normalize whitespace
      </label>
      <label>
        Max length (optional)
        <input
          type="number"
          min={1}
          value={value.maxLength ?? ""}
          onChange={(e) =>
            onChange({
              ...value,
              maxLength: e.target.value
                ? Number(e.target.value)
                : undefined,
            })
          }
          style={{ width: "100%", padding: 8 }}
        />
      </label>
      {value.gradingMode !== "manual" ? (
        <label>
          Accepted answers (one per line)
          <textarea
            style={{ width: "100%", minHeight: 120, fontFamily: "monospace" }}
            value={(value.acceptedAnswers ?? []).join("\n")}
            onChange={(e) =>
              onChange({
                ...value,
                acceptedAnswers: e.target.value
                  .split("\n")
                  .map((line) => line.trimEnd())
                  .filter((line, i, arr) => line.length > 0 || i < arr.length - 1)
                  .filter((line) => line.length > 0),
              })
            }
          />
        </label>
      ) : (
        <p style={{ margin: 0, fontSize: 13, color: "#656d76" }}>
          Manual mode stores the answer for recruiter review (auto score 0).
        </p>
      )}
    </div>
  );
}

export function TextRenderer({
  config,
  answer,
  readOnly,
  onChange,
}: {
  config: TextConfig;
  answer: TextAnswer | null;
  readOnly?: boolean;
  onChange: (answer: TextAnswer) => void;
}) {
  const text = answer?.text ?? "";
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <textarea
        style={{
          width: "100%",
          minHeight: 160,
          fontFamily: "inherit",
          padding: 12,
          borderRadius: 8,
          border: "1px solid var(--border, #d0d7de)",
          background: "var(--background, #fff)",
          color: "var(--foreground, inherit)",
        }}
        value={text}
        readOnly={readOnly}
        maxLength={config.maxLength}
        onChange={(e) => onChange({ text: e.target.value })}
        placeholder="Type your answer…"
      />
      {config.maxLength != null ? (
        <div
          style={{
            fontSize: 12,
            color: "var(--muted-foreground, #656d76)",
          }}
        >
          {text.length} / {config.maxLength}
        </div>
      ) : null}
    </div>
  );
}

export function TextReviewer({
  answer,
  score,
  maxScore,
  gradeDetails,
}: {
  config: TextConfig;
  answer: TextAnswer | null;
  score: number | null;
  maxScore: number;
  gradeDetails?: Record<string, unknown> | null;
}) {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <p>
        Score: {score ?? 0} / {maxScore}
        {gradeDetails?.needsReview ? " · needs review" : ""}
      </p>
      <pre
        style={{
          background: "var(--muted, #f6f8fa)",
          color: "var(--foreground, inherit)",
          padding: 12,
          borderRadius: 8,
          whiteSpace: "pre-wrap",
          border: "1px solid var(--border, #d0d7de)",
        }}
      >
        {answer?.text ?? "(empty)"}
      </pre>
    </div>
  );
}

export { textPlugin, validateTextConfig, gradeText } from "./index.js";
export type { TextConfig, TextAnswer } from "./index.js";
