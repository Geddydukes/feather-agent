import { randomUUID } from "node:crypto";

import { z } from "zod";

import type { Tool, ToolRunContext } from "./types.js";
import {
  ensureToolManifest,
  validateToolManifest,
  type ToolManifest,
  type ToolManifestCapabilities,
} from "./manifest.js";
import { validateJsonSchemaValue } from "./schema.js";
import { enforceAllowlist, type AllowlistPolicy } from "./allowlist.js";
import {
  DefaultPromptInjectionScanner,
  applyRedaction,
  type PromptInjectionScanner,
  type PromptInjectionScanResult,
} from "./safety.js";
import {
  InMemoryToolAuditLogger,
  hashToolOutput,
  type ToolAuditEvent,
  type ToolAuditLogger,
} from "./audit.js";
import { ToolCache, isToolCache, type ToolCacheDecision, type ToolCacheOptions } from "../core/tool-cache.js";

export interface ToolListFilters {
  safety_tags?: string[];
  capabilities?: Partial<ToolManifestCapabilities>;
}

export interface ToolListEntry {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  output_schema: Record<string, unknown>;
  auth_requirements: string[];
  safety_tags: string[];
  capabilities: ToolManifestCapabilities;
  scopes?: ToolManifest["scopes"];
  cache?: ToolManifest["cache"];
}

export interface ToolCallRequest {
  request_id?: string;
  tool_name: string;
  args: unknown;
  timeout_ms: number;
  idempotency_key?: string;
  dry_run?: boolean;
}

export interface ToolCallError {
  code: string;
  message: string;
  retryable: boolean;
  details?: Record<string, unknown>;
}

export interface ToolCallMeta {
  started_at: string;
  ended_at: string;
  duration_ms: number;
  cache_hit: boolean;
  retries: number;
  idempotency_key?: string;
  injection_scan?: PromptInjectionScanResult;
  redaction?: {
    args_fields: string[];
    output_fields: string[];
  };
}

export interface ToolResultEnvelope {
  request_id: string;
  tool_name: string;
  ok: boolean;
  data?: unknown;
  error?: ToolCallError;
  meta: ToolCallMeta;
}

export interface ToolCallContext {
  signal?: AbortSignal;
  metadata?: Record<string, unknown>;
  allowlist?: AllowlistPolicy;
}

export interface ToolRuntimeLimits {
  maxConcurrentToolCalls?: number;
  maxWebFetchPerMinute?: number;
  maxBytesIngestedPerMinute?: number;
}

export interface ToolRuntimeOptions {
  allowlist?: AllowlistPolicy;
  auditLogger?: ToolAuditLogger;
  injectionScanner?: PromptInjectionScanner;
  idempotencyWindowMs?: number;
  limits?: ToolRuntimeLimits;
  cache?: ToolCache | ToolCacheOptions;
}

const ToolCallRequestSchema = z.object({
  request_id: z.string().optional(),
  tool_name: z.string().min(1),
  args: z.unknown(),
  timeout_ms: z.number().int().positive().max(300_000),
  idempotency_key: z.string().min(1).max(256).optional(),
  dry_run: z.boolean().optional(),
});

interface RegisteredTool {
  tool: Tool;
  manifest: ToolManifest;
}

export class ToolRegistry {
  private readonly entries = new Map<string, RegisteredTool>();

  register(tool: Tool, manifest?: ToolManifest): void {
    const resolvedManifest = manifest ? validateToolManifest(manifest) : ensureToolManifest(tool);
    if (resolvedManifest.name !== tool.name) {
      throw new Error(`Tool manifest name mismatch for "${tool.name}"`);
    }
    this.entries.set(tool.name, { tool, manifest: resolvedManifest });
  }

  registerMany(entries: Array<{ tool: Tool; manifest?: ToolManifest }>): void {
    for (const entry of entries) {
      this.register(entry.tool, entry.manifest);
    }
  }

  async loadManifestsFromFile(filePath: string): Promise<void> {
    const { readFile } = await import("node:fs/promises");
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    const manifests = Array.isArray(parsed) ? parsed : (parsed as { manifests?: unknown[] })?.manifests;
    if (!Array.isArray(manifests)) {
      throw new Error("Manifest file must contain an array or { manifests: [] }");
    }
    for (const entry of manifests) {
      const manifest = validateToolManifest(entry);
      const existing = this.entries.get(manifest.name);
      if (!existing) {
        continue;
      }
      this.entries.set(manifest.name, { ...existing, manifest });
    }
  }

  get(name: string): RegisteredTool | undefined {
    return this.entries.get(name);
  }

  list(filters?: ToolListFilters): ToolListEntry[] {
    const all = Array.from(this.entries.values()).map(({ manifest }) => toListEntry(manifest));
    return all.filter((entry) => matchesFilters(entry, filters));
  }
}

export class ToolRuntime {
  private readonly auditLogger: ToolAuditLogger;
  private readonly injectionScanner: PromptInjectionScanner;
  private readonly idempotencyWindowMs: number;
  private readonly limits: ToolRuntimeLimits;
  private readonly globalAllowlist?: AllowlistPolicy;
  private readonly cache?: ToolCache;
  private readonly idempotencyCache = new Map<string, { expiresAt: number; envelope: ToolResultEnvelope }>();
  private readonly activeCalls = new Set<string>();
  private readonly networkEventsByScope = new Map<string, number[]>();
  private readonly bytesByScope = new Map<string, Array<{ ts: number; bytes: number }>>();

  constructor(private readonly registry: ToolRegistry, options: ToolRuntimeOptions = {}) {
    this.auditLogger = options.auditLogger ?? new InMemoryToolAuditLogger();
    this.injectionScanner = options.injectionScanner ?? new DefaultPromptInjectionScanner();
    this.idempotencyWindowMs = options.idempotencyWindowMs ?? 5 * 60_000;
    this.limits = options.limits ?? {};
    this.globalAllowlist = options.allowlist;
    this.cache = options.cache
      ? (isToolCache(options.cache) ? options.cache : new ToolCache(options.cache))
      : undefined;
  }

  listTools(filters?: ToolListFilters): ToolListEntry[] {
    return this.registry.list(filters);
  }

  async callTool(request: ToolCallRequest, context: ToolCallContext = {}): Promise<ToolResultEnvelope> {
    const parsed = ToolCallRequestSchema.parse(request);
    const requestId = parsed.request_id ?? randomUUID();
    const startedAt = Date.now();
    const startedAtIso = new Date(startedAt).toISOString();
    const runtimeKey = `${requestId}:${parsed.tool_name}`;

    const finalize = async (
      partial: {
        ok: boolean;
        data?: unknown;
        error?: ToolCallError;
        cacheHit?: boolean;
        retries?: number;
        injectionScan?: PromptInjectionScanResult;
        redactionArgs?: string[];
        redactionOutput?: string[];
      }
    ): Promise<ToolResultEnvelope> => {
      const endedAt = Date.now();
      const envelope: ToolResultEnvelope = {
        request_id: requestId,
        tool_name: parsed.tool_name,
        ok: partial.ok,
        data: partial.data,
        error: partial.error,
        meta: {
          started_at: startedAtIso,
          ended_at: new Date(endedAt).toISOString(),
          duration_ms: endedAt - startedAt,
          cache_hit: Boolean(partial.cacheHit),
          retries: partial.retries ?? 0,
          idempotency_key: parsed.idempotency_key,
          injection_scan: partial.injectionScan,
          redaction: {
            args_fields: partial.redactionArgs ?? [],
            output_fields: partial.redactionOutput ?? [],
          },
        },
      };
      await this.auditEvent(envelope, parsed.args, partial);
      return envelope;
    };

    try {
      this.enforceConcurrency(runtimeKey);

      const registered = this.registry.get(parsed.tool_name);
      if (!registered) {
        return finalize({
          ok: false,
          error: createToolError("TOOL_NOT_FOUND", `Unknown tool "${parsed.tool_name}"`, false),
        });
      }
      const { tool, manifest } = registered;

      const inputValidation = validateJsonSchemaValue(parsed.args, manifest.input_schema);
      if (!inputValidation.ok) {
        return finalize({
          ok: false,
          error: createToolError("TOOL_INPUT_VALIDATION_FAILED", "Input schema validation failed", false, {
            errors: inputValidation.errors,
          }),
        });
      }

      const allowlistCheck = enforceAllowlist({
        toolName: parsed.tool_name,
        args: parsed.args,
        timeoutMs: parsed.timeout_ms,
        manifest,
        policy: mergeAllowlists(this.globalAllowlist, context.allowlist),
      });
      if (!allowlistCheck.ok) {
        return finalize({
          ok: false,
          error: createToolError("ALLOWLIST_REJECTED", "Tool call rejected by allowlist policy", false, {
            reasons: allowlistCheck.reasons,
          }),
        });
      }

      if ((manifest.capabilities.write || manifest.capabilities.side_effects) && !parsed.idempotency_key && !parsed.dry_run) {
        return finalize({
          ok: false,
          error: createToolError(
            "IDEMPOTENCY_KEY_REQUIRED",
            `Tool "${parsed.tool_name}" requires idempotency_key for write or side-effect operations`,
            false
          ),
        });
      }

      if (parsed.idempotency_key) {
        const key = this.idempotencyKey(parsed.tool_name, parsed.idempotency_key);
        const cached = this.idempotencyCache.get(key);
        if (cached && cached.expiresAt > Date.now()) {
          return finalize({
            ok: cached.envelope.ok,
            data: cached.envelope.data,
            error: cached.envelope.error,
            cacheHit: true,
          });
        }
      }

      const redactedArgs = applyRedaction(parsed.args);
      if (parsed.dry_run) {
        return finalize({
          ok: true,
          data: {
            would_execute: false,
            approvals_required: inferApprovals(manifest),
            manifest: toListEntry(manifest),
          },
          redactionArgs: redactedArgs.redactedFields,
        });
      }

      const cacheTtlSec = resolveCacheTtlSec(tool, manifest);
      let cacheDecision: ToolCacheDecision | undefined;
      if (this.cache && cacheTtlSec > 0) {
        cacheDecision = await this.cache.prepare({ tool: parsed.tool_name, args: redactedArgs.value });
        if (cacheDecision.hit) {
          const cachedData = cacheDecision.hit.value;
          const injectionScan = shouldScanContent(manifest) ? this.injectionScanner.scan(cachedData) : undefined;
          return finalize({
            ok: true,
            data: cachedData,
            cacheHit: true,
            redactionArgs: redactedArgs.redactedFields,
            redactionOutput: [],
            injectionScan,
          });
        }
      }

      this.enforceRateLimits(manifest, context, redactedArgs.value);
      const toolResult = await this.executeWithTimeout(tool, redactedArgs.value, parsed.timeout_ms, context);
      const outputValidation = validateJsonSchemaValue(toolResult, manifest.output_schema);
      if (!outputValidation.ok) {
        return finalize({
          ok: false,
          error: createToolError("TOOL_OUTPUT_VALIDATION_FAILED", "Output schema validation failed", false, {
            errors: outputValidation.errors,
          }),
          redactionArgs: redactedArgs.redactedFields,
        });
      }

      const redactedOutput = applyRedaction(toolResult);
      const injectionScan = shouldScanContent(manifest)
        ? this.injectionScanner.scan(redactedOutput.value)
        : undefined;

      const success = await finalize({
        ok: true,
        data: redactedOutput.value,
        redactionArgs: redactedArgs.redactedFields,
        redactionOutput: redactedOutput.redactedFields,
        injectionScan,
      });

      if (this.cache && cacheDecision?.cacheable && cacheTtlSec > 0) {
        try {
          await this.cache.write(cacheDecision, success.data, cacheTtlSec);
        } catch {
          // Cache write failures must not break tool calls.
        }
      }

      if (parsed.idempotency_key && success.ok) {
        this.idempotencyCache.set(this.idempotencyKey(parsed.tool_name, parsed.idempotency_key), {
          expiresAt: Date.now() + this.idempotencyWindowMs,
          envelope: success,
        });
      }
      return success;
    } catch (error) {
      const toolError = normalizeToolError(error);
      return finalize({ ok: false, error: toolError });
    } finally {
      this.activeCalls.delete(runtimeKey);
      this.gcIdempotency();
    }
  }

  private enforceConcurrency(callKey: string): void {
    const limit = this.limits.maxConcurrentToolCalls;
    if (limit && this.activeCalls.size >= limit) {
      throw createToolError("TOOL_CONCURRENCY_EXCEEDED", `Too many concurrent tool calls (limit ${limit})`, true);
    }
    this.activeCalls.add(callKey);
  }

  private enforceRateLimits(manifest: ToolManifest, context: ToolCallContext, args: unknown): void {
    const scopeKey = resolveScopeKey(context.metadata);
    const now = Date.now();
    if (manifest.capabilities.network && this.limits.maxWebFetchPerMinute) {
      const events = this.networkEventsByScope.get(scopeKey) ?? [];
      const windowStart = now - 60_000;
      const recent = events.filter((entry) => entry >= windowStart);
      if (recent.length >= this.limits.maxWebFetchPerMinute) {
        throw createToolError(
          "TOOL_RATE_LIMITED",
          `Network tool rate limit exceeded (${this.limits.maxWebFetchPerMinute}/min)`,
          true
        );
      }
      recent.push(now);
      this.networkEventsByScope.set(scopeKey, recent);
    }

    if (manifest.capabilities.network && this.limits.maxBytesIngestedPerMinute) {
      const payloadBytes = Buffer.byteLength(safeJson(args), "utf8");
      const entries = this.bytesByScope.get(scopeKey) ?? [];
      const windowStart = now - 60_000;
      const recent = entries.filter((entry) => entry.ts >= windowStart);
      const consumed = recent.reduce((sum, entry) => sum + entry.bytes, 0);
      if (consumed + payloadBytes > this.limits.maxBytesIngestedPerMinute) {
        throw createToolError(
          "TOOL_BYTES_LIMITED",
          `Bytes-ingested limit exceeded (${this.limits.maxBytesIngestedPerMinute}/min)`,
          true
        );
      }
      recent.push({ ts: now, bytes: payloadBytes });
      this.bytesByScope.set(scopeKey, recent);
    }
  }

  private async executeWithTimeout(
    tool: Tool,
    args: unknown,
    timeoutMs: number,
    context: ToolCallContext
  ): Promise<unknown> {
    const localAbort = new AbortController();
    const timeout = setTimeout(() => localAbort.abort(new Error("Tool timed out")), timeoutMs);
    const signal = mergeAbortSignals(context.signal, localAbort.signal);
    try {
      return await tool.run(args, {
        signal,
        metadata: context.metadata,
      } satisfies ToolRunContext);
    } finally {
      clearTimeout(timeout);
    }
  }

  private idempotencyKey(tool: string, key: string): string {
    return `${tool}:${key}`;
  }

  private gcIdempotency(): void {
    const now = Date.now();
    for (const [key, value] of this.idempotencyCache.entries()) {
      if (value.expiresAt <= now) {
        this.idempotencyCache.delete(key);
      }
    }
  }

  private async auditEvent(
    envelope: ToolResultEnvelope,
    originalArgs: unknown,
    partial: {
      redactionArgs?: string[];
      redactionOutput?: string[];
      injectionScan?: PromptInjectionScanResult;
    }
  ): Promise<void> {
    const argsRedaction = applyRedaction(originalArgs);
    const event: ToolAuditEvent = {
      request_id: envelope.request_id,
      tool_name: envelope.tool_name,
      ok: envelope.ok,
      timestamp: envelope.meta.ended_at,
      args_redacted: argsRedaction.value,
      output_hash: envelope.ok ? hashToolOutput(envelope.data) : undefined,
      injection_scan: partial.injectionScan
        ? { score: partial.injectionScan.score, reasons: [...partial.injectionScan.reasons] }
        : undefined,
      redaction: {
        redacted_fields: [
          ...(partial.redactionArgs ?? []),
          ...(partial.redactionOutput ?? []),
        ],
      },
      error: envelope.error
        ? {
            code: envelope.error.code,
            message: envelope.error.message,
            retryable: envelope.error.retryable,
          }
        : undefined,
      meta: {
        duration_ms: envelope.meta.duration_ms,
        cache_hit: envelope.meta.cache_hit,
      },
    };
    await this.auditLogger.append(event);
  }
}

export function createToolListTool(runtime: ToolRuntime): Tool {
  return {
    name: "tool.list",
    description: "List registered tools, schemas, auth requirements, and safety metadata.",
    manifest: validateToolManifest({
      name: "tool.list",
      description: "List available tools from the runtime registry.",
      input_schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          safety_tags: { type: "array", items: { type: "string" } },
          capabilities: { type: "object" },
        },
      },
      output_schema: {
        type: "object",
        required: ["tools"],
        properties: {
          tools: { type: "array", items: { type: "object" } },
        },
      },
      auth_requirements: [],
      safety_tags: ["discovery"],
      capabilities: { network: false, filesystem: false, write: false, side_effects: false },
    }),
    run(args: ToolListFilters) {
      return {
        tools: runtime.listTools(args),
      };
    },
  };
}

export function createToolCallTool(runtime: ToolRuntime): Tool {
  return {
    name: "tool.call",
    description: "Unified tool execution wrapper with structured IO and standardized errors.",
    manifest: validateToolManifest({
      name: "tool.call",
      description: "Execute any registered tool by name through the standardized runtime pipeline.",
      input_schema: {
        type: "object",
        additionalProperties: false,
        required: ["tool_name", "args", "timeout_ms"],
        properties: {
          request_id: { type: "string" },
          tool_name: { type: "string", minLength: 1 },
          args: {},
          timeout_ms: { type: "integer", minimum: 1, maximum: 300000 },
          idempotency_key: { type: "string" },
          dry_run: { type: "boolean" },
        },
      },
      output_schema: {
        type: "object",
        required: ["request_id", "tool_name", "ok", "meta"],
        properties: {
          request_id: { type: "string" },
          tool_name: { type: "string" },
          ok: { type: "boolean" },
          data: {},
          error: { type: "object" },
          meta: { type: "object" },
        },
      },
      auth_requirements: [],
      safety_tags: ["dispatcher"],
      capabilities: { network: false, filesystem: false, write: false, side_effects: false },
    }),
    async run(args: ToolCallRequest, ctx: ToolRunContext) {
      return runtime.callTool(args, {
        signal: ctx.signal,
        metadata: ctx.metadata,
      });
    },
  };
}

function toListEntry(manifest: ToolManifest): ToolListEntry {
  return {
    name: manifest.name,
    description: manifest.description,
    input_schema: manifest.input_schema,
    output_schema: manifest.output_schema,
    auth_requirements: [...manifest.auth_requirements],
    safety_tags: [...manifest.safety_tags],
    capabilities: { ...manifest.capabilities },
    scopes: manifest.scopes ? { ...manifest.scopes } : undefined,
    cache: manifest.cache ? { ...manifest.cache } : undefined,
  };
}

function matchesFilters(entry: ToolListEntry, filters?: ToolListFilters): boolean {
  if (!filters) {
    return true;
  }
  if (filters.safety_tags && filters.safety_tags.length > 0) {
    const entryTags = new Set(entry.safety_tags);
    for (const tag of filters.safety_tags) {
      if (!entryTags.has(tag)) {
        return false;
      }
    }
  }
  if (filters.capabilities) {
    const requested = filters.capabilities;
    if (requested.network !== undefined && entry.capabilities.network !== requested.network) {
      return false;
    }
    if (requested.filesystem !== undefined && entry.capabilities.filesystem !== requested.filesystem) {
      return false;
    }
    if (requested.write !== undefined && entry.capabilities.write !== requested.write) {
      return false;
    }
    if (requested.side_effects !== undefined && entry.capabilities.side_effects !== requested.side_effects) {
      return false;
    }
  }
  return true;
}

function shouldScanContent(manifest: ToolManifest): boolean {
  if (manifest.capabilities.network) {
    return true;
  }
  return manifest.safety_tags.includes("document") || manifest.safety_tags.includes("untrusted-content");
}

function resolveCacheTtlSec(tool: Tool, manifest: ToolManifest): number {
  if (typeof tool.cacheTtlSec === "number" && tool.cacheTtlSec > 0) {
    return Math.floor(tool.cacheTtlSec);
  }
  const cacheTtlMs = manifest.cache?.cache_ttl_ms;
  if (typeof cacheTtlMs === "number" && cacheTtlMs > 0) {
    return Math.max(1, Math.floor(cacheTtlMs / 1000));
  }
  return 0;
}

function inferApprovals(manifest: ToolManifest): string[] {
  const approvals: string[] = [];
  if (manifest.capabilities.write) {
    approvals.push("write-approval");
  }
  if (manifest.capabilities.side_effects) {
    approvals.push("side-effect-approval");
  }
  if (manifest.capabilities.network) {
    approvals.push("network-approval");
  }
  return approvals;
}

function normalizeToolError(error: unknown): ToolCallError {
  if (isToolCallError(error)) {
    return error;
  }
  if (isZodErrorLike(error)) {
    const zodError = error;
    return createToolError("TOOL_REQUEST_INVALID", zodError.issues[0]?.message ?? "Invalid tool call request", false, {
      issues: zodError.issues,
    });
  }
  const message = error instanceof Error ? error.message : String(error);
  return createToolError("TOOL_EXECUTION_FAILED", message, true);
}

function createToolError(
  code: string,
  message: string,
  retryable: boolean,
  details?: Record<string, unknown>
): ToolCallError {
  return { code, message, retryable, details };
}

function isToolCallError(error: unknown): error is ToolCallError {
  if (!error || typeof error !== "object") return false;
  const value = error as ToolCallError;
  return typeof value.code === "string" && typeof value.message === "string" && typeof value.retryable === "boolean";
}

function mergeAllowlists(a?: AllowlistPolicy, b?: AllowlistPolicy): AllowlistPolicy | undefined {
  if (!a && !b) return undefined;
  if (!a) return b;
  if (!b) return a;
  return {
    allowedTools: intersect(a.allowedTools, b.allowedTools),
    allowedHosts: intersect(a.allowedHosts, b.allowedHosts),
    workspaceRoots: intersect(a.workspaceRoots, b.workspaceRoots),
    maxTimeoutMs: minNum(a.maxTimeoutMs, b.maxTimeoutMs),
    maxBytes: minNum(a.maxBytes, b.maxBytes),
  };
}

function intersect(a?: string[], b?: string[]): string[] | undefined {
  if (!a) return b;
  if (!b) return a;
  const bSet = new Set(b);
  return a.filter((entry) => bSet.has(entry));
}

function minNum(a?: number, b?: number): number | undefined {
  if (a === undefined) return b;
  if (b === undefined) return a;
  return Math.min(a, b);
}

function resolveScopeKey(metadata?: Record<string, unknown>): string {
  const user = metadata?.userId;
  if (typeof user === "string" && user.trim() !== "") {
    return `user:${user}`;
  }
  const agent = metadata?.agentId;
  if (typeof agent === "string" && agent.trim() !== "") {
    return `agent:${agent}`;
  }
  return "global";
}

function mergeAbortSignals(signalA?: AbortSignal, signalB?: AbortSignal): AbortSignal | undefined {
  if (!signalA) return signalB;
  if (!signalB) return signalA;
  if (signalA.aborted) return signalA;
  if (signalB.aborted) return signalB;

  const controller = new AbortController();
  const onAbortA = () => controller.abort(signalA.reason);
  const onAbortB = () => controller.abort(signalB.reason);
  signalA.addEventListener("abort", onAbortA, { once: true });
  signalB.addEventListener("abort", onAbortB, { once: true });
  return controller.signal;
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value) ?? "";
  } catch {
    return String(value);
  }
}

function isZodErrorLike(error: unknown): error is { issues: Array<{ message?: string }> } {
  if (!error || typeof error !== "object") {
    return false;
  }
  return "issues" in error && Array.isArray((error as { issues?: unknown }).issues);
}
