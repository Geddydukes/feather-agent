import { describe, expect, it } from "vitest";

import { InMemoryToolAuditLogger } from "../../src/tools/audit.js";
import {
  InMemoryBlobStore,
  InMemoryKvStore,
  ScopedSecretsManager,
  createAuditLogEventTool,
  createMemoryBlobGetTool,
  createMemoryBlobPutTool,
  createMemoryKvGetTool,
  createMemoryKvSetTool,
  createSecretsGetTool,
} from "../../src/tools/platform.js";

describe("platform tools", () => {
  it("supports kv set/get with namespaces", async () => {
    const store = new InMemoryKvStore();
    const setTool = createMemoryKvSetTool(store);
    const getTool = createMemoryKvGetTool(store);

    await setTool.run({ namespace: "agent:user", key: "theme", value: "dark" }, { metadata: undefined, signal: undefined });
    const found = await getTool.run({ namespace: "agent:user", key: "theme" }, { metadata: undefined, signal: undefined });
    const missing = await getTool.run({ namespace: "agent:user", key: "missing" }, { metadata: undefined, signal: undefined });

    expect(found).toEqual({ found: true, value: "dark" });
    expect(missing).toEqual({ found: false });
  });

  it("stores and retrieves blobs with MIME guardrails", async () => {
    const store = new InMemoryBlobStore({
      allowedMimeTypes: ["text/plain"],
    });
    const putTool = createMemoryBlobPutTool(store);
    const getTool = createMemoryBlobGetTool(store);

    const put = (await putTool.run(
      {
        namespace: "agent:user",
        mime_type: "text/plain",
        content_base64: Buffer.from("hello", "utf8").toString("base64"),
      },
      { metadata: undefined, signal: undefined }
    )) as { blob_id: string };
    const get = await getTool.run(
      {
        namespace: "agent:user",
        blob_id: put.blob_id,
      },
      { metadata: undefined, signal: undefined }
    );

    expect(get).toEqual(
      expect.objectContaining({
        found: true,
      })
    );
  });

  it("enforces tool-scoped secret access", async () => {
    const manager = new ScopedSecretsManager(
      {
        get: async (name) => (name === "OPENAI_API_KEY" ? "secret-value" : undefined),
      },
      {
        "web.search": ["OPENAI_API_KEY"],
      }
    );
    const tool = createSecretsGetTool(manager);

    const allowed = await tool.run(
      {
        for_tool: "web.search",
        secret_name: "OPENAI_API_KEY",
      },
      { metadata: undefined, signal: undefined }
    );
    await expect(
      tool.run(
        {
          for_tool: "calc",
          secret_name: "OPENAI_API_KEY",
        },
        { metadata: undefined, signal: undefined }
      )
    ).rejects.toThrow(/not allowed/);

    expect(allowed).toEqual({
      found: true,
      secret_ref: "secret://OPENAI_API_KEY",
    });
  });

  it("appends audit events through audit.log_event", async () => {
    const logger = new InMemoryToolAuditLogger();
    const tool = createAuditLogEventTool(logger);
    const result = (await tool.run(
      {
        event_type: "tool.call",
        payload: { ok: true },
      },
      { metadata: undefined, signal: undefined }
    )) as { ok: boolean };

    expect(result.ok).toBe(true);
    expect(logger.list()).toHaveLength(1);
    expect(logger.list()[0].tool_name).toBe("audit.log_event");
  });
});
