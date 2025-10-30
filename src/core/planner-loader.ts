import type { Message } from "../types.js";
import { createJsonPlanner, type PlannerToolDescription } from "../agent/planner.js";
import type { Planner } from "../agent/types.js";
import type { ModuleReferenceConfig } from "../types/config.js";
import { ModuleRegistry, type RegistryContext } from "./registry.js";

export interface PlannerModelInvocation {
  model: string;
  provider?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  messages: Message[];
  signal?: AbortSignal;
  metadata?: Record<string, unknown>;
  config?: Record<string, unknown>;
}

interface PlannerFactoryContext extends RegistryContext {
  tools: PlannerToolDescription[];
  callModel: (input: PlannerModelInvocation) => Promise<string>;
}

export function createPlannerRegistry(context: PlannerFactoryContext) {
  return new ModuleRegistry<Planner, PlannerFactoryContext>({
    kind: "planner",
    context,
    builtins: {
      json: (ref, ctx) => {
        const options = (ref.options ?? {}) as {
          model: string;
          provider?: string;
          systemPrompt?: string;
          temperature?: number;
          maxTokens?: number;
          topP?: number;
          modelConfig?: Record<string, unknown>;
        };
        if (!options.model || typeof options.model !== "string") {
          throw new Error("JSON planner requires a model identifier");
        }
        return createJsonPlanner({
          tools: ctx.tools,
          systemPrompt: options.systemPrompt,
          modelConfig: options.modelConfig,
          callModel: async ({ messages, signal, metadata, config }) => {
            const mergedConfig = {
              ...options.modelConfig,
              ...config,
            } as Record<string, unknown> | undefined;
            return ctx.callModel({
              model: options.model,
              provider: options.provider,
              temperature: options.temperature,
              maxTokens: options.maxTokens,
              topP: options.topP,
              messages,
              signal,
              metadata,
              config: mergedConfig,
            });
          },
        });
      },
    },
    assert: (value) => {
      if (typeof value !== "function") {
        throw new Error("Planner factory must return a planner function");
      }
    },
  });
}

export async function instantiatePlanner(
  reference: ModuleReferenceConfig,
  registry: ModuleRegistry<Planner, PlannerFactoryContext>
): Promise<Planner> {
  return registry.create(reference);
}
