# Legionaire Agent Framework Overview

This document summarizes the production-ready agent framework that now ships with Legionaire. It highlights the major subsystems, their responsibilities, and where to find deeper documentation or code examples.

## Agent Execution Loop
- Location: [`src/agent/Agent.ts`](../src/agent/Agent.ts)
- Responsibilities: orchestrates plan → act → observe cycles, emits detailed lifecycle events, enforces iteration limits, and writes conversation turns to configured memory backends.
- Highlights: planner JSON validation, guarded tool invocation with quotas and policies, tool cache integration, telemetry hooks, and final result normalization.

## Planning & Tools
- Planner prompt and parsing utilities live in [`src/agent/planner.ts`](../src/agent/planner.ts) with validation helpers in [`src/agent/plan.ts`](../src/agent/plan.ts).
- Built-in tools:
  - [`calc`](../src/tools/calc.ts): deterministic math evaluator with expression validation and sandboxing.
  - [`web.search`](../src/tools/webSearch.ts): provider-agnostic search bridge with query sanitization and schema-checked results.
  - [`memory.kv_get` / `memory.kv_set`](../src/tools/platform.ts): namespaced key-value memory primitives with TTL and size controls.
  - [`memory.blob_put` / `memory.blob_get`](../src/tools/platform.ts): guarded blob storage primitives for larger artifacts.
  - [`secrets.get`](../src/tools/platform.ts): scoped secret access by tool policy mapping.
  - [`audit.log_event`](../src/tools/platform.ts): append-only audit event sink.
  - [`tool.list` / `tool.call`](../src/tools/runtime.ts): discovery + unified execution wrapper routed through the runtime pipeline.
  - [`schema.validate_json`, `web.fetch`, `http.request`, `fs.list/read/write`, `artifact.pack`](../src/tools/ops.ts): core validation, web, filesystem, and packaging primitives with guardrails.
  - [`fs.diff`, `git.status/diff/commit/branch`](../src/tools/dev.ts): guarded builder/dev workspace operations.
  - [`doc.parse_pdf`, `doc.ocr_image`, `citation.format`](../src/tools/docs.ts): document ingestion adapters and citation formatting primitives.
  - [`web.browser_session`](../src/tools/browser.ts): interactive browser automation via sandbox adapters.
  - [`prompt_injection.scan`, `redaction.apply`, `policy.check`, `allowlist.enforce`](../src/tools/governance.ts): explicit safety/governance primitives.
  - [`db.query_sql`, `vector.upsert/search`, `etl.csv_read/write`](../src/tools/data.ts): structured data access, retrieval memory, and CSV ETL primitives.
  - [`python.run_sandbox`, `node.run_sandbox`, `shell.run_restricted`](../src/tools/execution.ts): high-power execution tools with workspace/timeout/allowlist guardrails.
  - [`email.search/send`, `calendar.list/create/update`, `chat.post_message`](../src/tools/communication.ts): communication workflows gated by allowlists and human confirmation.
  - [`connector.invoke`](../src/tools/connectors.ts): approved plugin/API invocation surface.
  - [`plan.create/update`, `task.spawn`, `budget.get/consume`](../src/tools/control.ts): control-plane primitives for planning, sub-agent delegation, and budget enforcement.
  - [`remote-adapters`](../src/tools/remote-adapters.ts): reusable HTTP bridge factories so adapter-backed tools can be configured with base URL + API key env variables.
  - [`withToolCache`](../src/tools/cache.ts): caching helper that wraps expensive tools while respecting guardrails.
- Tool typings and runtime contracts (`ToolManifest`, allowlist, audit, safety scanning, response envelopes) reside under [`src/tools`](../src/tools) and are re-exported via [`src/tools/index.ts`](../src/tools/index.ts).

## Memory & Context
- Core interfaces: [`src/memory/types.ts`](../src/memory/types.ts).
- Backends:
  - In-memory: [`src/memory/inmemory.ts`](../src/memory/inmemory.ts)
  - Redis: [`src/memory/redis.ts`](../src/memory/redis.ts)
  - Postgres: [`src/memory/postgres.ts`](../src/memory/postgres.ts) with migrations in [`db/migrations/001_create_agent_memory.sql`](../db/migrations/001_create_agent_memory.sql)
- Compliance layers: [`src/memory/redaction.ts`](../src/memory/redaction.ts) and [`src/memory/audit.ts`](../src/memory/audit.ts).
- Context builder: [`src/agent/context-builder.ts`](../src/agent/context-builder.ts) composes recent turns, summaries, digests, and RAG snippets under configurable token budgets.
- Token counting: [`src/memory/tokenizer.ts`](../src/memory/tokenizer.ts) provides deterministic estimation without external dependencies.

## Guardrails & Quotas
- Policy enforcement and validation live in [`src/agent/policies.ts`](../src/agent/policies.ts).
- In-memory quota manager: [`src/agent/quotas.ts`](../src/agent/quotas.ts)
- Redis-backed quota manager: [`src/agent/quotas-redis.ts`](../src/agent/quotas-redis.ts)
- Guardrail tests: [`tests/agent/guardrails.test.ts`](../tests/agent/guardrails.test.ts)

## Caching
- Prompt cache middleware and helpers reside in [`src/core/prompt-cache.ts`](../src/core/prompt-cache.ts) and [`src/core/middleware/promptCache.ts`](../src/core/middleware/promptCache.ts), with key hashing in [`src/core/prompt-key.ts`](../src/core/prompt-key.ts).
- Tool cache implementation is in [`src/core/tool-cache.ts`](../src/core/tool-cache.ts) and the tool wrapper in [`src/tools/cache.ts`](../src/tools/cache.ts).

## Telemetry & Observability
- Event emitters and NDJSON trace helpers: [`src/telemetry/events.ts`](../src/telemetry/events.ts)
- OpenTelemetry bridge: [`src/telemetry/otel.ts`](../src/telemetry/otel.ts)
- Example dashboards and scripts: [`examples/observability.ts`](../examples/observability.ts) and [`examples/observability-dashboard.json`](../examples/observability-dashboard.json)
- Trace replay utility: [`scripts/replay.ts`](../scripts/replay.ts)

## Documentation & Examples
- Quick start: [`docs/quick-start.md`](quick-start.md)
- Memory guide: [`docs/memory.md`](memory.md)
- Prompt caching: [`docs/prompt-caching.md`](prompt-caching.md)
- Policies & quotas: [`docs/policies-quotas.md`](policies-quotas.md)
- Observability: [`docs/observability.md`](observability.md)
- Troubleshooting: [`docs/troubleshooting.md`](troubleshooting.md)
- Remote endpoint contract: [`docs/remote-tool-contract.md`](remote-tool-contract.md)
- Tool caching example: [`examples/tool-cache.ts`](../examples/tool-cache.ts)

## Testing Infrastructure
- Agent loop and planner suites: [`tests/agent/*.test.ts`](../tests/agent)
- Memory backends: [`tests/memory/*.test.ts`](../tests/memory)
- Caching and middleware: [`tests/core/*.test.ts`](../tests/core)
- Telemetry collectors: [`tests/telemetry/*.test.ts`](../tests/telemetry)
- Mock infrastructure: [`tests/helpers`](../tests/helpers)

Refer to these entry points to navigate the codebase quickly when making changes or onboarding new contributors.
