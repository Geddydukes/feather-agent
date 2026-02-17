import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  FeatherProjectConfigSchema,
  type FeatherProjectConfig,
  type ProviderDefinitionConfig,
  type ToolDefinitionConfig,
  type AgentDefinitionConfig,
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

export async function loadProjectConfig(
  input: string | object,
  opts: { cwd?: string; allowMissingAgents?: boolean } = {}
): Promise<LoadedProjectConfig> {
  const baseDir = resolveBaseDir(input, opts.cwd);
  const raw = typeof input === "string"
    ? await readConfigWithExtends(input, baseDir, new Set<string>())
    : await readConfigObjectWithExtends(input, baseDir, new Set<string>());
  const parsed = FeatherProjectConfigSchema.parse(raw);
  const providers = normaliseProviders(parsed.providers);
  const tools = normaliseTools(parsed.tools ?? {});
  const merged = applyDefaults({
    ...parsed,
    providers,
    tools,
  }, { allowMissingAgents: opts.allowMissingAgents });
  return {
    baseDir,
    config: {
      ...merged,
      providers: merged.providers,
      tools: merged.tools,
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

async function readConfigWithExtends(
  relativePath: string,
  cwd: string,
  seen: Set<string>
): Promise<unknown> {
  const absolute = path.isAbsolute(relativePath)
    ? relativePath
    : path.resolve(cwd, relativePath);
  if (seen.has(absolute)) {
    throw new Error(`Config extends cycle detected at '${absolute}'`);
  }
  seen.add(absolute);
  const raw = await readConfigFile(absolute, cwd);
  return resolveExtends(raw, path.dirname(absolute), seen);
}

async function readConfigObjectWithExtends(
  input: object,
  cwd: string,
  seen: Set<string>
): Promise<unknown> {
  return resolveExtends(input, cwd, seen);
}

async function resolveExtends(
  raw: unknown,
  baseDir: string,
  seen: Set<string>
): Promise<unknown> {
  if (!raw || typeof raw !== "object") {
    return raw;
  }
  const prepared = resolveRelativeModulePaths(raw, baseDir);
  const extendsValue = (prepared as { extends?: string | string[] }).extends;
  if (!extendsValue) {
    return prepared;
  }
  const sources = Array.isArray(extendsValue) ? extendsValue : [extendsValue];
  let merged: Record<string, unknown> = {};
  for (const source of sources) {
    const resolved = path.isAbsolute(source) ? source : path.resolve(baseDir, source);
    const base = await readConfigWithExtends(resolved, baseDir, seen);
    merged = deepMerge(merged, base as Record<string, unknown>);
  }
  const { extends: _ignored, ...rest } = prepared as Record<string, unknown>;
  merged = deepMerge(merged, rest);
  return merged;
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

function applyDefaults(
  config: NormalisedProjectConfig,
  opts: { allowMissingAgents?: boolean } = {}
): NormalisedProjectConfig {
  const providerDefaults = config.defaults.providers ?? {};
  const toolDefaults = config.defaults.tools ?? {};
  const agentDefaults = config.defaults.agentConfig ?? {};

  const providers: NormalisedProvidersConfig = {
    policy: config.providers.policy,
    entries: mapValues(config.providers.entries, (entry) => deepMerge(providerDefaults, entry)),
  };

  const tools = mapValues(config.tools ?? {}, (entry) => deepMerge(toolDefaults, entry));

  const hasAgents = Object.keys(config.agents ?? {}).length > 0;
  const agents = mapValues(config.agents ?? {}, (entry) => {
    const merged = deepMerge(agentDefaults, entry) as AgentDefinitionConfig;
    assertPlanner(merged.planner);
    if (!merged.tools) {
      merged.tools = [];
    }
    return merged;
  });
  if (!hasAgents && !opts.allowMissingAgents) {
    throw new Error("Configuration must define at least one agent");
  }

  return {
    ...config,
    providers,
    tools,
    agents,
  } satisfies NormalisedProjectConfig;
}

function mapValues<T extends Record<string, any>, V>(
  input: T,
  mapper: (value: T[keyof T]) => V
): Record<string, V> {
  return Object.fromEntries(
    Object.entries(input).map(([key, value]) => [key, mapper(value)])
  );
}

function deepMerge<T>(base: T, override: unknown): T {
  if (!isPlainObject(base) || !isPlainObject(override)) {
    return (override === undefined ? base : override) as T;
  }
  const result: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  const additions: Array<{ key: string; value: unknown }> = [];
  const removals: Array<{ key: string; value: unknown }> = [];
  for (const [key, value] of Object.entries(override as Record<string, unknown>)) {
    if (key.endsWith("+")) {
      additions.push({ key, value });
      continue;
    }
    if (key.endsWith("-")) {
      removals.push({ key, value });
      continue;
    }
    result[key] = deepMerge(result[key], value);
  }
  for (const { key, value } of additions) {
    if (!Array.isArray(value)) {
      throw new Error(`Append operator '${key}' must contain an array`);
    }
    const targetKey = key.slice(0, -1);
    const existing = result[targetKey];
    if (existing === undefined) {
      result[targetKey] = [...value];
      continue;
    }
    if (!Array.isArray(existing)) {
      throw new Error(`Append operator '${key}' requires '${targetKey}' to be an array`);
    }
    result[targetKey] = [...existing, ...value];
  }
  for (const { key, value } of removals) {
    if (!Array.isArray(value)) {
      throw new Error(`Remove operator '${key}' must contain an array`);
    }
    const targetKey = key.slice(0, -1);
    const existing = result[targetKey];
    if (existing === undefined) {
      continue;
    }
    if (!Array.isArray(existing)) {
      throw new Error(`Remove operator '${key}' requires '${targetKey}' to be an array`);
    }
    result[targetKey] = removeFromArray(existing, value);
  }
  return result as T;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function assertPlanner(planner: AgentDefinitionConfig["planner"]): void {
  if (!planner) {
    throw new Error("Agent configuration must include a planner (set defaults.agentConfig.planner or per-agent planner)");
  }
  if (isPlainObject(planner) && ("builtin" in planner || "module" in planner)) {
    return;
  }
  if (!isPlainObject(planner) || typeof planner.model !== "string" || !planner.model) {
    throw new Error("JSON planner requires a model identifier");
  }
}

function resolveRelativeModulePaths(input: unknown, baseDir: string): unknown {
  if (Array.isArray(input)) {
    return input.map((value) => resolveRelativeModulePaths(value, baseDir));
  }
  if (!isPlainObject(input)) {
    return input;
  }
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (key === "module" && typeof value === "string" && value.startsWith(".")) {
      result[key] = path.resolve(baseDir, value);
      continue;
    }
    if (key === "options") {
      result[key] = value;
      continue;
    }
    result[key] = resolveRelativeModulePaths(value, baseDir);
  }
  return result;
}

function removeFromArray(existing: unknown[], removals: unknown[]): unknown[] {
  const removalSet = removals.filter((value) => value && typeof value === "object" && "name" in (value as any));
  const removalNames = new Set(removalSet.map((value) => (value as any).name));
  return existing.filter((item) => {
    if (removalNames.size > 0 && item && typeof item === "object" && "name" in (item as any)) {
      return !removalNames.has((item as any).name);
    }
    return !removals.some((value) => isSameValue(item, value));
  });
}

function isSameValue(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }
  if (typeof a !== typeof b) {
    return false;
  }
  if (a && b && typeof a === "object") {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return false;
}
