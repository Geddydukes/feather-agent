# Migration guide: Config-driven agent bootstrap

This guide helps existing Feather users adopt the new `createAgent` facade while maintaining
backwards compatibility with existing code.

## When to migrate

- You want to instantiate an agent with five lines of code and a config file.
- You maintain multiple environments (dev/staging/prod) and prefer declarative configuration.
- You need to share tool/provider definitions across services or teams.

The legacy manual wiring APIs (`Agent`, `createJsonPlanner`, `ProviderRegistry`, etc.) remain
available. Migrating is optional but recommended for most applications.

## Step 1: Define `feather.config.json`

Create a configuration file at your project root:

```jsonc
{
  "version": 1,
  "providers": {
    "entries": {
      "openai": {
        "builtin": "openai",
        "apiKeyEnv": "OPENAI_API_KEY",
        "models": [
          { "name": "gpt-4.1-mini", "aliases": ["fast"] }
        ]
      }
    }
  },
  "tools": {
    "calculator": { "builtin": "calc" }
  },
  "agents": {
    "default": {
      "planner": { "kind": "json", "model": "fast" },
      "memory": { "builtin": "inmemory" },
      "tools": ["calculator"]
    }
  },
  "defaults": { "agent": "default" }
}
```

See [Configuration reference](configuration.md) for the full schema.

## Step 2: Replace manual bootstrap code

**Before**

```typescript
import { Agent, createJsonPlanner, InMemoryMemoryManager, createCalcTool } from "feather-agent";

const planner = createJsonPlanner({ /* manual wiring */ });
const agent = new Agent({
  id: "assistant",
  planner,
  memory: new InMemoryMemoryManager(),
  tools: [createCalcTool()]
});
```

**After**

```typescript
import { createAgent } from "feather-agent";

const { agent } = await createAgent();
```

`createAgent` automatically hydrates the orchestrator, planner, memory, and tools defined in the
config file. It returns both the `agent` and the underlying `Feather` orchestrator should you need
low-level control.

## Step 3: Apply runtime overrides (optional)

If you previously injected test doubles or custom memory implementations in code, use the
`overrides` option:

```typescript
const { agent } = await createAgent({
  overrides: {
    memory: new InMemoryMemoryManager({ maxTurns: 10 }),
    planner: async () => ({ final: { role: "assistant", content: "stub" } })
  }
});
```

## Step 4: Remove redundant wiring

After migrating, delete manual provider registries, planner definitions, and tool factories that
are now declared in config. Keep environment variables for API keys—they are still read at
runtime when providers are instantiated.

## Compatibility notes

- `createAgent` reads `feather.config.json` by default. Pass `config: "path/to/config.json"` when
  you need a different location or multiple projects.
- Existing exports (`buildRegistry`, `Agent`, `createJsonPlanner`, etc.) remain available for
  advanced scenarios. You can mix the high-level facade with low-level APIs.
- Dynamic imports in config are resolved relative to the config file directory. Ensure paths use
  `.js` extensions when referencing TypeScript sources compiled to ESM.
