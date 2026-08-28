import { describe, expect, it } from "vitest";
import {
  coerceRichDoc,
  plainTextToRichDoc,
  richDocToPlainText,
} from "./index.js";

describe("richtext helpers", () => {
  it("round-trips plain text", () => {
    const doc = plainTextToRichDoc("Hello\nWorld");
    expect(richDocToPlainText(doc)).toBe("Hello\nWorld");
  });

  it("coerces strings and docs", () => {
    expect(richDocToPlainText(coerceRichDoc("hi"))).toBe("hi");
    expect(
      richDocToPlainText(
        coerceRichDoc({
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "x" }],
            },
          ],
        }),
      ),
    ).toBe("x");
  });

  it("parses fenced code blocks into TipTap codeBlock nodes", () => {
    const doc = plainTextToRichDoc(
      "Intro\n```php\nfunction priceOrder(): array {\n    // TODO\n}\n```\nOutro",
    );
    expect(doc.content?.map((n) => n.type)).toEqual([
      "paragraph",
      "codeBlock",
      "paragraph",
    ]);
    const block = doc.content?.[1];
    expect(block?.attrs?.language).toBe("php");
    expect(block?.content?.[0]?.text).toBe(
      "function priceOrder(): array {\n    // TODO\n}",
    );
    expect(richDocToPlainText(doc)).toContain("function priceOrder");
  });

  it("parses inline backticks as code marks", () => {
    const doc = plainTextToRichDoc("Use `$fillable` and `User::create()`.");
    const para = doc.content?.[0];
    expect(para?.type).toBe("paragraph");
    const marks = (para?.content ?? [])
      .filter((n) => n.marks?.some((m) => m.type === "code"))
      .map((n) => n.text);
    expect(marks).toEqual(["$fillable", "User::create()"]);
  });

  it("upgrades legacy docs that stored fences as plain paragraphs", () => {
    const legacy = {
      type: "doc" as const,
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Before" }],
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "```php" }],
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "$x = 1;" }],
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "```" }],
        },
      ],
    };
    const upgraded = coerceRichDoc(legacy);
    expect(upgraded.content?.some((n) => n.type === "codeBlock")).toBe(true);
    const block = upgraded.content?.find((n) => n.type === "codeBlock");
    expect(block?.attrs?.language).toBe("php");
    expect(block?.content?.[0]?.text).toContain("$x = 1;");
  });
});
