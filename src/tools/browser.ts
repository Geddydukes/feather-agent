import type { Tool, ToolRunContext } from "./types.js";
import type { ToolManifest } from "./manifest.js";

export type BrowserAction =
  | { type: "navigate"; url: string }
  | { type: "click"; selector: string }
  | { type: "type"; selector: string; text: string; clear?: boolean }
  | { type: "wait"; ms: number }
  | { type: "extract"; selector?: string };

export interface BrowserSessionRequest {
  session_id?: string;
  start_url: string;
  actions?: BrowserAction[];
  timeout_ms?: number;
  metadata?: Record<string, unknown>;
  signal?: AbortSignal;
}

export interface BrowserActionResult {
  index: number;
  type: BrowserAction["type"];
  status: "ok" | "error";
  detail?: string;
}

export interface BrowserSessionResult {
  session_id: string;
  final_url: string;
  title?: string;
  text?: string;
  actions: BrowserActionResult[];
  metadata?: Record<string, unknown>;
}

export interface BrowserSessionAdapter {
  runSession(request: BrowserSessionRequest): Promise<BrowserSessionResult>;
}

export interface CreateWebBrowserSessionToolOptions {
  name?: string;
  description?: string;
  defaultTimeoutMs?: number;
  maxActions?: number;
  allowedHosts?: string[];
}

const DEFAULT_NAME = "web.browser_session";
const DEFAULT_DESCRIPTION = "Run a sandboxed browser session for interactive web navigation.";
const DEFAULT_TIMEOUT_MS = 45_000;
const DEFAULT_MAX_ACTIONS = 20;

export function createWebBrowserSessionTool(
  adapter: BrowserSessionAdapter,
  options: CreateWebBrowserSessionToolOptions = {}
): Tool {
  if (!adapter || typeof adapter.runSession !== "function") {
    throw new Error("createWebBrowserSessionTool requires an adapter with runSession(request)");
  }
  const name = options.name?.trim() || DEFAULT_NAME;
  const description = options.description?.trim() || DEFAULT_DESCRIPTION;
  const defaultTimeoutMs = options.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxActions = options.maxActions ?? DEFAULT_MAX_ACTIONS;
  if (!Number.isInteger(defaultTimeoutMs) || defaultTimeoutMs <= 0) {
    throw new Error("defaultTimeoutMs must be a positive integer");
  }
  if (!Number.isInteger(maxActions) || maxActions <= 0) {
    throw new Error("maxActions must be a positive integer");
  }

  return {
    name,
    description,
    manifest: createManifest({
      name,
      description,
      input_schema: {
        type: "object",
        additionalProperties: false,
        required: ["start_url"],
        properties: {
          session_id: { type: "string" },
          start_url: { type: "string", minLength: 1 },
          timeout_ms: { type: "integer", minimum: 1, maximum: 300000 },
          actions: {
            type: "array",
            items: { type: "object" },
            maxItems: maxActions,
          },
        },
      },
      output_schema: {
        type: "object",
        required: ["session_id", "final_url", "actions"],
        properties: {
          session_id: { type: "string" },
          final_url: { type: "string" },
          title: { type: "string" },
          text: { type: "string" },
          actions: { type: "array", items: { type: "object" } },
          metadata: { type: "object" },
        },
      },
      capabilities: { network: true, filesystem: false, write: true, side_effects: true },
      safety_tags: ["network", "browser", "interactive", "high-risk"],
      scopes: {
        allowed_hosts: options.allowedHosts,
        max_timeout_ms: defaultTimeoutMs,
      },
    }),
    async run(
      args: {
        session_id?: string;
        start_url: string;
        actions?: BrowserAction[];
        timeout_ms?: number;
      },
      ctx: ToolRunContext
    ) {
      const actions = Array.isArray(args.actions) ? args.actions : [];
      if (actions.length > maxActions) {
        throw new Error(`web.browser_session exceeded max actions (${actions.length} > ${maxActions})`);
      }
      const timeoutMs = args.timeout_ms ?? defaultTimeoutMs;
      if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
        throw new Error("timeout_ms must be a positive integer");
      }
      const result = await adapter.runSession({
        session_id: args.session_id,
        start_url: args.start_url,
        actions,
        timeout_ms: timeoutMs,
        metadata: ctx.metadata,
        signal: ctx.signal,
      });
      return normalizeBrowserResult(result);
    },
  };
}

function normalizeBrowserResult(result: BrowserSessionResult): BrowserSessionResult {
  if (!result || typeof result !== "object") {
    throw new Error("Browser adapter must return an object");
  }
  if (typeof result.session_id !== "string" || result.session_id.trim() === "") {
    throw new Error("Browser result requires session_id");
  }
  if (typeof result.final_url !== "string" || result.final_url.trim() === "") {
    throw new Error("Browser result requires final_url");
  }
  if (!Array.isArray(result.actions)) {
    throw new Error("Browser result requires actions array");
  }
  const actions = result.actions.map((action, index) => ({
    index: Number.isInteger(action.index) ? action.index : index,
    type: action.type,
    status: action.status,
    detail: action.detail,
  }));
  return {
    session_id: result.session_id,
    final_url: result.final_url,
    title: result.title,
    text: result.text,
    actions,
    metadata: result.metadata,
  };
}

function createManifest(input: Omit<ToolManifest, "auth_requirements"> & { auth_requirements?: string[] }): ToolManifest {
  return {
    ...input,
    auth_requirements: input.auth_requirements ?? [],
  };
}

