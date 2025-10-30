import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  FeatherProjectConfigSchema,
  type FeatherProjectConfig,
  type ProviderDefinitionConfig,
  type ToolDefinitionConfig,
} from "../types/config.js";

export interface NormalisedProvidersConfig {
  policy?: "cheapest" | "roundrobin" | "first";
  entries: Record<string, ProviderDefinitionConfig>;
}

export interface NormalisedProjectConfig extends Omit<FeatherProjectConfig, "providers"> {
  providers: NormalisedProvidersConfig;
}

export interface LoadedProjectConfig {
  baseDir: string;
  config: NormalisedProjectConfig;
}

export async function loadProjectConfig(input: string | object, opts: { cwd?: string } = {}): Promise<LoadedProjectConfig> {
  const baseDir = resolveBaseDir(input, opts.cwd);
  const raw = typeof input === "string" ? await readConfigFile(input, baseDir) : input;
  const parsed = FeatherProjectConfigSchema.parse(raw);
  const providers = normaliseProviders(parsed.providers);
  const tools = normaliseTools(parsed.tools);
  return {
    baseDir,
    config: {
      ...parsed,
      providers,
      tools,
    },
  } satisfies LoadedProjectConfig;
}

function resolveBaseDir(input: string | object, cwd?: string): string {
  if (typeof input === "string") {
    if (path.isAbsolute(input)) {
      return path.dirname(input);
    }
    const base = cwd ?? process.cwd();
    return path.dirname(path.resolve(base, input));
  }
  return cwd ?? process.cwd();
}

async function readConfigFile(relativePath: string, cwd: string): Promise<unknown> {
  const absolute = path.isAbsolute(relativePath)
    ? relativePath
    : path.resolve(cwd, relativePath);
  const content = await readFile(absolute, "utf8");
  try {
    return JSON.parse(content) as unknown;
  } catch (error) {
    throw new Error(`Failed to parse config file '${absolute}': ${(error as Error).message}`);
  }
}

function normaliseProviders(input: FeatherProjectConfig["providers"]): NormalisedProvidersConfig {
  if ("entries" in input) {
    return {
      policy: input.policy,
      entries: { ...input.entries },
    } satisfies NormalisedProvidersConfig;
  }
  const entries = { ...input } as Record<string, ProviderDefinitionConfig>;
  return { entries } satisfies NormalisedProvidersConfig;
}

function normaliseTools(input: FeatherProjectConfig["tools"]): Record<string, ToolDefinitionConfig> {
  return { ...input };
}
