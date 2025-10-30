import { z } from "zod";
import type { AgentMessage } from "../agent/types.js";

const MessageSchema = z.lazy(() =>
  z.object({
    role: z.union([z.literal("system"), z.literal("user"), z.literal("assistant"), z.literal("tool")]),
    content: z.any(),
    name: z.string().optional(),
  })
);

const ModuleReferenceBaseSchema = z.object({
  builtin: z.string().optional(),
  module: z.string().optional(),
  export: z.string().optional(),
  options: z.unknown().optional(),
});

type ModuleReferenceBase = z.infer<typeof ModuleReferenceBaseSchema>;

const moduleReferenceRefinement = (value: ModuleReferenceBase, ctx: any) => {
  if (Boolean(value.builtin) === Boolean(value.module)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Module references must specify exactly one of `builtin` or `module`",
    });
  }
};

const ModuleReferenceSchemaBase = ModuleReferenceBaseSchema.superRefine(moduleReferenceRefinement);

const extendModuleReference = <T extends Record<string, any>>(shape: T) =>
  ModuleReferenceBaseSchema.extend(shape).superRefine(moduleReferenceRefinement);

export const ModuleReferenceSchema = ModuleReferenceSchemaBase;

const ModelSchema = z.object({
  name: z.string(),
  aliases: z.array(z.string()).optional(),
  inputPer1K: z.number().optional(),
  outputPer1K: z.number().optional(),
  capabilities: z.array(z.enum(["chat", "stream", "json", "tools"])).optional(),
});

export const ProviderDefinitionSchema = extendModuleReference({
  apiKeyEnv: z.string().optional(),
  baseUrl: z.string().optional(),
  pricing: z
    .object({
      inputPer1K: z.number().optional(),
      outputPer1K: z.number().optional(),
    })
    .optional(),
  models: z.array(ModelSchema).default([]),
});

export const ToolDefinitionSchema = extendModuleReference({
  name: z.string().optional(),
  description: z.string().optional(),
  planner: z
    .object({
      description: z.string().optional(),
      inputSchema: z.unknown().optional(),
    })
    .optional(),
});

const ToolReferenceSchema = z.union([
  z.string(),
  ToolDefinitionSchema,
]);

const ContextConfigSchema = z.object({
  builder: ModuleReferenceSchema.optional(),
  baseMessages: z.array(MessageSchema).optional(),
  ragMessages: z.array(MessageSchema).optional(),
  digests: z
    .array(
      z.object({
        content: z.string(),
        role: z.union([z.literal("system"), z.literal("user"), z.literal("assistant")]).optional(),
        label: z.string().optional(),
      })
    )
    .optional(),
  maxRecentTurns: z.number().int().positive().optional(),
  maxTokens: z.number().int().positive().optional(),
});

const PlannerJsonConfigSchema = z.object({
  kind: z.literal("json"),
  model: z.string(),
  provider: z.string().optional(),
  systemPrompt: z.string().optional(),
  temperature: z.number().optional(),
  maxTokens: z.number().int().positive().optional(),
  topP: z.number().optional(),
  modelConfig: z.record(z.unknown()).optional(),
});

const PlannerReferenceSchema = z.union([PlannerJsonConfigSchema, ModuleReferenceSchema]);

const ModuleOrFunctionSchema = ModuleReferenceSchema;

export const AgentDefinitionSchema = z.object({
  id: z.string().optional(),
  description: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
  planner: PlannerReferenceSchema,
  memory: ModuleReferenceSchema.optional(),
  tools: z.array(ToolReferenceSchema).default([]),
  policies: ModuleOrFunctionSchema.optional(),
  quotas: ModuleOrFunctionSchema.optional(),
  toolCache: ModuleOrFunctionSchema.optional(),
  shouldStop: ModuleOrFunctionSchema.optional(),
  createMemoryTurn: ModuleOrFunctionSchema.optional(),
  maxIterations: z.number().int().positive().optional(),
  maxActionsPerPlan: z.number().int().positive().optional(),
  context: ContextConfigSchema.optional(),
});

const ProvidersSectionSchema = z
  .object({
    policy: z.enum(["cheapest", "roundrobin", "first"]).optional(),
    entries: z.record(ProviderDefinitionSchema).default({}),
  })
  .default({ entries: {} });

const ToolsSectionSchema = z.record(ToolDefinitionSchema).default({});

export const FeatherProjectConfigSchema = z.object({
  version: z.literal(1).default(1),
  $schema: z.string().optional(),
  description: z.string().optional(),
  providers: z.union([ProvidersSectionSchema, z.record(ProviderDefinitionSchema)]).default({ entries: {} }),
  tools: ToolsSectionSchema,
  agents: z.record(AgentDefinitionSchema),
  defaults: z
    .object({
      agent: z.string().optional(),
    })
    .default({}),
});

export type ModuleReferenceConfig = z.infer<typeof ModuleReferenceSchema>;
export type ProviderDefinitionConfig = z.infer<typeof ProviderDefinitionSchema>;
export type ToolDefinitionConfig = z.infer<typeof ToolDefinitionSchema>;
export type AgentDefinitionConfig = z.infer<typeof AgentDefinitionSchema>;
export type FeatherProjectConfig = z.infer<typeof FeatherProjectConfigSchema>;
