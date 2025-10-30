import { createCalcTool } from "../tools/calc.js";
import type { Tool } from "../tools/types.js";
import type { ToolDefinitionConfig, ModuleReferenceConfig } from "../types/config.js";
import { ModuleRegistry, type RegistryContext } from "./registry.js";

interface ToolFactoryContext extends RegistryContext {}

export interface LoadedTool {
  tool: Tool;
  planner?: ToolDefinitionConfig["planner"];
}

export function createToolRegistry(context: ToolFactoryContext) {
  return new ModuleRegistry<Tool, ToolFactoryContext>({
    kind: "tool",
    context,
    builtins: {
      calc: (ref) => createCalcTool((ref.options ?? {}) as Record<string, unknown>),
    },
    assert: (value) => {
      const tool = value as Tool | undefined;
      if (!tool || typeof tool.name !== "string" || typeof tool.run !== "function") {
        throw new Error("Tool factory must return a Tool instance");
      }
    },
  });
}

export async function instantiateTool(
  reference: ModuleReferenceConfig & { name?: string; description?: string; planner?: ToolDefinitionConfig["planner"] },
  registry: ModuleRegistry<Tool, ToolFactoryContext>
): Promise<LoadedTool> {
  const instance = await registry.create(reference);
  const tool = applyOverrides(instance, reference);
  return { tool, planner: reference.planner } satisfies LoadedTool;
}

function applyOverrides(tool: Tool, overrides: { name?: string; description?: string }): Tool {
  if (!overrides.name && !overrides.description) {
    return tool;
  }
  return {
    ...tool,
    name: overrides.name ?? tool.name,
    description: overrides.description ?? tool.description,
  };
}
