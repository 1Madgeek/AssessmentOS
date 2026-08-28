"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import { useEffect } from "react";
import type { RichDoc } from "./index.js";
import { coerceRichDoc, emptyRichDoc } from "./index.js";
import { AosCodeBlock } from "./code-block-view.js";

const extensions = [
  StarterKit.configure({
    codeBlock: false,
    heading: { levels: [2, 3] },
  }),
  AosCodeBlock,
  Image.configure({
    inline: false,
    allowBase64: false,
  }),
  Placeholder.configure({
    placeholder: "Write the question prompt…",
  }),
];

export function RichTextView({
  value,
  className,
}: {
  value: RichDoc | string | null | undefined;
  className?: string;
}) {
  const doc = coerceRichDoc(value);
  const editor = useEditor({
    extensions,
    content: doc,
    editable: false,
    editorProps: {
      attributes: {
        class: `aos-richtext aos-richtext-view${className ? ` ${className}` : ""}`,
      },
    },
  });

  useEffect(() => {
    if (!editor) return;
    const next = coerceRichDoc(value);
    const current = JSON.stringify(editor.getJSON());
    if (current !== JSON.stringify(next)) {
      editor.commands.setContent(next);
    }
  }, [editor, value]);

  return <EditorContent editor={editor} />;
}

export function RichTextEditor({
  value,
  onChange,
  onUploadImage,
  placeholder,
}: {
  value: RichDoc | string | null | undefined;
  onChange: (doc: RichDoc) => void;
  onUploadImage?: (file: File) => Promise<string>;
  placeholder?: string;
}) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false,
        heading: { levels: [2, 3] },
      }),
      AosCodeBlock,
      Image.configure({
        inline: false,
        allowBase64: false,
      }),
      Placeholder.configure({
        placeholder: placeholder ?? "Write the question prompt…",
      }),
    ],
    content: coerceRichDoc(value) ?? emptyRichDoc(),
    editable: true,
    onUpdate: ({ editor: ed }) => {
      onChange(ed.getJSON() as RichDoc);
    },
    editorProps: {
      attributes: {
        class: "aos-richtext aos-richtext-editor",
      },
    },
  });

  useEffect(() => {
    if (!editor) return;
    const next = coerceRichDoc(value);
    const current = JSON.stringify(editor.getJSON());
    if (current !== JSON.stringify(next)) {
      editor.commands.setContent(next, false);
    }
  }, [editor, value]);

  async function addImage() {
    if (!editor || !onUploadImage) return;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const url = await onUploadImage(file);
      editor.chain().focus().setImage({ src: url, alt: file.name }).run();
    };
    input.click();
  }

  if (!editor) return null;

  return (
    <div className="aos-richtext-shell">
      <div className="aos-richtext-toolbar" role="toolbar">
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBold().run()}
          data-active={editor.isActive("bold") || undefined}
        >
          Bold
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          data-active={editor.isActive("italic") || undefined}
        >
          Italic
        </button>
        <button
          type="button"
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 2 }).run()
          }
          data-active={editor.isActive("heading", { level: 2 }) || undefined}
        >
          H2
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          data-active={editor.isActive("bulletList") || undefined}
        >
          List
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          data-active={editor.isActive("blockquote") || undefined}
        >
          Quote
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleCode().run()}
          data-active={editor.isActive("code") || undefined}
          title="Inline code"
        >
          Inline code
        </button>
        <button
          type="button"
          onClick={() =>
            editor
              .chain()
              .focus()
              .toggleCodeBlock({ language: "php" })
              .run()
          }
          data-active={editor.isActive("codeBlock") || undefined}
          title="Code block"
        >
          Code block
        </button>
        {onUploadImage ? (
          <button type="button" onClick={() => void addImage()}>
            Image
          </button>
        ) : null}
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
