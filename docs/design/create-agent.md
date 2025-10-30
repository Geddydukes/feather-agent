# Design: Config-driven agent bootstrap

## Background

The previous bootstrap flow required manual wiring of providers, planners, memory, and tools in
application code. Even simple agents demanded dozens of lines of TypeScript to construct
`Agent`, `ContextBuilder`, provider registries, and tool collections. This made it difficult to ship
copy/paste friendly examples and prevented “5 lines of code + config” adoption goals.

## Goals

- Provide a single `createAgent` facade that hydrates an `Agent` from configuration.
- Support declarative configuration of providers, planners, memory, and tools.
- Enable plug-and-play extension by dynamically loading user supplied modules.
- Keep the existing low-level building blocks available for advanced usage.
- Require no breaking changes for consumers of the existing exports (backwards compatible).

## Non-goals

- Replace the low-level APIs or remove direct `Agent` construction.
- Implement service discovery or environment specific configuration layers.
- Provide comprehensive validation for arbitrary third-party modules.

## Proposed architecture

1. **Configuration schema** – A new `FeatherProjectConfig` schema (see `src/types/config.ts`)
   describes providers, tools, and one or more named agents. The schema supports module
   references that point to built-in factories (`builtin`) or user supplied modules (`module` +
   `export`).
2. **Registries** – A generic `ModuleRegistry` in `src/core/registry.ts` powers pluggable
   registries for providers, tools, memory, and planners. Each registry registers a set of builtins
   and can dynamically import custom modules relative to the project root.
3. **Provider bootstrap** – `src/core/provider-loader.ts` builds `ChatProvider` instances using
   the registry and returns both the provider map and a configured `ProviderRegistry` for model
   selection policies.
4. **Tool + planner bootstrap** – `src/core/tool-loader.ts`, `src/core/memory-loader.ts`, and
   `src/core/planner-loader.ts` hydrate the corresponding runtime components from configuration.
   The planner loader wraps built-in JSON planning with an orchestrator-powered model caller.
5. **High-level facade** – `src/agent/createAgent.ts` orchestrates the bootstrap pipeline. It
   loads configuration, resolves the requested agent definition, instantiates dependencies,
   applies optional overrides, and returns `{ agent, orchestrator }` for runtime use.

## Alternatives considered

- **Static registries** – Hard-coding tool/provider lookups avoided dynamic imports but prevented
  user extensibility. This was rejected because it contradicts the “config + 5 lines” goal.
- **JSON-only schema** – Embedding the entire agent definition in JSON without module
  references limited extensibility. Allowing module references gives users an escape hatch for
  advanced scenarios while still supporting pure JSON projects.

## Risks and mitigations

- **Runtime import failures** – Dynamic imports can throw at runtime. Registries emit descriptive
  errors that include the specifier, export name, and registry kind to simplify debugging.
- **Configuration drift** – Incorrect config could fail at runtime. `zod` validation plus explicit
  re-validation of agent definitions (`AgentDefinitionSchema.parse`) mitigate silent failures.
- **Performance** – Bootstrapping performs a handful of dynamic imports and object creations
  but happens once per agent instantiation, which is acceptable for CLI and server contexts.

## Testing strategy

- Unit/integration tests load fixture configs and assert that `createAgent` constructs fully working
  agents, including tool execution and error handling for missing providers.
- The minimal example in `examples/minimal-agent` is exercised via `npm run test` to prevent
  regressions in the “5 lines + config” workflow.
