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
});
