import { describe, expect, it } from "vitest";

import { InMemoryToolAuditLogger } from "../../src/tools/audit.js";
import { ToolRegistry, ToolRuntime, createToolCallTool, createToolListTool } from "../../src/tools/runtime.js";
import type { Tool } from "../../src/tools/types.js";

describe("tool runtime", () => {
  it("lists registered tools with manifests", () => {
    const registry = new ToolRegistry();
    registry.register(createEchoTool());
    const runtime = new ToolRuntime(registry);
    const listTool = createToolListTool(runtime);

    const payload = listTool.run({}, { metadata: undefined, signal: undefined }) as { tools: Array<{ name: string }> };
    expect(payload.tools.map((tool) => tool.name)).toContain("echo");
  });

  it("executes tool.call through validation and returns structured envelope", async () => {
    const registry = new ToolRegistry();
    registry.register(createEchoTool());
    const runtime = new ToolRuntime(registry);
    const callTool = createToolCallTool(runtime);

    const envelope = (await callTool.run(
      {
        request_id: "req-1",
        tool_name: "echo",
        args: { text: "hello" },
        timeout_ms: 1000,
      },
      { metadata: undefined, signal: undefined }
    )) as {
      ok: boolean;
      request_id: string;
      data: unknown;
      meta: { duration_ms: number };
    };

    expect(envelope.ok).toBe(true);
    expect(envelope.request_id).toBe("req-1");
    expect(envelope.data).toEqual({ echoed: "hello" });
    expect(typeof envelope.meta.duration_ms).toBe("number");
  });

  it("rejects calls blocked by allowlist", async () => {
    const registry = new ToolRegistry();
    registry.register(createEchoTool());
    const runtime = new ToolRuntime(registry, {
      allowlist: {
        allowedTools: ["other-tool"],
      },
    });

    const envelope = await runtime.callTool({
      tool_name: "echo",
      args: { text: "hello" },
      timeout_ms: 1000,
    });

    expect(envelope.ok).toBe(false);
    expect(envelope.error?.code).toBe("ALLOWLIST_REJECTED");
  });

  it("requires idempotency keys for side-effect tools", async () => {
    const registry = new ToolRegistry();
    registry.register(createWriteTool());
    const runtime = new ToolRuntime(registry);

    const withoutKey = await runtime.callTool({
      tool_name: "writer",
      args: { value: "x" },
      timeout_ms: 1000,
    });
    expect(withoutKey.ok).toBe(false);
    expect(withoutKey.error?.code).toBe("IDEMPOTENCY_KEY_REQUIRED");

    const withKey = await runtime.callTool({
      tool_name: "writer",
      args: { value: "x" },
      timeout_ms: 1000,
      idempotency_key: "abc",
    });
    expect(withKey.ok).toBe(true);
  });

  it("supports dry-run mode for risky tools", async () => {
    const registry = new ToolRegistry();
    registry.register(createWriteTool());
    const runtime = new ToolRuntime(registry);

    const envelope = await runtime.callTool({
      tool_name: "writer",
      args: { value: "x" },
      timeout_ms: 1000,
      dry_run: true,
    });

    expect(envelope.ok).toBe(true);
    expect(envelope.data).toEqual(
      expect.objectContaining({
        would_execute: false,
      })
    );
  });

  it("writes audit events for success and failure", async () => {
    const logger = new InMemoryToolAuditLogger();
    const registry = new ToolRegistry();
    registry.register(createEchoTool());
    const runtime = new ToolRuntime(registry, { auditLogger: logger });

    await runtime.callTool({
      tool_name: "echo",
      args: { text: "ok" },
      timeout_ms: 1000,
    });
    await runtime.callTool({
      tool_name: "echo",
      args: { bad: true },
      timeout_ms: 1000,
    });

    const events = logger.list();
    expect(events).toHaveLength(2);
    expect(events[0].ok).toBe(true);
    expect(events[1].ok).toBe(false);
  });
});

function createEchoTool(): Tool<{ text: string }, { echoed: string }> {
  return {
    name: "echo",
    description: "Echo text",
    manifest: {
      name: "echo",
      description: "Echo tool",
      input_schema: {
        type: "object",
        additionalProperties: false,
        required: ["text"],
        properties: {
          text: { type: "string" },
        },
      },
      output_schema: {
        type: "object",
        required: ["echoed"],
        properties: {
          echoed: { type: "string" },
        },
      },
      auth_requirements: [],
      safety_tags: [],
      capabilities: {
        network: false,
        filesystem: false,
        write: false,
        side_effects: false,
      },
    },
    async run(args) {
      return { echoed: args.text };
    },
  };
}

function createWriteTool(): Tool<{ value: string }, { ok: boolean }> {
  return {
    name: "writer",
    description: "Writes values",
    manifest: {
      name: "writer",
      description: "Write tool",
      input_schema: {
        type: "object",
        additionalProperties: false,
        required: ["value"],
        properties: {
          value: { type: "string" },
        },
      },
      output_schema: {
        type: "object",
        required: ["ok"],
        properties: {
          ok: { type: "boolean" },
        },
      },
      auth_requirements: [],
      safety_tags: ["write"],
      capabilities: {
        network: false,
        filesystem: false,
        write: true,
        side_effects: true,
      },
    },
    async run() {
      return { ok: true };
    },
  };
}
