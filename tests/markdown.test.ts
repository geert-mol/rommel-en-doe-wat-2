import { describe, expect, it } from "vitest";
import { parseMarkdownBlocks } from "../src/lib/markdown";

describe("parseMarkdownBlocks", () => {
  it("parses headings and bullet lists", () => {
    expect(
      parseMarkdownBlocks(`## Features
- Add update popup
- Render release markdown
`)
    ).toEqual([
      { type: "heading", level: 2, text: "Features" },
      { type: "list", items: ["Add update popup", "Render release markdown"] }
    ]);
  });

  it("parses paragraphs separated by blank lines", () => {
    expect(
      parseMarkdownBlocks(`Maintenance release.

Includes updater polish.`)
    ).toEqual([
      { type: "paragraph", text: "Maintenance release." },
      { type: "paragraph", text: "Includes updater polish." }
    ]);
  });
});
