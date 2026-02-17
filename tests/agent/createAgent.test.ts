import { describe, expect, it } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createAgent } from "../../src/agent/createAgent.js";
import type { Planner } from "../../src/agent/types.js";
import type { MemoryManager } from "../../src/memory/types.js";
import type { Tool } from "../../src/tools/types.js";
import {
  getCapturePlannerTools,
  resetCapturePlannerState,
} from "../fixtures/modules/capture-planner.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

class StubMemory implements MemoryManager<any> {
  readonly turns: Record<string, any[]> = {};

  async append(sessionId: string, turn: any): Promise<void> {
    this.turns[sessionId] = [...(this.turns[sessionId] ?? []), turn];
  }

  async getContext(sessionId: string): Promise<any[]> {
    return [...(this.turns[sessionId] ?? [])];
  }
}

describe("createAgent", () => {
  const fixture = path.join(__dirname, "../fixtures/configs/mock-agent.json");

  it("boots an agent from config and executes tools", async () => {
    const { agent, name } = await createAgent({ config: fixture });
    expect(name).toBe("test-agent");

    const result = await agent.run({
      sessionId: "session-1",
      input: { role: "user", content: "calculate" }
    });

    expect(result.status).toBe("completed");
    if (result.status !== "completed") {
      throw new Error("expected completed result");
    }
    expect(result.output.content).toBe("5");
  });

  it("allows overriding planner and memory", async () => {
    const planner: Planner = async () => ({
      final: { role: "assistant", content: "override" }
    });
    const memory = new StubMemory();

    const { agent } = await createAgent({
      config: fixture,
      overrides: { planner, memory, tools: [] },
    });

    const result = await agent.run({
      sessionId: "session-override",
      input: { role: "user", content: "ignored" }
    });

    expect(result.status).toBe("completed");
    if (result.status !== "completed") {
      throw new Error("expected completed result");
    }
    expect(result.output.content).toBe("override");
    expect(memory.turns["session-override"]).toBeDefined();
  });

  it("passes overridden tools to planner metadata", async () => {
    resetCapturePlannerState();
    const overrideConfig = path.join(
      __dirname,
      "../fixtures/configs/tool-override-agent.json"
    );

    const stubTool: Tool = {
      name: "stub-tool",
      description: "Stub tool",
      run: async () => "ok",
    };

    await createAgent({
      config: overrideConfig,
      overrides: { tools: [stubTool] },
    });

    expect(getCapturePlannerTools()).toEqual(
      expect.arrayContaining([
        {
          name: "stub-tool",
          description: "Stub tool",
          inputSchema: undefined,
        },
        expect.objectContaining({ name: "tool.list" }),
        expect.objectContaining({ name: "tool.call" }),
      ])
    );
  });

  it("throws when requested agent is missing", async () => {
    await expect(createAgent({ config: fixture, agent: "missing" })).rejects.toThrow(
      "Agent 'missing' not found"
    );
  });

  it("supports request-scoped env values for provider factories", async () => {
    const envProviderModule = path.resolve(__dirname, "../fixtures/providers/env-provider.js");
    const config = {
      version: 1,
      providers: {
        entries: {
          envProvider: {
            module: envProviderModule,
            export: "createEnvProvider",
            models: [{ name: "env-model" }],
          },
        },
      },
      agents: {
        envAgent: {
          planner: {
            kind: "json",
            model: "env-model",
          },
        },
      },
      defaults: {
        agent: "envAgent",
      },
    };

    await expect(createAgent({ config })).rejects.toThrow("Missing DASHBOARD_TEST_API_KEY");

    const { agent } = await createAgent({
      config,
      env: (key) => (key === "DASHBOARD_TEST_API_KEY" ? "test-key" : undefined),
    });
    const result = await agent.run({
      sessionId: "env-session",
      input: { role: "user", content: "hello" },
    });
    expect(result.status).toBe("completed");
    if (result.status !== "completed") {
      throw new Error("expected completed result");
    }
    expect(result.output.content).toBe("env-ok");
  });
});
