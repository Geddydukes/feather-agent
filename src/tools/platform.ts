import { createHash, randomUUID } from "node:crypto";

import type { Tool } from "./types.js";
import type { ToolAuditLogger } from "./audit.js";
import type { ToolManifest } from "./manifest.js";

export interface InMemoryKvStoreOptions {
  maxValueBytes?: number;
  maxNamespaceEntries?: number;
}

interface KvEntry {
  value: unknown;
  expiresAt?: number;
  sizeBytes: number;
}

export class InMemoryKvStore {
  private readonly entries = new Map<string, KvEntry>();
  private readonly maxValueBytes: number;
  private readonly maxNamespaceEntries: number;

  constructor(options: InMemoryKvStoreOptions = {}) {
    this.maxValueBytes = options.maxValueBytes ?? 16_384;
    this.maxNamespaceEntries = options.maxNamespaceEntries ?? 1_000;
  }

  get(namespace: string, key: string): unknown | undefined {
    this.gc();
    const entry = this.entries.get(this.k(namespace, key));
    return entry?.value;
  }

  set(namespace: string, key: string, value: unknown, ttlSec?: number): void {
    const sizeBytes = Buffer.byteLength(safeJson(value), "utf8");
    if (sizeBytes > this.maxValueBytes) {
      throw new Error(`Value exceeds max bytes (${sizeBytes} > ${this.maxValueBytes})`);
    }
    const namespaceCount = Array.from(this.entries.keys()).filter((entry) => entry.startsWith(`${namespace}::`)).length;
    if (!this.entries.has(this.k(namespace, key)) && namespaceCount >= this.maxNamespaceEntries) {
      throw new Error(`Namespace "${namespace}" exceeded entry limit (${this.maxNamespaceEntries})`);
    }
    this.entries.set(this.k(namespace, key), {
      value,
      expiresAt: ttlSec && ttlSec > 0 ? Date.now() + ttlSec * 1_000 : undefined,
      sizeBytes,
    });
  }

  private gc(): void {
    const now = Date.now();
    for (const [key, entry] of this.entries.entries()) {
      if (entry.expiresAt && entry.expiresAt <= now) {
        this.entries.delete(key);
      }
    }
  }

  private k(namespace: string, key: string): string {
    return `${namespace}::${key}`;
  }
}

export interface BlobPutArgs {
  namespace: string;
  mime_type: string;
  content_base64: string;
  retention_sec?: number;
}

export interface BlobGetArgs {
  namespace: string;
  blob_id: string;
}

export interface InMemoryBlobStoreOptions {
  maxBlobBytes?: number;
  allowedMimeTypes?: string[];
  virusScan?: (blob: Buffer, metadata: { namespace: string; mimeType: string }) => Promise<{ clean: boolean; reason?: string }>;
}

interface BlobEntry {
  namespace: string;
  mimeType: string;
  data: Buffer;
  hash: string;
  createdAt: number;
  expiresAt?: number;
}

export class InMemoryBlobStore {
  private readonly blobs = new Map<string, BlobEntry>();
  private readonly maxBlobBytes: number;
  private readonly allowedMimeTypes: Set<string>;
  private readonly virusScan: InMemoryBlobStoreOptions["virusScan"];

  constructor(options: InMemoryBlobStoreOptions = {}) {
    this.maxBlobBytes = options.maxBlobBytes ?? 8 * 1024 * 1024;
    this.allowedMimeTypes = new Set(
      options.allowedMimeTypes ?? ["application/pdf", "text/plain", "application/json", "image/png", "image/jpeg"]
    );
    this.virusScan = options.virusScan;
  }

  async put(args: BlobPutArgs): Promise<{ blob_id: string; hash: string; size_bytes: number }> {
    const data = Buffer.from(args.content_base64, "base64");
    if (data.byteLength > this.maxBlobBytes) {
      throw new Error(`Blob exceeds max size (${data.byteLength} > ${this.maxBlobBytes})`);
    }
    if (!this.allowedMimeTypes.has(args.mime_type)) {
      throw new Error(`MIME type "${args.mime_type}" is not allowed`);
    }
    if (this.virusScan) {
      const result = await this.virusScan(data, { namespace: args.namespace, mimeType: args.mime_type });
      if (!result.clean) {
        throw new Error(`Virus scan failed: ${result.reason ?? "unknown"}`);
      }
    }
    const blobId = randomUUID();
    const hash = createHash("sha256").update(data).digest("hex");
    const now = Date.now();
    this.blobs.set(blobId, {
      namespace: args.namespace,
      mimeType: args.mime_type,
      data,
      hash,
      createdAt: now,
      expiresAt: args.retention_sec && args.retention_sec > 0 ? now + args.retention_sec * 1_000 : undefined,
    });
    return {
      blob_id: blobId,
      hash,
      size_bytes: data.byteLength,
    };
  }

  get(args: BlobGetArgs): { blob_id: string; mime_type: string; content_base64: string; hash: string } | null {
    this.gc();
    const entry = this.blobs.get(args.blob_id);
    if (!entry || entry.namespace !== args.namespace) {
      return null;
    }
    return {
      blob_id: args.blob_id,
      mime_type: entry.mimeType,
      content_base64: entry.data.toString("base64"),
      hash: entry.hash,
    };
  }

  private gc(): void {
    const now = Date.now();
    for (const [key, value] of this.blobs.entries()) {
      if (value.expiresAt && value.expiresAt <= now) {
        this.blobs.delete(key);
      }
    }
  }
}

export interface SecretsResolver {
  get(name: string): Promise<string | undefined> | string | undefined;
}

export interface SecretsPolicy {
  [toolName: string]: string[];
}

export class ScopedSecretsManager {
  constructor(
    private readonly resolver: SecretsResolver,
    private readonly policy: SecretsPolicy
  ) {}

  async getForTool(toolName: string, secretName: string): Promise<string | undefined> {
    const allowed = new Set(this.policy[toolName] ?? []);
    if (!allowed.has(secretName)) {
      throw new Error(`Tool "${toolName}" is not allowed to access secret "${secretName}"`);
    }
    return this.resolver.get(secretName);
  }
}

export function createMemoryKvGetTool(store: InMemoryKvStore): Tool {
  return {
    name: "memory.kv_get",
    description: "Read persistent key-value state scoped to an agent/user namespace.",
    manifest: createManifest({
      name: "memory.kv_get",
      description: "Read key-value state from namespaced memory.",
      input_schema: {
        type: "object",
        additionalProperties: false,
        required: ["namespace", "key"],
        properties: {
          namespace: { type: "string", minLength: 1 },
          key: { type: "string", minLength: 1 },
        },
      },
      output_schema: {
        type: "object",
        required: ["found"],
        properties: {
          found: { type: "boolean" },
          value: {},
        },
      },
      capabilities: { network: false, filesystem: false, write: false, side_effects: false },
      safety_tags: ["memory", "state"],
    }),
    run(args: { namespace: string; key: string }) {
      const value = store.get(args.namespace, args.key);
      return value === undefined ? { found: false } : { found: true, value };
    },
  };
}

export function createMemoryKvSetTool(store: InMemoryKvStore): Tool {
  return {
    name: "memory.kv_set",
    description: "Write persistent key-value state with optional TTL and namespace limits.",
    manifest: createManifest({
      name: "memory.kv_set",
      description: "Write key-value state into namespaced memory.",
      input_schema: {
        type: "object",
        additionalProperties: false,
        required: ["namespace", "key", "value"],
        properties: {
          namespace: { type: "string", minLength: 1 },
          key: { type: "string", minLength: 1 },
          value: {},
          ttl_sec: { type: "integer", minimum: 1, maximum: 86400 * 30 },
        },
      },
      output_schema: {
        type: "object",
        required: ["ok"],
        properties: { ok: { type: "boolean" } },
      },
      capabilities: { network: false, filesystem: false, write: true, side_effects: true },
      safety_tags: ["memory", "state", "write"],
    }),
    run(args: { namespace: string; key: string; value: unknown; ttl_sec?: number }) {
      store.set(args.namespace, args.key, args.value, args.ttl_sec);
      return { ok: true };
    },
  };
}

export function createMemoryBlobPutTool(store: InMemoryBlobStore): Tool<BlobPutArgs> {
  return {
    name: "memory.blob_put",
    description: "Store larger artifacts as blobs with MIME/type/size and retention controls.",
    manifest: createManifest({
      name: "memory.blob_put",
      description: "Store binary/text blobs in namespaced memory.",
      input_schema: {
        type: "object",
        additionalProperties: false,
        required: ["namespace", "mime_type", "content_base64"],
        properties: {
          namespace: { type: "string", minLength: 1 },
          mime_type: { type: "string", minLength: 1 },
          content_base64: { type: "string", minLength: 1 },
          retention_sec: { type: "integer", minimum: 1, maximum: 86400 * 365 },
        },
      },
      output_schema: {
        type: "object",
        required: ["blob_id", "hash", "size_bytes"],
        properties: {
          blob_id: { type: "string" },
          hash: { type: "string" },
          size_bytes: { type: "integer", minimum: 0 },
        },
      },
      capabilities: { network: false, filesystem: false, write: true, side_effects: true },
      safety_tags: ["blob", "write"],
    }),
    async run(args) {
      return store.put(args);
    },
  };
}

export function createMemoryBlobGetTool(store: InMemoryBlobStore): Tool<BlobGetArgs> {
  return {
    name: "memory.blob_get",
    description: "Retrieve previously stored blobs by namespace and id.",
    manifest: createManifest({
      name: "memory.blob_get",
      description: "Get binary/text blobs from namespaced memory.",
      input_schema: {
        type: "object",
        additionalProperties: false,
        required: ["namespace", "blob_id"],
        properties: {
          namespace: { type: "string", minLength: 1 },
          blob_id: { type: "string", minLength: 1 },
        },
      },
      output_schema: {
        type: "object",
        required: ["found"],
        properties: {
          found: { type: "boolean" },
          blob: {},
        },
      },
      capabilities: { network: false, filesystem: false, write: false, side_effects: false },
      safety_tags: ["blob"],
    }),
    run(args) {
      const blob = store.get(args);
      if (!blob) {
        return { found: false };
      }
      return { found: true, blob };
    },
  };
}

export function createSecretsGetTool(manager: ScopedSecretsManager): Tool {
  return {
    name: "secrets.get",
    description: "Fetch approved secrets for a tool without exposing raw values to the model.",
    manifest: createManifest({
      name: "secrets.get",
      description: "Read scoped secrets for tool adapters only.",
      input_schema: {
        type: "object",
        additionalProperties: false,
        required: ["for_tool", "secret_name"],
        properties: {
          for_tool: { type: "string", minLength: 1 },
          secret_name: { type: "string", minLength: 1 },
        },
      },
      output_schema: {
        type: "object",
        required: ["found", "secret_ref"],
        properties: {
          found: { type: "boolean" },
          secret_ref: { type: "string" },
        },
      },
      capabilities: { network: false, filesystem: false, write: false, side_effects: false },
      safety_tags: ["secrets", "sensitive"],
    }),
    async run(args: { for_tool: string; secret_name: string }) {
      const value = await manager.getForTool(args.for_tool, args.secret_name);
      if (!value) {
        return { found: false, secret_ref: `secret://${args.secret_name}` };
      }
      return { found: true, secret_ref: `secret://${args.secret_name}` };
    },
  };
}

export function createAuditLogEventTool(logger: ToolAuditLogger): Tool {
  return {
    name: "audit.log_event",
    description: "Append immutable, redacted audit events for replay/compliance.",
    manifest: createManifest({
      name: "audit.log_event",
      description: "Append event records to audit storage.",
      input_schema: {
        type: "object",
        additionalProperties: false,
        required: ["event_type", "payload"],
        properties: {
          event_type: { type: "string", minLength: 1 },
          payload: {},
          citations: { type: "array", items: { type: "object" } },
        },
      },
      output_schema: {
        type: "object",
        required: ["ok", "event_id"],
        properties: {
          ok: { type: "boolean" },
          event_id: { type: "string" },
        },
      },
      capabilities: { network: false, filesystem: false, write: true, side_effects: true },
      safety_tags: ["audit", "compliance", "write"],
    }),
    async run(args: { event_type: string; payload: unknown; citations?: unknown[] }) {
      const eventId = randomUUID();
      const payloadHash = createHash("sha256").update(safeJson(args.payload)).digest("hex");
      await logger.append({
        request_id: eventId,
        tool_name: "audit.log_event",
        ok: true,
        timestamp: new Date().toISOString(),
        args_redacted: {
          event_type: args.event_type,
          payload_hash: payloadHash,
          citations: args.citations ?? [],
        },
        output_hash: payloadHash,
      });
      return { ok: true, event_id: eventId };
    },
  };
}

function createManifest(input: Omit<ToolManifest, "auth_requirements"> & { auth_requirements?: string[] }): ToolManifest {
  return {
    ...input,
    auth_requirements: input.auth_requirements ?? [],
  };
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value) ?? "";
  } catch {
    return String(value);
  }
}

