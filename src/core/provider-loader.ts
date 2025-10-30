import type { ChatProvider } from "../providers/base.js";
import { openai } from "../providers/openai.js";
import { anthropic } from "../providers/anthropic.js";
import { ProviderRegistry } from "../providers/registry.js";
import type { ProviderDefinitionConfig } from "../types/config.js";
import { ModuleRegistry, type RegistryContext } from "./registry.js";

interface ProviderFactoryContext extends RegistryContext {
  env(key: string): string | undefined;
}

export interface ProviderBootstrapResult {
  providers: Record<string, ChatProvider>;
  registry: ProviderRegistry;
}

export function createProviderFactoryRegistry(context: ProviderFactoryContext) {
  return new ModuleRegistry<ChatProvider, ProviderFactoryContext>({
    kind: "provider",
    context,
    builtins: {
      openai: (ref, ctx) => {
        const apiKeyEnv = ref.apiKeyEnv ?? "OPENAI_API_KEY";
        const apiKey = ctx.env(apiKeyEnv);
        if (!apiKey) {
          throw new Error(`OPENAI provider requires environment variable '${apiKeyEnv}'`);
        }
        return openai({
          apiKey,
          baseUrl: ref.baseUrl,
          pricing: ref.pricing,
        });
      },
      anthropic: (ref, ctx) => {
        const apiKeyEnv = ref.apiKeyEnv ?? "ANTHROPIC_API_KEY";
        const apiKey = ctx.env(apiKeyEnv);
        if (!apiKey) {
          throw new Error(`Anthropic provider requires environment variable '${apiKeyEnv}'`);
        }
        return anthropic({
          apiKey,
          baseUrl: ref.baseUrl,
        });
      },
    },
    assert: (value) => {
      const provider = value as ChatProvider | undefined;
      if (!provider || typeof provider.chat !== "function") {
        throw new Error("Provider factory must return a ChatProvider instance");
      }
    },
  });
}

export async function buildProviders(
  entries: Record<string, ProviderDefinitionConfig>,
  options: { policy?: "cheapest" | "roundrobin" | "first"; registry: ModuleRegistry<ChatProvider, ProviderFactoryContext> }
): Promise<ProviderBootstrapResult> {
  const providers: Record<string, ChatProvider> = {};
  const registry = new ProviderRegistry({ policy: options.policy });

  for (const [key, definition] of Object.entries(entries)) {
    const provider = await options.registry.create(definition);
    providers[key] = provider;
    registry.add({
      key,
      inst: provider,
      models: definition.models.map((model: ProviderDefinitionConfig["models"][number]) => ({ ...model })),
    });
  }

  return { providers, registry } satisfies ProviderBootstrapResult;
}
