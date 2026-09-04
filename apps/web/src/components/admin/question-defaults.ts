import type { McqConfig } from "@assessment-os/question-mcq/react";
import type { CodingConfig } from "@assessment-os/question-coding/react";
import type { SqlConfig } from "@assessment-os/question-sql/react";
import type { TextConfig } from "@assessment-os/question-text/react";
import type { VideoConfig } from "@assessment-os/question-video/react";

export type QuestionType = "mcq" | "coding" | "sql" | "text" | "video";

export const QUESTION_TYPES: QuestionType[] = [
  "mcq",
  "coding",
  "sql",
  "text",
  "video",
];

export function isQuestionType(value: string): value is QuestionType {
  return (QUESTION_TYPES as string[]).includes(value);
}

export const selectClass =
  "h-8 min-w-[11.25rem] rounded-none border border-input bg-transparent px-2.5 text-xs outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30";

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
  starterCode: "print(\'hello\')\n",
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
    "INSERT INTO employees VALUES (1, \'Ada\', \'Eng\'), (2, \'Bob\', \'Sales\');\n",
  starterQuery: "SELECT name FROM employees WHERE dept = \'Eng\';\n",
  visibleTests: [
    { id: "v1", label: "Eng names", expectedRows: [{ name: "Ada" }] },
  ],
  hiddenTests: [],
};

export const defaultText: TextConfig = {
  gradingMode: "exact",
  acceptedAnswers: ["HTTP"],
  caseSensitive: false,
  normalizeWhitespace: true,
};

export const defaultVideo: VideoConfig = {
  maxDurationSeconds: 120,
  maxBytes: 50_000_000,
  allowUpload: true,
};

export function defaultConfigForType(
  type: QuestionType,
): Record<string, unknown> {
  if (type === "mcq") return defaultMcq as unknown as Record<string, unknown>;
  if (type === "coding")
    return defaultCoding as unknown as Record<string, unknown>;
  if (type === "sql") return defaultSql as unknown as Record<string, unknown>;
  if (type === "video")
    return defaultVideo as unknown as Record<string, unknown>;
  return defaultText as unknown as Record<string, unknown>;
}
