# Configuration reference

Feather agents can now be described declaratively with `feather.config.json`. The schema is
validated by `src/types/config.ts` and loaded by `createAgent`. This document outlines the
structure and supported values.

## Top-level shape

```jsonc
{
  "version": 1,
  "providers": { ... },
  "tools": { ... },
  "agents": { ... },
  "defaults": { "agent": "default" }
}
```

- `version` — Reserved for future breaking changes. Currently only `1` is supported.
- `providers` — Model providers and pricing metadata used for routing.
- `tools` — Reusable tool definitions that agents can reference by name.
- `agents` — One or more named agent definitions.
- `defaults.agent` — Optional default agent identifier when the config defines multiple agents.

## Module references

Many sections accept a **module reference** object:

```jsonc
{
  "builtin": "calc",
  "options": { ... }
}
```

Fields:

- `builtin` — Name of a registered builtin factory. Builtins are documented per section below.
- `module` — Path or package name of a module that exports a factory or instance. Relative paths
  resolve against the config file directory. (Exactly one of `builtin` or `module` is required.)
- `export` — Optional named export to use. Defaults to `default`.
- `options` — Arbitrary data forwarded to the factory when constructing the instance.

Factories receive `(options, context)` where `context.baseDir` is the resolved project root.

## Providers

```
"providers": {
  "policy": "cheapest",
  "entries": {
    "openai": {
      "builtin": "openai",
      "apiKeyEnv": "OPENAI_API_KEY",
      "baseUrl": "https://api.openai.com/v1",
      "pricing": { "inputPer1K": 0.005, "outputPer1K": 0.015 },
      "models": [ { "name": "gpt-4.1-mini", "aliases": ["fast"] } ]
    }
  }
}
```

- `policy` — Provider selection policy (`cheapest`, `roundrobin`, `first`).
- Each provider entry combines module data with optional metadata:
  - `apiKeyEnv`, `baseUrl`, `pricing` — Convenience fields consumed by builtin providers.
  - `models` — List of model metadata exposed to the routing registry.

Builtins:

- `openai` — Uses the environment variable in `apiKeyEnv` (default `OPENAI_API_KEY`).
- `anthropic` — Uses the environment variable in `apiKeyEnv` (default `ANTHROPIC_API_KEY`).

Custom providers can export a `ChatProvider` instance or factory function.

## Tools

Tool definitions can be shared across agents:

```
"tools": {
  "calculator": {
    "builtin": "calc",
    "options": { "name": "math" },
    "planner": {
      "description": "Perform arithmetic.",
      "inputSchema": { "type": "object", "properties": { "expression": { "type": "string" } } }
    }
  }
}
```

Builtins:

- `calc` — Wraps `createCalcTool`. Accepts `CalcToolOptions` under `options`.

The `planner` block customises the tool description fed into the planner prompt.

## Agents

```
"agents": {
  "default": {
    "planner": { "kind": "json", "model": "fast" },
    "memory": { "builtin": "inmemory", "options": { "maxTurns": 50 } },
    "tools": ["calculator"],
    "context": { "maxTokens": 2000, "maxRecentTurns": 8 }
  }
}
```

Required fields:

- `planner` — Either `{ "kind": "json", ... }` for the builtin JSON planner or a module reference.
  - JSON planner options: `model` (required), `provider`, `systemPrompt`, `temperature`,
    `maxTokens`, `topP`, `modelConfig`.
- `memory` — Module reference. Defaults to the builtin `inmemory` manager when omitted.
- `tools` — Array of tool references (string names or inline module references).

Optional fields map to `AgentConfig` properties: `id`, `metadata`, `maxIterations`,
`maxActionsPerPlan`, `policies`, `quotas`, `toolCache`, `shouldStop`, `createMemoryTurn`, and
`context`. The `context` block supports `baseMessages`, `ragMessages`, `digests`, `maxTokens`,
`maxRecentTurns`, and an optional `builder` module reference for custom `ContextBuilder`
implementations.

## Overrides

`createAgent({ overrides })` accepts a subset of `AgentConfig` properties, enabling tests and
applications to swap dependencies (e.g., inject a mock memory manager) without editing config.
