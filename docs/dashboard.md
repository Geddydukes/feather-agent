# Feather Agent Dashboard

The Feather dashboard offers a visual way to configure providers, tools, and agents. It wraps the same configuration schema used by the runtime and keeps sensitive provider credentials in the browser until you explicitly run an agent.

## Features

- **Provider management:** register built-in or custom provider factories and map them to environment variables.
- **Secure key storage:** API keys are stored in the browser's local storage and are only sent to the server when you run an agent in the dashboard session.
- **Tool registry editor:** add or remove shared tools and edit planner metadata without editing JSON manually.
- **Agent controls:** choose the default agent, edit descriptions, and toggle tool access for each agent.
- **Advanced JSON editor:** tweak the full configuration with schema validation powered by the backend.
- **One-click execution:** run prompts directly in the dashboard to verify behaviour before exporting.
- **Download bundle:** export the current configuration and a ready-to-run TypeScript script for use in your own project.

## Running the dashboard

```bash
npm run dashboard
```

The command builds the TypeScript sources and starts a lightweight HTTP server on <http://localhost:5173>. When the dashboard starts, it loads `feather.config.json` from the project root and keeps it in memory so that you can experiment without modifying the file on disk.

## Local API overview

The dashboard server exposes a couple of JSON endpoints used by the front-end:

| Method | Path           | Description                                                |
|--------|----------------|------------------------------------------------------------|
| GET    | `/api/config`  | Loads and normalises `feather.config.json`.                |
| POST   | `/api/validate`| Validates a config object against the schema.              |
| POST   | `/api/run`     | Spins up an agent with the provided config and prompt.     |

All endpoints run locally and do not persist data.

## Exporting configuration

Use the **Download config** button to export the current JSON file and **Download sample script** to grab a ready-made `run-agent.ts` script. The script expects the config file to live alongside it and uses the selected agent ID.

## Security considerations

- API keys live in `localStorage` under the key `feather:apiKeys`.
- Keys are only sent to the backend when you click **Execute**.
- The server temporarily injects those keys into environment variables while the agent runs and removes them immediately afterward.
- Inspect `src/dashboard/server.ts` if you need to adjust the behaviour for your environment.

## Customisation tips

- Extend the `dashboard/public/app.js` file if you want additional form controls for planner configuration, memory settings, or quotas.
- The server is intentionally dependency-free—if you need authentication, add it to `src/dashboard/server.ts`.
- To package the dashboard in production, serve the `dashboard/public` directory with your preferred static host and keep the server endpoint behind your infrastructure of choice.
