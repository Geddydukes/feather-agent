# Configuration reference

Legionaire agents can now be described declaratively with `legionaire.config.json`. The schema is
validated by `src/types/config.ts` and loaded by `createAgent`. This document outlines the
structure and supported values.
The `legionaire` CLI also reads this project config when executing ad-hoc chat requests.
When used by the CLI, configs may omit `agents` entirely (providers-only mode). The agent
bootstrap still requires at least one agent definition.

## Top-level shape

```jsonc
{
  "version": 1,
  "extends": ["./legionaire.base.json"],
  "providers": { ... },
  "tools": { ... },
  "agents": { ... },
  "defaults": {
    "agent": "default",
    "providers": { ... },
    "tools": { ... },
    "agentConfig": { ... }
  }
}
```

- `version` — Reserved for future breaking changes. Currently only `1` is supported.
- `extends` — Optional path(s) to base config files. Objects are deep-merged, arrays replace.
- `providers` — Model providers and pricing metadata used for routing.
- `tools` — Reusable tool definitions that agents can reference by name.
- `agents` — One or more named agent definitions.
- `defaults.agent` — Optional default agent identifier when the config defines multiple agents.
- `defaults.providers` — Optional provider defaults merged into each provider entry.
- `defaults.tools` — Optional tool defaults merged into each tool entry.
- `defaults.agentConfig` — Optional agent defaults merged into each agent definition.

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

Module references can also be shortened to a builtin name string:

```jsonc
"memory": "inmemory"
```

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
- `web.search` — Wraps `createWebSearchTool`. Supports `options.adapter` (module reference) or `options.remote`
  that resolves to a `WebSearchAdapter` (`{ search(request) => Promise<WebSearchResult[]> }`).
  Additional `options` map to `CreateWebSearchToolOptions` (`defaultTopK`, `maxTopK`,
  `minQueryLength`, `maxQueryLength`, `cacheTtlSec`).
- `memory.kv_get` / `memory.kv_set` — Namespaced key-value memory with TTL and size caps.
- `memory.blob_put` / `memory.blob_get` — Blob storage with MIME allowlist and max-size limits.
- `secrets.get` — Scoped secret access (`options.policy` controls `tool_name -> secret names`).
- `audit.log_event` — Append-only audit event writer.
- `schema.validate_json` — Validate arbitrary JSON against JSON Schema with deterministic errors.
- `web.fetch` — URL fetcher with redirect/size/time limits and HTML sanitization (scripts stripped).
- `http.request` — Generic constrained HTTP caller for approved hosts.
- `fs.list` / `fs.read` / `fs.write` — Workspace-rooted filesystem operations with size and extension limits.
- `fs.diff` — Unified diff output between two workspace files.
- `artifact.pack` — Reproducible artifact bundle writer (manifest + hashes + metadata).
- `git.status` / `git.diff` / `git.commit` / `git.branch` — Minimal guarded git operations with no arbitrary command passthrough.
- `doc.parse_pdf` — PDF parsing tool supporting `options.adapter` or `options.remote`.
- `doc.ocr_image` — OCR tool supporting `options.adapter` or `options.remote`.
- `citation.format` — Normalize evidence pointers into citation records + markdown/json rendering.
- `web.browser_session` — Interactive browser tool supporting `options.adapter` or `options.remote`.
- `prompt_injection.scan` — Risk-scoring tool for prompt-injection patterns in untrusted text.
- `redaction.apply` — Generic redaction helper for sensitive keys in payloads.
- `policy.check` — Lightweight risk classifier + required approval hints.
- `allowlist.enforce` — Explicit allowlist scope verification helper.
- `db.query_sql` — Parameterized SQL query tool supporting `options.adapter` or `options.remote`.
- `vector.upsert` / `vector.search` — In-memory vector retrieval primitives for chunk memory and search.
- `etl.csv_read` / `etl.csv_write` — Workspace-scoped CSV ingestion/export with schema and injection guardrails.
- `python.run_sandbox` / `node.run_sandbox` / `shell.run_restricted` — Restricted execution tools with workspace, timeout, output, and allowlist controls.
- `email.search` / `email.send` — Mailbox search/send adapters with confirmation and recipient guardrails.
- `calendar.list` / `calendar.create` / `calendar.update` — Calendar actions with confirmation and attendee guardrails.
- `chat.post_message` — Channel-scoped chat posting with confirmation.
- `connector.invoke` — Generic plugin/app-store invocation interface for approved connector operations.
- `plan.create` / `plan.update` — Structured plan lifecycle tools for task decomposition and progress tracking.
- `task.spawn` — Sub-agent spawning with restricted profile allowlists.
- `budget.get` / `budget.consume` — Session budget inspection and consumption enforcement.

### Remote adapter mode (minimal setup)

Adapter-backed builtins support two modes:

1. `options.adapter` (module reference) for fully custom adapters.
2. `options.remote` for direct platform integration with environment variables.

`options.remote` fields:

- `baseUrl` or `baseUrlEnv` (required)
- `apiKey` or `apiKeyEnv` (optional)
- `apiKeyHeader` (default `Authorization`)
- `apiKeyPrefix` (default `Bearer ` when using `Authorization`)
- `timeoutMs` (optional)
- `headers` (optional string map)
- `paths` (optional operation → path overrides)

Example:

```jsonc
"tools": {
  "remoteSearch": {
    "builtin": "web.search",
    "options": {
      "remote": {
        "baseUrlEnv": "AGENT_PLATFORM_BASE_URL",
        "apiKeyEnv": "AGENT_PLATFORM_API_KEY",
        "paths": {
          "web_search": "/tools/web.search"
        }
      },
      "defaultTopK": 5
    }
  }
}
```

Backend endpoint contract details: [`docs/remote-tool-contract.md`](remote-tool-contract.md)

Core runtime tools:

- `tool.list` and `tool.call` are injected by the agent runtime by default. They are available in
  execution and planner metadata without extra config.
- Every runtime tool call is executed through a fixed pipeline:
  1. input parse + schema validation
  2. allowlist/policy gate
  3. redaction pre-pass
  4. execution
  5. output schema validation
  6. redaction post-pass
  7. audit append
  8. structured response envelope (`request_id`, `ok`, `data/error`, `meta`)

Example `web.search` config:

```jsonc
"tools": {
  "webSearch": {
    "builtin": "web.search",
    "options": {
      "adapter": {
        "module": "./tools/web-search-adapter.js",
        "export": "createWebSearchAdapter"
      },
      "defaultTopK": 5,
      "maxTopK": 8
    }
  }
}
```

The `planner` block customises the tool description fed into the planner prompt.

Tool entries can also be shortened to builtin names:

```
"tools": {
  "calculator": "calc"
}
```

## Agents

```
"agents": {
  "default": {
    "planner": { "model": "fast" },
    "memory": "inmemory",
    "tools": ["calculator"],
    "context": { "maxTokens": 2000, "maxRecentTurns": 8 }
  }
}
```

Required fields:

- `planner` — Either `{ "model": "...", ... }` (shorthand for the builtin JSON planner) or a module reference.
  - JSON planner options: `model` (required), `provider`, `systemPrompt`, `temperature`,
    `maxTokens`, `topP`, `modelConfig`.
- `memory` — Module reference. Defaults to the builtin `inmemory` manager when omitted.
- `tools` — Array of tool references. String entries first match shared tools, then builtin tools.

Optional fields map to `AgentConfig` properties: `id`, `metadata`, `maxIterations`,
`maxActionsPerPlan`, `policies`, `quotas`, `toolCache`, `shouldStop`, `createMemoryTurn`, and
`context`. The `context` block supports `baseMessages`, `ragMessages`, `digests`, `maxTokens`,
`maxRecentTurns`, and an optional `builder` module reference for custom `ContextBuilder`
implementations.

## Defaults

Defaults are merged into each entry before validation. This makes it easy to keep per-domain
configs short:

```jsonc
// legionaire.base.json
{
  "providers": {
    "entries": {
      "openai": {
        "builtin": "openai",
        "apiKeyEnv": "OPENAI_API_KEY",
        "models": [{ "name": "gpt-4.1-mini", "aliases": ["fast"] }]
      }
    }
  },
  "defaults": {
    "agentConfig": {
      "planner": { "model": "fast" },
      "memory": "inmemory",
      "tools": ["calc"]
    }
  }
}
```

```jsonc
// legionaire.config.json
{
  "extends": "./legionaire.base.json",
  "agents": {
    "default": {
      "id": "support-bot",
      "planner": { "systemPrompt": "You help with support tasks." }
    }
  },
  "defaults": { "agent": "default" }
}
```

## Array append/remove operators

When using `extends`, arrays are replaced by default. To append without repeating the base
array, use the `+` suffix on the key:

```jsonc
{
  "extends": "./legionaire.base.json",
  "providers": {
    "entries": {
      "openai": {
        "models+": [{ "name": "gpt-4.1-mini", "aliases": ["fast"] }]
      }
    }
  }
}
```

To remove entries from a base array, use the `-` suffix. If the array contains objects with
`name` fields, removal matches by `name`; otherwise, entries are removed by value.

```jsonc
{
  "extends": "./legionaire.base.json",
  "providers": {
    "entries": {
      "openai": {
        "models-": [{ "name": "gpt-4o-mini" }]
      }
    }
  }
}
```

The `+`/`-` operators only work with arrays and are removed during merge.

## Overrides

`createAgent({ overrides })` accepts a subset of `AgentConfig` properties, enabling tests and
applications to swap dependencies (e.g., inject a mock memory manager) without editing config.
