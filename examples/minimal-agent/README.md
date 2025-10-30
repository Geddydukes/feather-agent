# Minimal agent example

This example demonstrates the new config-driven bootstrap flow. Provide an `OPENAI_API_KEY`
and run the script with `tsx` or `node` (Node 18+):

```bash
export OPENAI_API_KEY=sk-...
npx tsx index.ts   # or use ts-node/your preferred TS runner
```

The script is intentionally tiny (three lines) and relies entirely on `feather.config.json` for
providers, planner, memory, and tool configuration.
