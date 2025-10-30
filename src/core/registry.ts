import { pathToFileURL } from "node:url";
import path from "node:path";

import type { ModuleReferenceConfig } from "../types/config.js";

export interface RegistryContext {
  baseDir: string;
}

export type ModuleFactory<T, C extends RegistryContext> = (
  ref: ModuleReferenceConfig,
  context: C
) => Promise<T> | T;

export interface ModuleRegistryOptions<T, C extends RegistryContext> {
  kind: string;
  context: C;
  builtins?: Record<string, ModuleFactory<T, C>>;
  assert?: (value: unknown, ref: ModuleReferenceConfig) => void;
}

export class ModuleRegistry<T, C extends RegistryContext> {
  private readonly builtins = new Map<string, ModuleFactory<T, C>>();
  private readonly kind: string;
  private readonly context: C;
  private readonly assert?: ModuleRegistryOptions<T, C>["assert"];

  constructor(options: ModuleRegistryOptions<T, C>) {
    this.kind = options.kind;
    this.context = options.context;
    this.assert = options.assert;
    for (const [name, factory] of Object.entries(options.builtins ?? {})) {
      this.register(name, factory);
    }
  }

  register(name: string, factory: ModuleFactory<T, C>): void {
    if (!name) {
      throw new Error(`${this.kind} registry requires a non-empty name`);
    }
    this.builtins.set(name, factory);
  }

  async create(ref: ModuleReferenceConfig): Promise<T> {
    if (!ref) {
      throw new Error(`${this.kind} reference is required`);
    }
    if (ref.builtin) {
      const factory = this.builtins.get(ref.builtin);
      if (!factory) {
        const names = Array.from(this.builtins.keys()).join(", ");
        throw new Error(`Unknown builtin ${this.kind} '${ref.builtin}'. Known builtins: ${names || "<none>"}`);
      }
      const value = await factory(ref, this.context);
      this.assert?.(value, ref);
      return value;
    }

    if (!ref.module) {
      throw new Error(`${this.kind} reference must specify either a builtin or module path`);
    }

    const exportName = ref.export ?? "default";
    const url = this.toModuleUrl(ref.module);
    let imported: any;
    try {
      imported = await import(url);
    } catch (error) {
      throw new Error(`Failed to load ${this.kind} module '${ref.module}': ${(error as Error).message}`);
    }

    if (!(exportName in imported)) {
      throw new Error(`Module '${ref.module}' does not export '${exportName}' for ${this.kind}`);
    }

    const candidate = imported[exportName];
    const value = await this.instantiate(candidate, ref);
    this.assert?.(value, ref);
    return value;
  }

  private async instantiate(candidate: any, ref: ModuleReferenceConfig): Promise<T> {
    if (typeof candidate === "function") {
      const result = await candidate(ref.options, this.context);
      return result as T;
    }
    if (candidate && typeof candidate === "object") {
      return candidate as T;
    }
    throw new Error(`Export '${ref.export ?? "default"}' from '${ref.module}' is not a constructible ${this.kind}`);
  }

  private toModuleUrl(specifier: string): string {
    if (specifier.startsWith(".") || specifier.startsWith("/")) {
      const resolved = path.resolve(this.context.baseDir, specifier);
      return pathToFileURL(resolved).href;
    }
    return specifier;
  }
}
