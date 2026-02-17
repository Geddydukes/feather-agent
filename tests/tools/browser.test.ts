import { describe, expect, it } from "vitest";

import { createWebBrowserSessionTool } from "../../src/tools/browser.js";

describe("browser tool", () => {
  it("runs browser session via adapter", async () => {
    const adapter = {
      runSession: async (request: { session_id?: string; start_url: string; actions?: Array<{ type: string }> }) => ({
        session_id: request.session_id ?? "session-x",
        final_url: "https://example.com/end",
        title: "End Page",
        text: "Extracted text",
        actions: (request.actions ?? []).map((action, index) => ({
          index,
          type: action.type as "navigate" | "click" | "type" | "wait" | "extract",
          status: "ok" as const,
        })),
      }),
    };
    const tool = createWebBrowserSessionTool(adapter, { maxActions: 5 });
    const result = await tool.run(
      {
        start_url: "https://example.com",
        actions: [{ type: "extract" }],
      },
      { metadata: undefined, signal: undefined }
    );
    expect((result as { final_url: string }).final_url).toBe("https://example.com/end");
    expect((result as { actions: Array<{ type: string }> }).actions[0].type).toBe("extract");
  });

  it("enforces max action limit", async () => {
    const adapter = {
      runSession: async () => ({
        session_id: "s",
        final_url: "https://example.com",
        actions: [],
      }),
    };
    const tool = createWebBrowserSessionTool(adapter, { maxActions: 1 });
    await expect(
      tool.run(
        {
          start_url: "https://example.com",
          actions: [{ type: "extract" }, { type: "extract" }],
        },
        { metadata: undefined, signal: undefined }
      )
    ).rejects.toThrow(/exceeded max actions/);
  });
});

