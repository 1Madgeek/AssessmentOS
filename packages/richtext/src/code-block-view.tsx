"use client";

import CodeBlock from "@tiptap/extension-code-block";
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";

const LANGUAGES: Array<{ value: string; label: string }> = [
  { value: "", label: "Plain text" },
  { value: "php", label: "PHP" },
  { value: "javascript", label: "JavaScript" },
  { value: "typescript", label: "TypeScript" },
  { value: "python", label: "Python" },
  { value: "java", label: "Java" },
  { value: "sql", label: "SQL" },
  { value: "bash", label: "Bash" },
  { value: "json", label: "JSON" },
  { value: "html", label: "HTML" },
  { value: "css", label: "CSS" },
  { value: "go", label: "Go" },
  { value: "rust", label: "Rust" },
  { value: "csharp", label: "C#" },
  { value: "cpp", label: "C++" },
];

function languageLabel(value: string | null | undefined): string {
  const key = (value ?? "").toLowerCase();
  const found = LANGUAGES.find((l) => l.value === key);
  if (found) return found.label;
  if (!key) return "Code";
  return key.toUpperCase();
}

function CodeBlockNodeView({
  node,
  updateAttributes,
  editor,
}: NodeViewProps) {
  const language = (node.attrs.language as string | null) ?? "";
  const editable = editor.isEditable;

  return (
    <NodeViewWrapper className="aos-codeblock" data-language={language || "text"}>
      <div className="aos-codeblock-header" contentEditable={false}>
        <span className="aos-codeblock-icon" aria-hidden>
          {"</>"}
        </span>
        {editable ? (
          <select
            className="aos-codeblock-lang"
            value={language}
            onChange={(e) =>
              updateAttributes({ language: e.target.value || null })
            }
          >
            {LANGUAGES.map((l) => (
              <option key={l.value || "plain"} value={l.value}>
                {l.label}
              </option>
            ))}
            {language &&
            !LANGUAGES.some((l) => l.value === language.toLowerCase()) ? (
              <option value={language}>{languageLabel(language)}</option>
            ) : null}
          </select>
        ) : (
          <span className="aos-codeblock-lang-label">
            {languageLabel(language)}
          </span>
        )}
      </div>
      <pre className="aos-codeblock-pre">
        <NodeViewContent as="code" className="aos-codeblock-code" />
      </pre>
    </NodeViewWrapper>
  );
}

/** Code block with language chrome (matches admin/candidate preview widget). */
export const AosCodeBlock = CodeBlock.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockNodeView);
  },
}).configure({
  languageClassPrefix: "language-",
});
