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

/** Convert plain text (possibly multiline) into a TipTap doc. */
export function plainTextToRichDoc(text: string): RichDoc {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  if (lines.length === 1 && !lines[0]) return emptyRichDoc();
  return {
    type: "doc",
    content: lines.map((line) =>
      line
        ? {
            type: "paragraph",
            content: [{ type: "text", text: line }],
          }
        : { type: "paragraph" },
    ),
  };
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

/** Accept TipTap doc or legacy plain string. */
export function coerceRichDoc(input: unknown): RichDoc {
  if (input == null) return emptyRichDoc();
  if (typeof input === "string") return plainTextToRichDoc(input);
  const parsed = richDocSchema.safeParse(input);
  if (parsed.success) return parsed.data;
  return emptyRichDoc();
}
