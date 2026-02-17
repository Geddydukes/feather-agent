# Legionaire Dashboard

The Legionaire dashboard offers a visual way to configure providers, tools, and agents. It wraps the same configuration schema used by the runtime and keeps sensitive provider credentials in the browser until you explicitly run an agent.

## Features

- **Provider management:** register built-in or custom provider factories and map them to environment variables.
- **Secure key storage:** API keys are stored in the browser's local storage and are only sent to the server when you run an agent in the dashboard session.
- **Runtime env inputs:** the dashboard detects `*Env` keys in tool options (for example remote adapter settings) and renders additional value fields automatically.
- **Tool presets:** seed tools from curated presets (calculator, web retrieval, data/ETL, sandbox execution, communication, and control-plane templates) so common setups are one click.
- **Remote-ready presets:** adapter-backed presets can use `options.remote` (`baseUrlEnv`/`apiKeyEnv`) so you can connect to platform endpoints with minimal setup.
- **Tool registry editor:** add or remove shared tools, edit planner metadata, and maintain tool `options`/input schema JSON without editing the full config manually.
- **Core runtime tools:** every agent run includes `tool.list` and `tool.call` so planners can discover and route capabilities consistently.
- **Agent controls:** choose the default agent, edit descriptions, and toggle tool access for each agent.
- **Advanced JSON editor:** tweak the full configuration with schema validation powered by the backend.
- **One-click execution:** run prompts directly in the dashboard to verify behaviour before exporting.
- **Download package:** export a runnable `.tar.gz` project bundle based on the current dashboard selections.

## Running the dashboard

```bash
npm run dashboard
```

The command builds the TypeScript sources and starts a lightweight HTTP server on <http://localhost:5173>. When the dashboard starts, it loads `legionaire.config.json` from the project root and keeps it in memory so that you can experiment without modifying the file on disk.

## Local API overview

The dashboard server exposes a couple of JSON endpoints used by the front-end:

| Method | Path           | Description                                                |
|--------|----------------|------------------------------------------------------------|
| GET    | `/api/config`  | Loads and normalises `legionaire.config.json`.                |
| GET    | `/api/tool-presets` | Returns curated preset definitions for tool quick-add. |
| POST   | `/api/validate`| Validates a config object against the schema.              |
| POST   | `/api/run`     | Spins up an agent with the provided config and prompt.     |
| POST   | `/api/export`  | Builds a downloadable `.tar.gz` agent package.             |

All endpoints run locally, enforce a 1MB JSON request limit, and do not persist data.

## Exporting configuration

Use **Download package** to export a ready-to-run project archive that includes:

- `legionaire.config.json` with the selected agent set as default
- `src/run-agent.mjs` runtime script
- `.env.example` derived from configured providers
- scaffold modules for any relative `module` references that need implementation
- deterministic scaffold mapping (reused module references point at one scaffold file)

You can still use **Download config** and **Download sample script** when you only want the raw files.

## Security considerations

- API keys live in `localStorage` under the key `legionaire:apiKeys` (legacy `feather:apiKeys` is also read).
- Keys are only sent to the backend when you click **Execute**.
- The server applies those keys to the current request only and does not mutate global process environment variables.
- Inspect `src/dashboard/server.ts` if you need to adjust the behaviour for your environment.

## Recent implementation notes

- Exported runner scripts now load `.env` automatically when present.
- Dashboard API handlers now return structured 400/413 errors for invalid or oversized request payloads.
- Tool presets are now served by the backend (`/api/tool-presets`) to keep UI defaults in sync with runtime support.
- Tool execution now routes through a strict runtime pipeline (schema validation, allowlist check, redaction, execution, output validation, audit).
- Route-level API dispatch tests cover `/api/export` and payload validation paths.

## Customisation tips

- Extend the `dashboard/public/app.js` file if you want additional form controls for planner configuration, memory settings, or quotas.
- The server is intentionally dependency-free—if you need authentication, add it to `src/dashboard/server.ts`.
- To package the dashboard in production, serve the `dashboard/public` directory with your preferred static host and keep the server endpoint behind your infrastructure of choice.
