import { z } from "zod";

/** TipTap JSON document (ProseMirror doc node). */
export type RichDoc = {
  type: "doc";
  content?: RichNode[];
};

export type RichNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: RichNode[];
  text?: string;
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
};

export const richDocSchema: z.ZodType<RichDoc> = z.object({
  type: z.literal("doc"),
  content: z.array(z.any()).optional(),
});

export function emptyRichDoc(): RichDoc {
  return {
    type: "doc",
    content: [{ type: "paragraph" }],
  };
}

/** Inline `code` spans inside a paragraph line. */
function paragraphFromInline(line: string): RichNode {
  if (!line) return { type: "paragraph" };
  const content: RichNode[] = [];
  const re = /`([^`\n]+)`/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(line)) !== null) {
    if (match.index > last) {
      content.push({ type: "text", text: line.slice(last, match.index) });
    }
    content.push({
      type: "text",
      text: match[1]!,
      marks: [{ type: "code" }],
    });
    last = match.index + match[0].length;
  }
  if (last < line.length) {
    content.push({ type: "text", text: line.slice(last) });
  }
  if (!content.length) {
    content.push({ type: "text", text: line });
  }
  return { type: "paragraph", content };
}

/**
 * Convert plain text into a TipTap doc.
 * Supports a markdown subset used by MCP/agents:
 * - fenced ```lang code blocks
 * - inline `code`
 * Other lines stay one paragraph each (legacy behavior).
 */
export function plainTextToRichDoc(text: string): RichDoc {
  const normalized = text.replace(/\r\n/g, "\n");
  if (!normalized) return emptyRichDoc();

  const lines = normalized.split("\n");
  const content: RichNode[] = [];
  const paraBuf: string[] = [];

  const flushParagraphs = () => {
    while (paraBuf.length) {
      const line = paraBuf.shift()!;
      content.push(paragraphFromInline(line));
    }
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    const open = /^```([a-zA-Z0-9_+-]*)\s*$/.exec(line);
    if (open) {
      flushParagraphs();
      const language = open[1] || undefined;
      i += 1;
      const codeLines: string[] = [];
      while (i < lines.length && !/^```\s*$/.test(lines[i]!)) {
        codeLines.push(lines[i]!);
        i += 1;
      }
      if (i < lines.length && /^```\s*$/.test(lines[i]!)) i += 1;
      const codeText = codeLines.join("\n");
      content.push({
        type: "codeBlock",
        ...(language ? { attrs: { language } } : { attrs: {} }),
        content: codeText ? [{ type: "text", text: codeText }] : [],
      });
      continue;
    }
    paraBuf.push(line);
    i += 1;
  }
  flushParagraphs();

  if (!content.length) return emptyRichDoc();
  return { type: "doc", content };
}

/** Flatten TipTap JSON to plain text (for excerpts / search). */
export function richDocToPlainText(doc: RichDoc | null | undefined): string {
  if (!doc?.content?.length) return "";
  const parts: string[] = [];

  function walk(nodes: RichNode[] | undefined) {
    if (!nodes) return;
    for (const node of nodes) {
      if (node.type === "text" && node.text) {
        parts.push(node.text);
      } else if (node.type === "hardBreak") {
        parts.push("\n");
      } else if (
        node.type === "paragraph" ||
        node.type === "heading" ||
        node.type === "blockquote" ||
        node.type === "listItem" ||
        node.type === "codeBlock"
      ) {
        if (node.type === "codeBlock") {
          const lang =
            typeof node.attrs?.language === "string" ? node.attrs.language : "";
          parts.push("```" + lang + "\n");
          walk(node.content);
          if (!parts[parts.length - 1]?.endsWith("\n")) parts.push("\n");
          parts.push("```\n");
          continue;
        }
        walk(node.content);
        parts.push("\n");
      } else if (node.type === "bulletList" || node.type === "orderedList") {
        walk(node.content);
      } else if (node.type === "image") {
        const alt = typeof node.attrs?.alt === "string" ? node.attrs.alt : "";
        parts.push(alt ? `[image: ${alt}]` : "[image]");
      } else {
        walk(node.content);
      }
    }
  }

  walk(doc.content);
  return parts.join("").replace(/\n+$/, "").trim();
}

/** True when a stored TipTap doc still has markdown fences as plain paragraph text. */
function docHasUnparsedMarkdownFences(doc: RichDoc): boolean {
  if (!doc.content?.length) return false;
  let hasCodeBlockNode = false;
  let hasFenceText = false;

  function walk(nodes: RichNode[] | undefined) {
    if (!nodes) return;
    for (const node of nodes) {
      if (node.type === "codeBlock") hasCodeBlockNode = true;
      if (node.type === "text" && node.text && /```/.test(node.text)) {
        hasFenceText = true;
      }
      walk(node.content);
    }
  }

  walk(doc.content);
  return hasFenceText && !hasCodeBlockNode;
}

/** Accept TipTap doc or legacy plain string. */
export function coerceRichDoc(input: unknown): RichDoc {
  if (input == null) return emptyRichDoc();
  if (typeof input === "string") return plainTextToRichDoc(input);
  const parsed = richDocSchema.safeParse(input);
  if (!parsed.success) return emptyRichDoc();
  // Upgrade MCP/API docs that stored ``` fences as plain paragraphs.
  if (docHasUnparsedMarkdownFences(parsed.data)) {
    return plainTextToRichDoc(richDocToPlainText(parsed.data));
  }
  return parsed.data;
}
