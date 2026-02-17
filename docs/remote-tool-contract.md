# Remote Tool Contract

This document defines the backend contract for `options.remote` tool integrations.  
It is the implementation target for your platform endpoints.

## Purpose

When a tool is configured with:

```jsonc
{
  "builtin": "web.search",
  "options": {
    "remote": {
      "baseUrlEnv": "AGENT_PLATFORM_BASE_URL",
      "apiKeyEnv": "AGENT_PLATFORM_API_KEY",
      "paths": { "web_search": "/tools/web.search" }
    }
  }
}
```

the framework sends HTTP `POST` requests to your backend instead of loading local adapter modules.

## Request format

- Method: `POST`
- URL: `baseUrl + resolved path`
- Headers:
  - `content-type: application/json`
  - auth header (if `apiKey`/`apiKeyEnv` set):
    - default header: `Authorization`
    - default value prefix: `Bearer `
    - override via `apiKeyHeader` / `apiKeyPrefix`
- Body: JSON object matching the adapter request payload for that tool.

## Response format

Two response shapes are supported:

1. Direct tool payload:
```json
{ "...": "tool-specific fields" }
```

2. Tool envelope payload:
```json
{
  "ok": true,
  "data": { "...": "tool-specific fields" }
}
```

If envelope form uses `ok: false`, the client treats it as failure and reads `error.message` when present.

## Error handling

- Non-2xx HTTP status is treated as failure.
- For non-2xx responses, return JSON like:
```json
{ "error": "explanation" }
```
- Keep errors concise and non-sensitive.

## Remote path keys

Set these in `options.remote.paths` as needed:

- `web_search` -> `web.search`
- `doc_parse_pdf` -> `doc.parse_pdf`
- `doc_ocr_image` -> `doc.ocr_image`
- `web_browser_session` -> `web.browser_session`
- `db_query_sql` -> `db.query_sql`
- `email_search` -> `email.search`
- `email_send` -> `email.send`
- `calendar_list` -> `calendar.list`
- `calendar_create` -> `calendar.create`
- `calendar_update` -> `calendar.update`
- `chat_post_message` -> `chat.post_message`
- `connector_invoke` -> `connector.invoke`
- `task_spawn` -> `task.spawn`

If omitted, defaults are `/tools/<builtin-name>`.

## Minimum response fields by endpoint

- `web.search`: array of results or `{ results: [...] }`
- `doc.parse_pdf`: `{ pages: [...] }`
- `doc.ocr_image`: `{ text: "..." }`
- `web.browser_session`: object payload (session/final URL/actions)
- `db.query_sql`: `{ rows: [...] }`
- `email.search`: `{ messages: [...] }`
- `email.send`: `{ message_id: "..." }`
- `calendar.list`: `{ events: [...] }`
- `calendar.create`: `{ event_id: "..." }`
- `calendar.update`: `{ event_id: "..." }`
- `chat.post_message`: `{ message_id: "..." }`
- `connector.invoke`: `{ ok: boolean, ... }`
- `task.spawn`: `{ task_id: "..." }`

## Security baseline

- Enforce your own allowlist and policy checks server-side.
- Verify auth on every endpoint.
- Redact secrets from logs.
- Apply request size/time limits and structured audit logs.

## Example backend handler pattern

```ts
app.post("/tools/web.search", async (req, res) => {
  try {
    const { query, topK } = req.body;
    const results = await searchProvider(query, topK);
    res.json({ ok: true, data: results });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});
```
