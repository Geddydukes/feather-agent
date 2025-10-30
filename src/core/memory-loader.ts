import { InMemoryMemoryManager, type InMemoryMemoryManagerOptions } from "../memory/inmemory.js";
import type { MemoryManager } from "../memory/types.js";
import type { ModuleReferenceConfig } from "../types/config.js";
import { ModuleRegistry, type RegistryContext } from "./registry.js";

interface MemoryFactoryContext extends RegistryContext {}

export function createMemoryRegistry(context: MemoryFactoryContext) {
  return new ModuleRegistry<MemoryManager, MemoryFactoryContext>({
    kind: "memory",
    context,
    builtins: {
      inmemory: (ref) => new InMemoryMemoryManager((ref.options ?? {}) as InMemoryMemoryManagerOptions),
    },
    assert: (value) => {
      if (!value || typeof (value as MemoryManager).append !== "function") {
        throw new Error("Memory factory must return a MemoryManager instance");
      }
    },
  });
}

export async function instantiateMemory(
  reference: ModuleReferenceConfig,
  registry: ModuleRegistry<MemoryManager, MemoryFactoryContext>
): Promise<MemoryManager> {
  return registry.create(reference);
}
