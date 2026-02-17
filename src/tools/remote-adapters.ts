import type { BrowserSessionAdapter } from "./browser.js";
import type { ConnectorInvokeAdapter } from "./connectors.js";
import type { TaskSpawnAdapter } from "./control.js";
import type { SqlQueryAdapter } from "./data.js";
import type { OcrAdapter, PdfParserAdapter } from "./docs.js";
import type { EmailAdapter, CalendarAdapter, ChatAdapter } from "./communication.js";
import type { WebSearchAdapter } from "./webSearch.js";

const DEFAULT_TIMEOUT_MS = 20_000;

export interface RemoteAdapterOptions {
  baseUrl?: string;
  baseUrlEnv?: string;
  apiKey?: string;
  apiKeyEnv?: string;
  apiKeyHeader?: string;
  apiKeyPrefix?: string;
  timeoutMs?: number;
  headers?: Record<string, string>;
  paths?: Record<string, string>;
  getEnv?: (key: string) => string | undefined;
  fetchImpl?: typeof fetch;
}

interface RemoteClient {
  request(pathKey: string, fallbackPath: string, body: unknown, signal?: AbortSignal): Promise<unknown>;
}

export function createRemoteWebSearchAdapter(options: RemoteAdapterOptions): WebSearchAdapter {
  const client = createRemoteClient(options);
  return {
    async search(request) {
      const payload = unwrapToolEnvelope(await client.request("web_search", "/tools/web.search", request, request.signal));
      if (Array.isArray(payload)) {
        return payload as ReturnType<WebSearchAdapter["search"]> extends Promise<infer T> ? T : never;
      }
      if (payload && typeof payload === "object" && Array.isArray((payload as { results?: unknown[] }).results)) {
        return (payload as { results: unknown[] }).results as ReturnType<WebSearchAdapter["search"]> extends Promise<infer T> ? T : never;
      }
      throw new Error("Remote web search adapter response must be an array or { results: [] }");
    },
  };
}

export function createRemotePdfParserAdapter(options: RemoteAdapterOptions): PdfParserAdapter {
  const client = createRemoteClient(options);
  return {
    async parse(request) {
      const payload = unwrapToolEnvelope(await client.request("doc_parse_pdf", "/tools/doc.parse_pdf", request, request.signal));
      if (!payload || typeof payload !== "object" || !Array.isArray((payload as { pages?: unknown[] }).pages)) {
        throw new Error("Remote PDF adapter response must include pages[]");
      }
      return payload as ReturnType<PdfParserAdapter["parse"]> extends Promise<infer T> ? T : never;
    },
  };
}

export function createRemoteOcrAdapter(options: RemoteAdapterOptions): OcrAdapter {
  const client = createRemoteClient(options);
  return {
    async ocr(request) {
      const payload = unwrapToolEnvelope(await client.request("doc_ocr_image", "/tools/doc.ocr_image", request, request.signal));
      if (!payload || typeof payload !== "object" || typeof (payload as { text?: unknown }).text !== "string") {
        throw new Error("Remote OCR adapter response must include text");
      }
      return payload as ReturnType<OcrAdapter["ocr"]> extends Promise<infer T> ? T : never;
    },
  };
}

export function createRemoteBrowserSessionAdapter(options: RemoteAdapterOptions): BrowserSessionAdapter {
  const client = createRemoteClient(options);
  return {
    async runSession(request) {
      const payload = unwrapToolEnvelope(await client.request("web_browser_session", "/tools/web.browser_session", request, request.signal));
      if (!payload || typeof payload !== "object") {
        throw new Error("Remote browser adapter response must be an object");
      }
      return payload as ReturnType<BrowserSessionAdapter["runSession"]> extends Promise<infer T> ? T : never;
    },
  };
}

export function createRemoteSqlAdapter(options: RemoteAdapterOptions): SqlQueryAdapter {
  const client = createRemoteClient(options);
  return {
    async query(request) {
      const payload = unwrapToolEnvelope(await client.request("db_query_sql", "/tools/db.query_sql", request, request.signal));
      if (!payload || typeof payload !== "object" || !Array.isArray((payload as { rows?: unknown[] }).rows)) {
        throw new Error("Remote SQL adapter response must include rows[]");
      }
      return payload as ReturnType<SqlQueryAdapter["query"]> extends Promise<infer T> ? T : never;
    },
  };
}

export function createRemoteEmailAdapter(options: RemoteAdapterOptions): EmailAdapter {
  const client = createRemoteClient(options);
  return {
    async search(request) {
      const payload = unwrapToolEnvelope(await client.request("email_search", "/tools/email.search", request, request.signal));
      if (!payload || typeof payload !== "object" || !Array.isArray((payload as { messages?: unknown[] }).messages)) {
        throw new Error("Remote email.search response must include messages[]");
      }
      return payload as ReturnType<EmailAdapter["search"]> extends Promise<infer T> ? T : never;
    },
    async send(request) {
      const payload = unwrapToolEnvelope(await client.request("email_send", "/tools/email.send", request, request.signal));
      if (!payload || typeof payload !== "object" || typeof (payload as { message_id?: unknown }).message_id !== "string") {
        throw new Error("Remote email.send response must include message_id");
      }
      return payload as ReturnType<EmailAdapter["send"]> extends Promise<infer T> ? T : never;
    },
  };
}

export function createRemoteCalendarAdapter(options: RemoteAdapterOptions): CalendarAdapter {
  const client = createRemoteClient(options);
  return {
    async list(request) {
      const payload = unwrapToolEnvelope(await client.request("calendar_list", "/tools/calendar.list", request, request.signal));
      if (!payload || typeof payload !== "object" || !Array.isArray((payload as { events?: unknown[] }).events)) {
        throw new Error("Remote calendar.list response must include events[]");
      }
      return payload as ReturnType<CalendarAdapter["list"]> extends Promise<infer T> ? T : never;
    },
    async create(request) {
      const payload = unwrapToolEnvelope(await client.request("calendar_create", "/tools/calendar.create", request, request.signal));
      if (!payload || typeof payload !== "object" || typeof (payload as { event_id?: unknown }).event_id !== "string") {
        throw new Error("Remote calendar.create response must include event_id");
      }
      return payload as ReturnType<CalendarAdapter["create"]> extends Promise<infer T> ? T : never;
    },
    async update(request) {
      const payload = unwrapToolEnvelope(await client.request("calendar_update", "/tools/calendar.update", request, request.signal));
      if (!payload || typeof payload !== "object" || typeof (payload as { event_id?: unknown }).event_id !== "string") {
        throw new Error("Remote calendar.update response must include event_id");
      }
      return payload as ReturnType<CalendarAdapter["update"]> extends Promise<infer T> ? T : never;
    },
  };
}

export function createRemoteChatAdapter(options: RemoteAdapterOptions): ChatAdapter {
  const client = createRemoteClient(options);
  return {
    async postMessage(request) {
      const payload = unwrapToolEnvelope(await client.request("chat_post_message", "/tools/chat.post_message", request, request.signal));
      if (!payload || typeof payload !== "object" || typeof (payload as { message_id?: unknown }).message_id !== "string") {
        throw new Error("Remote chat.post_message response must include message_id");
      }
      return payload as ReturnType<ChatAdapter["postMessage"]> extends Promise<infer T> ? T : never;
    },
  };
}

export function createRemoteConnectorAdapter(options: RemoteAdapterOptions): ConnectorInvokeAdapter {
  const client = createRemoteClient(options);
  return {
    async invoke(request) {
      const payload = unwrapToolEnvelope(await client.request("connector_invoke", "/tools/connector.invoke", request, request.signal));
      if (!payload || typeof payload !== "object" || typeof (payload as { ok?: unknown }).ok !== "boolean") {
        throw new Error("Remote connector.invoke response must include ok:boolean");
      }
      return payload as ReturnType<ConnectorInvokeAdapter["invoke"]> extends Promise<infer T> ? T : never;
    },
  };
}

export function createRemoteTaskSpawnerAdapter(options: RemoteAdapterOptions): TaskSpawnAdapter {
  const client = createRemoteClient(options);
  return {
    async spawn(request) {
      const payload = unwrapToolEnvelope(await client.request("task_spawn", "/tools/task.spawn", request, request.signal));
      if (!payload || typeof payload !== "object" || typeof (payload as { task_id?: unknown }).task_id !== "string") {
        throw new Error("Remote task.spawn response must include task_id");
      }
      return payload as ReturnType<TaskSpawnAdapter["spawn"]> extends Promise<infer T> ? T : never;
    },
  };
}

function createRemoteClient(options: RemoteAdapterOptions): RemoteClient {
  const fetchImpl = options.fetchImpl ?? fetch;
  const getEnv = options.getEnv ?? ((key: string) => process.env[key]);
  const baseUrlRaw = options.baseUrl ?? (options.baseUrlEnv ? getEnv(options.baseUrlEnv) : undefined);
  const baseUrl = normalizeBaseUrl(baseUrlRaw);
  const apiKey = options.apiKey ?? (options.apiKeyEnv ? getEnv(options.apiKeyEnv) : undefined);
  const apiKeyHeader = options.apiKeyHeader?.trim() || "Authorization";
  const apiKeyPrefix = options.apiKeyPrefix ?? (apiKeyHeader.toLowerCase() === "authorization" ? "Bearer " : "");
  const timeoutMs = validTimeout(options.timeoutMs);
  const headers = cleanHeaders(options.headers);

  return {
    async request(pathKey: string, fallbackPath: string, body: unknown, signal?: AbortSignal): Promise<unknown> {
      const configuredPath = options.paths?.[pathKey];
      const endpointPath = normalizePath(configuredPath ?? fallbackPath);
      const url = new URL(endpointPath, baseUrl).toString();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(new Error(`Remote adapter request timed out (${timeoutMs}ms)`)), timeoutMs);
      const mergedSignal = mergeAbortSignals(signal, controller.signal);
      try {
        const requestHeaders: Record<string, string> = {
          "content-type": "application/json",
          ...headers,
        };
        if (apiKey) {
          requestHeaders[apiKeyHeader] = `${apiKeyPrefix}${apiKey}`;
        }
        const response = await fetchImpl(url, {
          method: "POST",
          headers: requestHeaders,
          body: JSON.stringify(body ?? {}),
          signal: mergedSignal,
        });
        const raw = await response.text();
        const payload = parseJson(raw);
        if (!response.ok) {
          const detail = payload && typeof payload === "object" && "error" in payload
            ? String((payload as { error?: unknown }).error)
            : raw.slice(0, 500) || `HTTP ${response.status}`;
          throw new Error(`Remote adapter request failed (${response.status}): ${detail}`);
        }
        return payload;
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}

function normalizeBaseUrl(input: string | undefined): string {
  const value = input?.trim();
  if (!value) {
    throw new Error("Remote adapter requires baseUrl or baseUrlEnv");
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch (error) {
    throw new Error(`Invalid remote base URL "${value}": ${(error as Error).message}`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(`Remote adapter base URL must use http/https. Received "${url.protocol}"`);
  }
  return url.toString().endsWith("/") ? url.toString() : `${url.toString()}/`;
}

function normalizePath(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("Remote adapter path cannot be empty");
  }
  return trimmed.startsWith("/") ? trimmed.slice(1) : trimmed;
}

function validTimeout(input: number | undefined): number {
  if (typeof input !== "number" || !Number.isFinite(input) || input <= 0) {
    return DEFAULT_TIMEOUT_MS;
  }
  return Math.floor(input);
}

function cleanHeaders(input: Record<string, string> | undefined): Record<string, string> {
  if (!input || typeof input !== "object") {
    return {};
  }
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    const header = key.trim();
    if (!header || typeof value !== "string") {
      continue;
    }
    headers[header] = value;
  }
  return headers;
}

function parseJson(raw: string): unknown {
  if (!raw.trim()) {
    return {};
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch (error) {
    throw new Error(`Remote adapter expected JSON response: ${(error as Error).message}`);
  }
}

function unwrapToolEnvelope(payload: unknown): unknown {
  if (!payload || typeof payload !== "object") {
    return payload;
  }
  const value = payload as {
    ok?: unknown;
    data?: unknown;
    error?: unknown;
  };
  if (typeof value.ok !== "boolean") {
    return payload;
  }
  if (value.ok) {
    return value.data;
  }
  if (value.error && typeof value.error === "object" && "message" in (value.error as Record<string, unknown>)) {
    throw new Error(String((value.error as { message?: unknown }).message ?? "Remote tool call failed"));
  }
  throw new Error(typeof value.error === "string" ? value.error : "Remote tool call failed");
}

function mergeAbortSignals(signalA?: AbortSignal, signalB?: AbortSignal): AbortSignal | undefined {
  if (!signalA) return signalB;
  if (!signalB) return signalA;
  if (signalA.aborted) return signalA;
  if (signalB.aborted) return signalB;
  const controller = new AbortController();
  const abort = (reason: unknown) => controller.abort(reason);
  signalA.addEventListener("abort", () => abort(signalA.reason), { once: true });
  signalB.addEventListener("abort", () => abort(signalB.reason), { once: true });
  return controller.signal;
}
