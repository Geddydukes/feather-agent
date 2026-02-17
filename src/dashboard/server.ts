import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

import { createAgent } from "../agent/createAgent.js";
import { FeatherProjectConfigSchema, type FeatherProjectConfig } from "../types/config.js";
import { loadProjectConfig } from "../core/config-loader.js";
import { buildAgentPackage } from "./exporter.js";
import { listDashboardToolPresets } from "./tool-presets.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../../..");
const publicDir = path.resolve(projectRoot, "dashboard/public");
const defaultConfigPaths = [
  path.resolve(projectRoot, "legionaire.config.json"),
  path.resolve(projectRoot, "feather.config.json"),
];

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
};

type RequestHandler = (req: IncomingMessage, res: ServerResponse) => Promise<void>;
const MAX_JSON_BODY_BYTES = 1024 * 1024;

export interface DashboardApiDispatchRequest {
  method: string;
  pathname: string;
  body?: string;
}

export interface DashboardApiDispatchResponse {
  status: number;
  headers?: Record<string, string>;
  json?: unknown;
  body?: Buffer;
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "HttpError";
  }
}

function setCorsHeaders(res: ServerResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

async function readRequestBodyText(req: IncomingMessage, maxBytes = MAX_JSON_BODY_BYTES): Promise<string> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of req) {
    const data = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
    total += data.length;
    if (total > maxBytes) {
      throw new HttpError(413, `Request body exceeds ${maxBytes} bytes`);
    }
    chunks.push(data);
  }
  return chunks.length === 0 ? "" : Buffer.concat(chunks).toString("utf8");
}

async function parseJsonBody(req: IncomingMessage, maxBytes = MAX_JSON_BODY_BYTES): Promise<any> {
  const raw = await readRequestBodyText(req, maxBytes);
  return parseJsonText(raw, maxBytes);
}

function parseJsonText(raw: string, maxBytes = MAX_JSON_BODY_BYTES): unknown {
  const byteLength = Buffer.byteLength(raw, "utf8");
  if (byteLength > maxBytes) {
    throw new HttpError(413, `Request body exceeds ${maxBytes} bytes`);
  }
  if (!raw.trim()) {
    return undefined;
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new HttpError(400, `Failed to parse request body: ${(error as Error).message}`);
  }
}

async function handleGetConfig(_req: IncomingMessage, res: ServerResponse) {
  try {
    const { config } = await loadDefaultDashboardConfig();
    sendJson(res, 200, config);
  } catch (error) {
    sendJson(res, 500, { error: (error as Error).message });
  }
}

async function handleRunAgent(req: IncomingMessage, res: ServerResponse) {
  try {
    const body = await parseJsonBody(req);
    const result = await runAgentFromBody(body);
    sendJson(res, 200, { result });
  } catch (error) {
    handleRouteError(res, error);
  }
}

async function serveStatic(req: IncomingMessage, res: ServerResponse, urlPath: string) {
  const resolvedPath = urlPath === "/" ? path.join(publicDir, "index.html") : path.join(publicDir, urlPath);
  try {
    const fileStat = await stat(resolvedPath);
    if (fileStat.isDirectory()) {
      await sendFile(res, path.join(resolvedPath, "index.html"));
      return;
    }
    await sendFile(res, resolvedPath);
  } catch {
    res.statusCode = 404;
    res.end("Not Found");
  }
}

async function sendFile(res: ServerResponse, filePath: string) {
  try {
    const content = await readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const type = CONTENT_TYPES[ext] ?? "application/octet-stream";
    res.statusCode = 200;
    res.setHeader("Content-Type", type);
    res.end(content);
  } catch (error) {
    res.statusCode = 500;
    res.end((error as Error).message);
  }
}

function sendJson(res: ServerResponse, status: number, payload: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload, null, 2));
}

async function handleValidateConfig(req: IncomingMessage, res: ServerResponse) {
  try {
    const body = await parseJsonBody(req);
    const validated = validateConfigFromBody(body);
    sendJson(res, 200, { config: validated });
  } catch (error) {
    handleRouteError(res, error);
  }
}

async function handleExportPackage(req: IncomingMessage, res: ServerResponse) {
  try {
    const body = await parseJsonBody(req);
    const result = exportPackageFromBody(body);

    res.statusCode = 200;
    res.setHeader("Content-Type", result.mimeType);
    res.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
    res.end(result.archive);
  } catch (error) {
    handleRouteError(res, error);
  }
}

const routes: Record<string, RequestHandler> = {
  "GET /api/config": handleGetConfig,
  "GET /api/tool-presets": async (_req, res) => sendJson(res, 200, { presets: listDashboardToolPresets() }),
  "POST /api/run": handleRunAgent,
  "POST /api/validate": handleValidateConfig,
  "POST /api/export": handleExportPackage,
};

function ensureBodyObject(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== "object") {
    throw new HttpError(400, "Request body must be a JSON object");
  }
  return body as Record<string, unknown>;
}

function validateConfigFromBody(body: unknown): FeatherProjectConfig {
  const payload = ensureBodyObject(body);
  const { config } = payload as { config?: FeatherProjectConfig };
  if (!config) {
    throw new HttpError(400, "Missing 'config' in request body");
  }
  return FeatherProjectConfigSchema.parse(config);
}

function exportPackageFromBody(body: unknown) {
  const payload = ensureBodyObject(body);
  const { agent, packageName } = payload as { agent?: string; packageName?: string };
  const config = validateConfigFromBody(payload);
  return buildAgentPackage({
    config,
    agent,
    packageName,
  });
}

async function runAgentFromBody(body: unknown) {
  const payload = ensureBodyObject(body);
  const { agent, prompt, apiKeys } = payload as {
    agent?: string;
    prompt?: string;
    apiKeys?: Record<string, string>;
  };
  if (!prompt || typeof prompt !== "string") {
    throw new HttpError(400, "Missing 'prompt' in request body");
  }
  const config = validateConfigFromBody(payload);
  const requestEnv = createRequestEnv(apiKeys);
  const { agent: agentInstance } = await createAgent({
    config,
    agent,
    env: (key) => requestEnv.get(key) ?? process.env[key],
  });
  const sessionId = randomUUID();
  return agentInstance.run({
    sessionId,
    input: { role: "user", content: prompt },
  });
}

function createRequestEnv(apiKeys: Record<string, string> | undefined): Map<string, string> {
  const entries = new Map<string, string>();
  if (!apiKeys || typeof apiKeys !== "object") {
    return entries;
  }
  for (const [key, value] of Object.entries(apiKeys)) {
    if (typeof key !== "string" || typeof value !== "string") {
      continue;
    }
    const trimmedKey = key.trim();
    if (!trimmedKey || !value) {
      continue;
    }
    entries.set(trimmedKey, value);
  }
  return entries;
}

function handleRouteError(res: ServerResponse, error: unknown): void {
  if (error instanceof HttpError) {
    sendJson(res, error.status, { error: error.message });
    return;
  }
  if (isZodErrorLike(error)) {
    sendJson(res, 400, {
      error: error.issues[0]?.message ?? error.message,
      issues: error.issues,
    });
    return;
  }
  const message = error instanceof Error ? error.message : String(error);
  sendJson(res, 500, { error: message });
}

function toDispatchError(error: unknown): DashboardApiDispatchResponse {
  if (error instanceof HttpError) {
    return { status: error.status, json: { error: error.message } };
  }
  if (isZodErrorLike(error)) {
    return {
      status: 400,
      json: {
        error: error.issues[0]?.message ?? error.message,
        issues: error.issues,
      },
    };
  }
  const message = error instanceof Error ? error.message : String(error);
  return { status: 500, json: { error: message } };
}

function isZodErrorLike(error: unknown): error is { message: string; issues: Array<{ message?: string }> } {
  if (!error || typeof error !== "object") {
    return false;
  }
  if (!("issues" in error) || !Array.isArray((error as { issues?: unknown }).issues)) {
    return false;
  }
  return "message" in error;
}

export async function dispatchDashboardApiRequest(
  request: DashboardApiDispatchRequest
): Promise<DashboardApiDispatchResponse | null> {
  const key = `${request.method.toUpperCase()} ${request.pathname}`;
  try {
    if (key === "GET /api/config") {
      const { config } = await loadDefaultDashboardConfig();
      return { status: 200, json: config };
    }
    if (key === "GET /api/tool-presets") {
      return { status: 200, json: { presets: listDashboardToolPresets() } };
    }
    if (key === "POST /api/validate") {
      const body = parseJsonText(request.body ?? "");
      const config = validateConfigFromBody(body);
      return { status: 200, json: { config } };
    }
    if (key === "POST /api/export") {
      const body = parseJsonText(request.body ?? "");
      const result = exportPackageFromBody(body);
      return {
        status: 200,
        headers: {
          "Content-Type": result.mimeType,
          "Content-Disposition": `attachment; filename="${result.filename}"`,
        },
        body: result.archive,
      };
    }
    if (key === "POST /api/run") {
      const body = parseJsonText(request.body ?? "");
      const result = await runAgentFromBody(body);
      return { status: 200, json: { result } };
    }
    return null;
  } catch (error) {
    return toDispatchError(error);
  }
}

async function loadDefaultDashboardConfig() {
  let lastError: unknown;
  for (const candidate of defaultConfigPaths) {
    try {
      return await loadProjectConfig(candidate);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("No default config file found");
}

export function createDashboardServer() {
  return createServer(async (req, res) => {
    setCorsHeaders(res);
    if (!req.url || !req.method) {
      res.statusCode = 400;
      res.end("Invalid request");
      return;
    }

    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      res.end();
      return;
    }

    const key = `${req.method.toUpperCase()} ${new URL(req.url, "http://localhost").pathname}`;
    const handler = routes[key];
    if (handler) {
      await handler(req, res);
      return;
    }

    const url = new URL(req.url, "http://localhost");
    await serveStatic(req, res, url.pathname);
  });
}

export function startDashboardServer(port = Number(process.env.PORT ?? 5173)) {
  const server = createDashboardServer();
  server.listen(port, () => {
    console.log(`Legionaire dashboard available at http://localhost:${port}`);
    console.log("Press Ctrl+C to exit.");
  });
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startDashboardServer();
}
