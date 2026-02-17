import { gunzipSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import { buildAgentPackage } from "../../src/dashboard/exporter.js";
import { FeatherProjectConfigSchema } from "../../src/types/config.js";

describe("buildAgentPackage", () => {
  it("creates a runnable package archive with core files", () => {
    const config = FeatherProjectConfigSchema.parse({
      version: 1,
      providers: {
        entries: {
          openai: {
            builtin: "openai",
            models: [{ name: "gpt-4o-mini" }],
          },
        },
      },
      tools: {
        calculator: {
          builtin: "calc",
        },
      },
      agents: {
        default: {
          planner: {
            kind: "json",
            model: "gpt-4o-mini",
          },
          tools: ["calculator"],
        },
      },
      defaults: {
        agent: "default",
      },
    });

    const exported = buildAgentPackage({ config, agent: "default" });
    expect(exported.filename).toBe("legionaire-default.tar.gz");

    const entries = readTarEntries(gunzipSync(exported.archive));
    expect(entries.has("package.json")).toBe(true);
    expect(entries.has("README.md")).toBe(true);
    expect(entries.has(".env.example")).toBe(true);
    expect(entries.has("legionaire.config.json")).toBe(true);
    expect(entries.has("src/run-agent.mjs")).toBe(true);

    const exportedConfig = JSON.parse(entries.get("legionaire.config.json")!.toString("utf8"));
    expect(exportedConfig.defaults.agent).toBe("default");
    const runnerScript = entries.get("src/run-agent.mjs")!.toString("utf8");
    expect(runnerScript).toContain("loadDotEnv");
    expect(runnerScript).toContain(".env");
  });

  it("scaffolds relative module references into the archive", () => {
    const config = FeatherProjectConfigSchema.parse({
      version: 1,
      providers: {
        entries: {
          custom: {
            module: "./providers/custom-provider.js",
            export: "createCustomProvider",
            models: [{ name: "custom-model" }],
          },
        },
      },
      tools: {
        externalTool: {
          module: "../unsafe/tool-module",
        },
      },
      agents: {
        app: {
          planner: {
            kind: "json",
            model: "custom-model",
          },
          tools: ["externalTool"],
        },
      },
      defaults: {
        agent: "app",
      },
    });

    const exported = buildAgentPackage({ config, agent: "app", packageName: "custom package" });
    expect(exported.filename).toBe("custom-package.tar.gz");
    expect(exported.scaffoldedModules.length).toBeGreaterThan(0);

    const entries = readTarEntries(gunzipSync(exported.archive));
    for (const file of exported.scaffoldedModules) {
      expect(entries.has(file)).toBe(true);
    }

    const exportedConfig = JSON.parse(entries.get("legionaire.config.json")!.toString("utf8"));
    expect(exportedConfig.providers.entries.custom.module.startsWith("./")).toBe(true);
    expect(exportedConfig.providers.entries.custom.module.includes("..")).toBe(false);
    expect(entries.get("README.md")!.toString("utf8")).toContain("Modules Requiring Implementation");
  });

  it("reuses scaffold paths for repeated module references", () => {
    const config = FeatherProjectConfigSchema.parse({
      version: 1,
      providers: {
        entries: {
          one: {
            module: "./shared/provider.js",
            models: [{ name: "m1" }],
          },
          two: {
            module: "./shared/provider.js",
            models: [{ name: "m2" }],
          },
        },
      },
      agents: {
        default: {
          planner: { kind: "json", model: "m1" },
        },
      },
    });

    const exported = buildAgentPackage({ config });
    const entries = readTarEntries(gunzipSync(exported.archive));
    const exportedConfig = JSON.parse(entries.get("legionaire.config.json")!.toString("utf8"));
    const firstPath = exportedConfig.providers.entries.one.module;
    const secondPath = exportedConfig.providers.entries.two.module;
    expect(firstPath).toBe(secondPath);
    expect(exported.scaffoldedModules.filter((file) => file === firstPath.replace(/^\.\//, "")).length).toBe(1);
  });

  it("includes tool remote env vars in .env.example", () => {
    const config = FeatherProjectConfigSchema.parse({
      version: 1,
      providers: {
        entries: {
          openai: {
            builtin: "openai",
            models: [{ name: "gpt-4o-mini" }],
          },
        },
      },
      tools: {
        remoteSearch: {
          builtin: "web.search",
          options: {
            remote: {
              baseUrlEnv: "AGENT_PLATFORM_BASE_URL",
              apiKeyEnv: "AGENT_PLATFORM_API_KEY",
            },
          },
        },
      },
      agents: {
        default: {
          planner: { kind: "json", model: "gpt-4o-mini" },
          tools: ["remoteSearch"],
        },
      },
      defaults: {
        agent: "default",
      },
    });

    const exported = buildAgentPackage({ config });
    const entries = readTarEntries(gunzipSync(exported.archive));
    const env = entries.get(".env.example")!.toString("utf8");
    expect(env).toContain("AGENT_PLATFORM_BASE_URL=");
    expect(env).toContain("AGENT_PLATFORM_API_KEY=");
  });
});

function readTarEntries(buffer: Buffer): Map<string, Buffer> {
  const files = new Map<string, Buffer>();
  let offset = 0;
  while (offset + 512 <= buffer.length) {
    const header = buffer.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) {
      break;
    }
    const name = readString(header, 0, 100);
    const prefix = readString(header, 345, 155);
    const path = prefix ? `${prefix}/${name}` : name;
    const sizeRaw = readString(header, 124, 12).trim();
    const size = sizeRaw ? Number.parseInt(sizeRaw, 8) : 0;
    const contentStart = offset + 512;
    const contentEnd = contentStart + size;
    files.set(path, buffer.subarray(contentStart, contentEnd));
    offset = contentStart + Math.ceil(size / 512) * 512;
  }
  return files;
}

function readString(buffer: Buffer, offset: number, length: number): string {
  return buffer
    .subarray(offset, offset + length)
    .toString("utf8")
    .replace(/\0.*$/, "");
}
