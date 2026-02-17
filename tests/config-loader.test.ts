import { describe, expect, it } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadProjectConfig } from "../src/core/config-loader.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("loadProjectConfig", () => {
  it("merges extends, shorthands, and defaults", async () => {
    const fixture = path.join(__dirname, "fixtures/configs/domain.json");
    const { config } = await loadProjectConfig(fixture);
    const agent = config.agents.default;

    expect(agent.id).toBe("domain-agent");
    expect(agent.planner).toEqual({
      model: "fast",
      systemPrompt: "You are helpful.",
    });
    expect(agent.memory).toEqual({ builtin: "inmemory" });
    expect(agent.tools).toEqual(["calculator"]);
    expect(config.tools.calculator.builtin).toBe("calc");
    expect(config.providers.entries.mock.models).toEqual([
      { name: "slow" },
    ]);
  });

  it("requires a planner after defaults are applied", async () => {
    await expect(loadProjectConfig({
      agents: { missing: {} },
    })).rejects.toThrow("planner");
  });

  it("allows provider-only configs when opted in", async () => {
    const { config } = await loadProjectConfig({
      providers: {
        entries: {
          mock: {
            module: "../fixtures/providers/mock-provider.js",
            export: "createMockProvider",
            options: { responses: [] },
            models: [{ name: "mock", aliases: ["fast"] }],
          },
        },
      },
    }, { allowMissingAgents: true });
    expect(Object.keys(config.providers.entries)).toEqual(["mock"]);
    expect(Object.keys(config.agents)).toEqual([]);
  });
});
