import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

import { createAgent } from "../agent/createAgent.js";
import { FeatherProjectConfigSchema, type FeatherProjectConfig } from "../types/config.js";
import { loadProjectConfig } from "../core/config-loader.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../../..");
const publicDir = path.resolve(projectRoot, "dashboard/public");
const defaultConfigPath = path.resolve(projectRoot, "feather.config.json");

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

function setCorsHeaders(res: ServerResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

async function parseJsonBody(req: IncomingMessage): Promise<any> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  if (chunks.length === 0) {
    return undefined;
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw.trim()) {
    return undefined;
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Failed to parse request body: ${(error as Error).message}`);
  }
}

async function handleGetConfig(_req: IncomingMessage, res: ServerResponse) {
  try {
    const { config } = await loadProjectConfig(defaultConfigPath);
    sendJson(res, 200, config);
  } catch (error) {
    sendJson(res, 500, { error: (error as Error).message });
  }
}

async function handleRunAgent(req: IncomingMessage, res: ServerResponse) {
  try {
    const body = await parseJsonBody(req);
    if (!body || typeof body !== "object") {
      sendJson(res, 400, { error: "Request body must be a JSON object" });
      return;
    }
    const { config, agent, prompt, apiKeys } = body as {
      config: FeatherProjectConfig;
      agent?: string;
      prompt: string;
      apiKeys?: Record<string, string>;
    };
    if (!config) {
      sendJson(res, 400, { error: "Missing 'config' in request body" });
      return;
    }
    if (!prompt || typeof prompt !== "string") {
      sendJson(res, 400, { error: "Missing 'prompt' in request body" });
      return;
    }

    const validatedConfig = FeatherProjectConfigSchema.parse(config);
    const previousEnv = new Map<string, string | undefined>();
    if (apiKeys && typeof apiKeys === "object") {
      for (const [key, value] of Object.entries(apiKeys)) {
        previousEnv.set(key, process.env[key]);
        if (value) {
          process.env[key] = value;
        } else {
          delete process.env[key];
        }
      }
    }

    try {
      const { agent: agentInstance } = await createAgent({ config: validatedConfig, agent });
      const sessionId = randomUUID();
      const result = await agentInstance.run({
        sessionId,
        input: { role: "user", content: prompt },
      });
      sendJson(res, 200, { result });
    } finally {
      for (const [key, value] of previousEnv.entries()) {
        if (typeof value === "string") {
          process.env[key] = value;
        } else {
          delete process.env[key];
        }
      }
    }
  } catch (error) {
    sendJson(res, 500, { error: (error as Error).message });
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
    if (!body || typeof body !== "object") {
      sendJson(res, 400, { error: "Request body must be a JSON object" });
      return;
    }
    const { config } = body as { config: FeatherProjectConfig };
    if (!config) {
      sendJson(res, 400, { error: "Missing 'config' in request body" });
      return;
    }
    const validated = FeatherProjectConfigSchema.parse(config);
    sendJson(res, 200, { config: validated });
  } catch (error) {
    sendJson(res, 500, { error: (error as Error).message });
  }
}

const routes: Record<string, RequestHandler> = {
  "GET /api/config": handleGetConfig,
  "POST /api/run": handleRunAgent,
  "POST /api/validate": handleValidateConfig,
};

const server = createServer(async (req, res) => {
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

const port = Number(process.env.PORT ?? 5173);

server.listen(port, () => {
  console.log(`Feather dashboard available at http://localhost:${port}`);
  console.log("Press Ctrl+C to exit.");
});
