import { describe, expect, it } from "vitest";

import { createCitationFormatTool, createDocOcrImageTool, createDocParsePdfTool } from "../../src/tools/docs.js";

describe("docs tools", () => {
  it("parses pdf pages via adapter and enforces max_pages", async () => {
    const adapter = {
      parse: async () => ({
        pages: [
          { page_no: 1, text: "Page one" },
          { page_no: 2, text: "Page two" },
        ],
      }),
    };
    const tool = createDocParsePdfTool(adapter, { defaultMaxPages: 1 });
    const result = await tool.run(
      { path: "/tmp/sample.pdf" },
      { metadata: undefined, signal: undefined }
    );
    expect((result as { pages: Array<{ page_no: number; text: string }> }).pages).toEqual([
      { page_no: 1, text: "Page one", tables: undefined, figures: undefined },
    ]);
  });

  it("runs ocr image adapter and validates image size", async () => {
    const adapter = {
      ocr: async () => ({
        text: "Detected text",
        page_no: 1,
      }),
    };
    const tool = createDocOcrImageTool(adapter, { maxImageBytes: 1024 });
    const result = await tool.run(
      {
        image_base64: Buffer.from("img", "utf8").toString("base64"),
      },
      { metadata: undefined, signal: undefined }
    );
    expect((result as { text: string }).text).toBe("Detected text");
  });

  it("formats citations into markdown", async () => {
    const tool = createCitationFormatTool();
    const result = await tool.run(
      {
        evidence: [
          {
            url: "https://example.com/a",
            page: 2,
            quote: "Alpha quote",
          },
        ],
      },
      { metadata: undefined, signal: undefined }
    );
    expect((result as { citations: Array<{ id: string }> }).citations[0].id).toBe("c1");
    expect((result as { formatted: string }).formatted).toContain("https://example.com/a");
    expect((result as { formatted: string }).formatted).toContain("Alpha quote");
  });
});

