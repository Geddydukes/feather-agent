import type { Agent } from "./Agent.js";
import { Agent as AgentImpl } from "./Agent.js";
import type { AgentConfig, AgentMemoryTurn, AgentShouldStopEvaluator, Planner } from "./types.js";
import type { AgentPolicies, AgentPolicyConfig } from "./policies.js";
import type { AgentQuotaConfig, AgentQuotaManager } from "./quotas.js";
import { ContextBuilder } from "./context-builder.js";
import { loadProjectConfig } from "../core/config-loader.js";
import { createProviderFactoryRegistry, buildProviders } from "../core/provider-loader.js";
import { Feather } from "../core/Orchestrator.js";
import { createToolRegistry, instantiateTool, type LoadedTool } from "../core/tool-loader.js";
import { createMemoryRegistry, instantiateMemory } from "../core/memory-loader.js";
import { createPlannerRegistry, instantiatePlanner } from "../core/planner-loader.js";
import type { PlannerToolDescription } from "./planner.js";
import type { Tool } from "../tools/types.js";
import type { MemoryManager } from "../memory/types.js";
import {
  AgentDefinitionSchema,
  type AgentDefinitionConfig,
  type ModuleReferenceConfig,
} from "../types/config.js";
import { ModuleRegistry, type RegistryContext } from "../core/registry.js";
import type { ToolCache, ToolCacheOptions } from "../core/tool-cache.js";
import type { NormalisedProjectConfig } from "../core/config-loader.js";

export interface CreateAgentOptions<TTurn extends AgentMemoryTurn = AgentMemoryTurn> {
  /** Path to a configuration file or configuration object. Defaults to `feather.config.json`. */
  config?: string | object;
  /** Agent identifier within the config. Defaults to `defaults.agent` or the sole agent entry. */
  agent?: string;
  /** Working directory used for resolving relative module imports. */
  cwd?: string;
  /**
   * Overrides applied to the resolved agent configuration. Useful when providing custom
   * runtime dependencies such as an in-memory implementation for tests.
   */
  overrides?: Partial<AgentConfigOverrides<TTurn>>;
}

export interface AgentConfigOverrides<TTurn extends AgentMemoryTurn = AgentMemoryTurn> {
  id?: string;
  metadata?: Record<string, unknown>;
  planner?: AgentConfig<TTurn>["planner"];
  memory?: MemoryManager<TTurn>;
  tools?: Tool[];
  maxIterations?: number;
  maxActionsPerPlan?: number;
  context?: AgentConfig<TTurn>["context"];
  policies?: AgentPolicies | AgentPolicyConfig;
  quotas?: AgentQuotaManager | AgentQuotaConfig;
  toolCache?: ToolCache | ToolCacheOptions;
  shouldStop?: AgentShouldStopEvaluator;
  createMemoryTurn?: AgentConfig<TTurn>["createMemoryTurn"];
  onEvent?: AgentConfig<TTurn>["onEvent"];
}

export interface CreateAgentResult<TTurn extends AgentMemoryTurn = AgentMemoryTurn> {
  agent: Agent<TTurn>;
  orchestrator: Feather;
  name: string;
  definition: AgentDefinitionConfig;
  project: NormalisedProjectConfig;
}

const DEFAULT_CONFIG_PATH = "feather.config.json";

export async function createAgent<TTurn extends AgentMemoryTurn = AgentMemoryTurn>(
  input?: string | CreateAgentOptions<TTurn>
): Promise<CreateAgentResult<TTurn>> {
  const options = typeof input === "string" ? { config: input } : input ?? {};
  const configSource = options.config ?? DEFAULT_CONFIG_PATH;
  const { baseDir, config: project } = await loadProjectConfig(configSource, { cwd: options.cwd });
  const agentName = resolveAgentName(options.agent, project);
  const definition = project.agents[agentName];
  if (!definition) {
    throw new Error(`Agent '${agentName}' not found in configuration`);
  }

  // Validate the definition explicitly to surface helpful errors when using programmatic overrides.
  AgentDefinitionSchema.parse(definition);

  const providerRegistry = createProviderFactoryRegistry({
    baseDir,
    env: (key) => process.env[key],
  });
  const { providers, registry } = await buildProviders(project.providers.entries, {
    policy: project.providers.policy,
    registry: providerRegistry,
  });
  const orchestrator = new Feather({ providers, registry });

  const sharedTools = await loadSharedTools(project.tools, baseDir);

  const agentTools = await loadAgentTools(definition.tools, sharedTools, baseDir);
  const overrideTools = options.overrides?.tools;
  const toolInstances = overrideTools ?? agentTools.map((item) => item.tool);
  const plannerTools = overrideTools
    ? buildPlannerToolDescriptionsFromTools(overrideTools)
    : buildPlannerToolDescriptions(agentTools);

  const memory = await resolveMemory(definition, baseDir, options.overrides?.memory);

  const planner = await resolvePlanner<TTurn>({
    definition,
    baseDir,
    orchestrator,
    tools: plannerTools,
    override: options.overrides?.planner,
  });

  const baseConfig: AgentConfig<TTurn> = {
    id: definition.id ?? agentName,
    metadata: definition.metadata,
    planner: planner as AgentConfig<TTurn>["planner"],
    memory: memory as MemoryManager<TTurn>,
    tools: toolInstances,
    maxIterations: definition.maxIterations,
    maxActionsPerPlan: definition.maxActionsPerPlan,
    context: await buildContext(definition, baseDir),
    policies: await resolveOptional(definition.policies, baseDir, "policies"),
    quotas: await resolveOptional(definition.quotas, baseDir, "quotas"),
    toolCache: await resolveOptional(definition.toolCache, baseDir, "tool cache"),
    shouldStop: await resolveOptional(definition.shouldStop, baseDir, "stop evaluator"),
    createMemoryTurn: await resolveOptional(definition.createMemoryTurn, baseDir, "memory turn factory"),
  };

  const finalConfig = applyOverrides<TTurn>(baseConfig, options.overrides);
  const agent = new AgentImpl<TTurn>(finalConfig);

  return {
    agent,
    orchestrator,
    name: agentName,
    definition,
    project,
  } satisfies CreateAgentResult<TTurn>;
}

async function loadSharedTools(
  entries: Record<string, ModuleReferenceConfig & { name?: string; description?: string; planner?: LoadedTool["planner"] }>,
  baseDir: string
): Promise<Record<string, LoadedTool>> {
  const registry = createToolRegistry({ baseDir });
  const result: Record<string, LoadedTool> = {};
  for (const [name, definition] of Object.entries(entries)) {
    result[name] = await instantiateTool(definition, registry);
  }
  return result;
}

async function loadAgentTools(
  references: AgentDefinitionConfig["tools"],
  shared: Record<string, LoadedTool>,
  baseDir: string
): Promise<LoadedTool[]> {
  const registry = createToolRegistry({ baseDir });
  const loaded: LoadedTool[] = [];
  for (const entry of references) {
    if (typeof entry === "string") {
      const tool = shared[entry];
      if (!tool) {
        throw new Error(`Unknown tool reference '${entry}' in agent configuration`);
      }
      loaded.push(tool);
      continue;
    }
    loaded.push(await instantiateTool(entry, registry));
  }
  return loaded;
}

async function resolveMemory(
  definition: AgentDefinitionConfig,
  baseDir: string,
  override?: MemoryManager | undefined
): Promise<MemoryManager> {
  if (override) {
    return override;
  }
  const reference: ModuleReferenceConfig = definition.memory ?? { builtin: "inmemory" };
  const registry = createMemoryRegistry({ baseDir });
  return instantiateMemory(reference, registry);
}

async function resolvePlanner<TTurn extends AgentMemoryTurn>(options: {
  definition: AgentDefinitionConfig;
  baseDir: string;
  orchestrator: Feather;
  tools: PlannerToolDescription[];
  override?: Planner<TTurn>;
}): Promise<Planner<TTurn>> {
  if (options.override) {
    return options.override;
  }

  const plannerRef = normalisePlannerReference(options.definition.planner);
  const registry = createPlannerRegistry({
    baseDir: options.baseDir,
    tools: options.tools,
    callModel: async (invocation) => {
      const response = await options.orchestrator.chat({
        provider: invocation.provider,
        model: invocation.model,
        messages: invocation.messages,
        temperature: invocation.temperature,
        maxTokens: invocation.maxTokens,
        topP: invocation.topP,
        signal: invocation.signal,
      });
      return response.content ?? "";
    },
  });
  const planner = await instantiatePlanner(plannerRef, registry);
  return planner as Planner<TTurn>;
}

async function buildContext(
  definition: AgentDefinitionConfig,
  baseDir: string
): Promise<AgentConfig["context"] | undefined> {
  const context = definition.context;
  if (!context) {
    return undefined;
  }
  const builderRef = context.builder;
  if (!builderRef) {
    return {
      baseMessages: context.baseMessages,
      ragMessages: context.ragMessages,
      digests: context.digests,
      maxRecentTurns: context.maxRecentTurns,
      maxTokens: context.maxTokens,
    };
  }
  const builder = await resolveOptional(builderRef, baseDir, "context builder");
  const resolvedBuilder = builder instanceof ContextBuilder ? builder : new ContextBuilder(builder as any);
  return {
    builder: resolvedBuilder,
    baseMessages: context.baseMessages,
    ragMessages: context.ragMessages,
    digests: context.digests,
    maxRecentTurns: context.maxRecentTurns,
    maxTokens: context.maxTokens,
  };
}

function buildPlannerToolDescriptions(tools: LoadedTool[]): PlannerToolDescription[] {
  return tools.map(({ tool, planner }) => ({
    name: tool.name,
    description: planner?.description ?? tool.description ?? `Tool ${tool.name}`,
    inputSchema: planner?.inputSchema,
  }));
}

function buildPlannerToolDescriptionsFromTools(tools: Tool[]): PlannerToolDescription[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description ?? `Tool ${tool.name}`,
    inputSchema: undefined,
  }));
}

function applyOverrides<TTurn extends AgentMemoryTurn>(
  config: AgentConfig<TTurn>,
  overrides?: Partial<AgentConfigOverrides<TTurn>>
): AgentConfig<TTurn> {
  if (!overrides) {
    return config;
  }
  const merged: AgentConfig<TTurn> = { ...config };
  const assign = <K extends keyof AgentConfigOverrides<TTurn>>(key: K) => {
    if (overrides[key] !== undefined) {
      (merged as any)[key] = overrides[key];
    }
  };
  assign("id");
  assign("metadata");
  assign("planner");
  assign("memory");
  assign("tools");
  assign("maxIterations");
  assign("maxActionsPerPlan");
  assign("context");
  assign("policies");
  assign("quotas");
  assign("toolCache");
  assign("shouldStop");
  assign("createMemoryTurn");
  assign("onEvent");
  return merged;
}

function resolveAgentName(requested: string | undefined, project: NormalisedProjectConfig): string {
  if (requested) {
    return requested;
  }
  if (project.defaults.agent) {
    return project.defaults.agent;
  }
  const names = Object.keys(project.agents);
  if (names.length === 1) {
    return names[0];
  }
  throw new Error("Agent identifier is required when configuration defines multiple agents");
}

function normalisePlannerReference(input: AgentDefinitionConfig["planner"]): ModuleReferenceConfig {
  if ("kind" in input) {
    return {
      builtin: "json",
      options: {
        model: input.model,
        provider: input.provider,
        systemPrompt: input.systemPrompt,
        temperature: input.temperature,
        maxTokens: input.maxTokens,
        topP: input.topP,
        modelConfig: input.modelConfig,
      },
    } satisfies ModuleReferenceConfig;
  }
  return input;
}

async function resolveOptional<T = unknown>(
  reference: ModuleReferenceConfig | undefined,
  baseDir: string,
  kind: string
): Promise<T | undefined> {
  if (!reference) {
    return undefined;
  }
  const registry = new ModuleRegistry<T, RegistryContext>({
    kind,
    context: { baseDir },
  });
  return registry.create(reference);
}
