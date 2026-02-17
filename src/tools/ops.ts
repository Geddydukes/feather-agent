import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { validateJsonSchemaValue } from "./schema.js";
import type { Tool } from "./types.js";
import type { ToolManifest } from "./manifest.js";

type FetchLike = (input: string, init?: Record<string, unknown>) => Promise<{
  status: number;
  url: string;
  headers: { get(name: string): string | null };
  arrayBuffer(): Promise<ArrayBuffer>;
}>;

export interface WebFetchToolOptions {
  fetch?: FetchLike;
  defaultTimeoutMs?: number;
  defaultMaxBytes?: number;
  defaultMaxRedirects?: number;
  allowedHosts?: string[];
}

export function createWebFetchTool(options: WebFetchToolOptions = {}): Tool {
  const fetchImpl = options.fetch ?? (globalThis.fetch as unknown as FetchLike | undefined);
  if (!fetchImpl) {
    throw new Error("web.fetch requires a fetch implementation");
  }
  const defaultTimeoutMs = options.defaultTimeoutMs ?? 20_000;
  const defaultMaxBytes = options.defaultMaxBytes ?? 200_000;
  const defaultMaxRedirects = options.defaultMaxRedirects ?? 3;
  const allowedHosts = new Set((options.allowedHosts ?? []).map((host) => host.toLowerCase()));

  return {
    name: "web.fetch",
    description: "Fetch a URL and return cleaned text with metadata.",
    manifest: createManifest({
      name: "web.fetch",
      description: "Fetch a web page and extract clean text plus metadata.",
      input_schema: {
        type: "object",
        additionalProperties: false,
        required: ["url"],
        properties: {
          url: { type: "string", minLength: 1 },
          timeout_ms: { type: "integer", minimum: 1, maximum: 120000 },
          max_bytes: { type: "integer", minimum: 1, maximum: 2_000_000 },
          max_redirects: { type: "integer", minimum: 0, maximum: 10 },
        },
      },
      output_schema: {
        type: "object",
        required: ["content", "metadata"],
        properties: {
          content: { type: "string" },
          metadata: { type: "object" },
        },
      },
      capabilities: { network: true, filesystem: false, write: false, side_effects: false },
      safety_tags: ["network", "untrusted-content", "read"],
      scopes: {
        allowed_hosts: options.allowedHosts,
        max_bytes: defaultMaxBytes,
      },
      cache: {
        cache_ttl_ms: 120_000,
        cache_key_fields: ["url"],
        stale_while_revalidate_ms: 30_000,
      },
    }),
    async run(
      args: { url: string; timeout_ms?: number; max_bytes?: number; max_redirects?: number },
      ctx
    ) {
      const maxBytes = args.max_bytes ?? defaultMaxBytes;
      const timeoutMs = args.timeout_ms ?? defaultTimeoutMs;
      const maxRedirects = args.max_redirects ?? defaultMaxRedirects;
      const finalUrl = new URL(args.url);
      guardPublicHost(finalUrl.hostname, allowedHosts);

      const result = await fetchWithRedirects(fetchImpl, finalUrl.toString(), {
        timeoutMs,
        maxBytes,
        maxRedirects,
        signal: ctx.signal,
      });
      const contentType = (result.headers.get("content-type") ?? "").toLowerCase();
      const rawText = result.body.toString("utf8");
      const parsed = parseFetchedContent(rawText, contentType);
      return {
        content: parsed.text,
        metadata: {
          title: parsed.title,
          published_at: parsed.publishedAt,
          canonical_url: parsed.canonicalUrl ?? result.url,
          url: result.url,
          status: result.status,
          content_type: contentType || undefined,
          bytes: result.body.byteLength,
        },
      };
    },
  };
}

export interface HttpRequestToolOptions {
  fetch?: FetchLike;
  allowedHosts?: string[];
  maxResponseBytes?: number;
  methods?: string[];
}

export function createHttpRequestTool(options: HttpRequestToolOptions = {}): Tool {
  const fetchImpl = options.fetch ?? (globalThis.fetch as unknown as FetchLike | undefined);
  if (!fetchImpl) {
    throw new Error("http.request requires a fetch implementation");
  }
  const allowedHosts = new Set((options.allowedHosts ?? []).map((host) => host.toLowerCase()));
  const allowedMethods = new Set((options.methods ?? ["GET", "POST", "PUT", "PATCH", "DELETE"]).map((m) => m.toUpperCase()));
  const maxResponseBytes = options.maxResponseBytes ?? 512_000;

  return {
    name: "http.request",
    description: "Call approved HTTP endpoints with guardrails.",
    manifest: createManifest({
      name: "http.request",
      description: "Perform constrained HTTP requests against approved hosts.",
      input_schema: {
        type: "object",
        additionalProperties: false,
        required: ["url"],
        properties: {
          url: { type: "string", minLength: 1 },
          method: { type: "string" },
          headers: { type: "object" },
          body_text: { type: "string" },
          timeout_ms: { type: "integer", minimum: 1, maximum: 120000 },
          max_bytes: { type: "integer", minimum: 1, maximum: 2_000_000 },
        },
      },
      output_schema: {
        type: "object",
        required: ["status", "url", "headers"],
        properties: {
          status: { type: "integer" },
          url: { type: "string" },
          headers: { type: "object" },
          body_text: { type: "string" },
          body_json: {},
        },
      },
      capabilities: { network: true, filesystem: false, write: true, side_effects: true },
      safety_tags: ["network", "connector"],
      scopes: {
        allowed_hosts: options.allowedHosts,
        max_bytes: maxResponseBytes,
      },
      cache: {
        cache_ttl_ms: 30_000,
        cache_key_fields: ["url", "method", "body_text"],
      },
    }),
    async run(
      args: { url: string; method?: string; headers?: Record<string, string>; body_text?: string; timeout_ms?: number; max_bytes?: number },
      ctx
    ) {
      const method = (args.method ?? "GET").toUpperCase();
      if (!allowedMethods.has(method)) {
        throw new Error(`HTTP method "${method}" is not allowed`);
      }
      const parsedUrl = new URL(args.url);
      guardPublicHost(parsedUrl.hostname, allowedHosts);

      const timeoutMs = args.timeout_ms ?? 20_000;
      const maxBytes = args.max_bytes ?? maxResponseBytes;
      const response = await fetchWithRedirects(fetchImpl, parsedUrl.toString(), {
        timeoutMs,
        maxBytes,
        maxRedirects: 3,
        method,
        headers: args.headers,
        body: args.body_text,
        signal: ctx.signal,
      });
      const headers = collectHeaders(response.headers);
      const contentType = (headers["content-type"] ?? "").toLowerCase();
      const bodyText = response.body.toString("utf8");
      return {
        status: response.status,
        url: response.url,
        headers,
        body_text: bodyText,
        body_json: contentType.includes("application/json") ? safeJsonParse(bodyText) : undefined,
      };
    },
  };
}

export function createSchemaValidateJsonTool(): Tool {
  return {
    name: "schema.validate_json",
    description: "Validate JSON data against a JSON Schema.",
    manifest: createManifest({
      name: "schema.validate_json",
      description: "Validate value against schema and return errors.",
      input_schema: {
        type: "object",
        additionalProperties: false,
        required: ["value", "schema"],
        properties: {
          value: {},
          schema: { type: "object" },
        },
      },
      output_schema: {
        type: "object",
        required: ["valid", "errors"],
        properties: {
          valid: { type: "boolean" },
          errors: { type: "array", items: { type: "string" } },
        },
      },
      capabilities: { network: false, filesystem: false, write: false, side_effects: false },
      safety_tags: ["schema", "validation"],
    }),
    run(args: { value: unknown; schema: Record<string, unknown> }) {
      const result = validateJsonSchemaValue(args.value, args.schema);
      return {
        valid: result.ok,
        errors: result.errors,
      };
    },
  };
}

export interface FsToolsOptions {
  workspaceRoots?: string[];
  maxReadBytes?: number;
  maxWriteBytes?: number;
  allowedExtensions?: string[];
}

export function createFsListTool(options: FsToolsOptions = {}): Tool {
  const policy = createFsPolicy(options);
  return {
    name: "fs.list",
    description: "List files and directories in an approved workspace.",
    manifest: createManifest({
      name: "fs.list",
      description: "List workspace files/directories under allowed roots.",
      input_schema: {
        type: "object",
        additionalProperties: false,
        required: ["path"],
        properties: {
          path: { type: "string", minLength: 1 },
          recursive: { type: "boolean" },
          max_entries: { type: "integer", minimum: 1, maximum: 5000 },
        },
      },
      output_schema: {
        type: "object",
        required: ["entries"],
        properties: {
          entries: { type: "array", items: { type: "object" } },
        },
      },
      capabilities: { network: false, filesystem: true, write: false, side_effects: false },
      safety_tags: ["filesystem", "read"],
      scopes: { workspace_roots: policy.workspaceRoots },
    }),
    async run(args: { path: string; recursive?: boolean; max_entries?: number }) {
      const start = policy.resolve(args.path);
      const recursive = args.recursive ?? false;
      const maxEntries = args.max_entries ?? 200;
      const entries: Array<{ path: string; type: "file" | "dir"; size_bytes?: number }> = [];
      await walkList(start, start, entries, recursive, maxEntries);
      return { entries };
    },
  };
}

export function createFsReadTool(options: FsToolsOptions = {}): Tool {
  const policy = createFsPolicy(options);
  return {
    name: "fs.read",
    description: "Read a file from the approved workspace.",
    manifest: createManifest({
      name: "fs.read",
      description: "Read file content from allowed workspace roots.",
      input_schema: {
        type: "object",
        additionalProperties: false,
        required: ["path"],
        properties: {
          path: { type: "string", minLength: 1 },
          encoding: { type: "string", enum: ["utf8", "base64"] },
          max_bytes: { type: "integer", minimum: 1, maximum: 50_000_000 },
        },
      },
      output_schema: {
        type: "object",
        required: ["path", "encoding", "content", "size_bytes"],
        properties: {
          path: { type: "string" },
          encoding: { type: "string" },
          content: { type: "string" },
          size_bytes: { type: "integer" },
        },
      },
      capabilities: { network: false, filesystem: true, write: false, side_effects: false },
      safety_tags: ["filesystem", "read"],
      scopes: {
        workspace_roots: policy.workspaceRoots,
        max_bytes: policy.maxReadBytes,
      },
    }),
    async run(args: { path: string; encoding?: "utf8" | "base64"; max_bytes?: number }) {
      const resolved = policy.resolve(args.path, true);
      policy.assertExtension(resolved);
      const fileStat = await stat(resolved);
      const maxBytes = args.max_bytes ?? policy.maxReadBytes;
      if (fileStat.size > maxBytes) {
        throw new Error(`File exceeds max bytes (${fileStat.size} > ${maxBytes})`);
      }
      const encoding = args.encoding ?? "utf8";
      const buffer = await readFile(resolved);
      return {
        path: resolved,
        encoding,
        content: encoding === "base64" ? buffer.toString("base64") : buffer.toString("utf8"),
        size_bytes: buffer.byteLength,
      };
    },
  };
}

export function createFsWriteTool(options: FsToolsOptions = {}): Tool {
  const policy = createFsPolicy(options);
  return {
    name: "fs.write",
    description: "Write file content into the approved workspace.",
    manifest: createManifest({
      name: "fs.write",
      description: "Write file content under allowed workspace roots.",
      input_schema: {
        type: "object",
        additionalProperties: false,
        required: ["path", "content"],
        properties: {
          path: { type: "string", minLength: 1 },
          content: { type: "string" },
          encoding: { type: "string", enum: ["utf8", "base64"] },
          create_dirs: { type: "boolean" },
          overwrite: { type: "boolean" },
        },
      },
      output_schema: {
        type: "object",
        required: ["ok", "path", "size_bytes", "sha256"],
        properties: {
          ok: { type: "boolean" },
          path: { type: "string" },
          size_bytes: { type: "integer" },
          sha256: { type: "string" },
        },
      },
      capabilities: { network: false, filesystem: true, write: true, side_effects: true },
      safety_tags: ["filesystem", "write"],
      scopes: {
        workspace_roots: policy.workspaceRoots,
        max_bytes: policy.maxWriteBytes,
      },
    }),
    async run(args: { path: string; content: string; encoding?: "utf8" | "base64"; create_dirs?: boolean; overwrite?: boolean }) {
      const resolved = policy.resolve(args.path, true);
      policy.assertExtension(resolved);
      const encoding = args.encoding ?? "utf8";
      const buffer = encoding === "base64" ? Buffer.from(args.content, "base64") : Buffer.from(args.content, "utf8");
      if (buffer.byteLength > policy.maxWriteBytes) {
        throw new Error(`Content exceeds max bytes (${buffer.byteLength} > ${policy.maxWriteBytes})`);
      }
      if (args.create_dirs) {
        await mkdir(path.dirname(resolved), { recursive: true });
      }
      if (args.overwrite === false) {
        try {
          await stat(resolved);
          throw new Error(`File already exists: ${resolved}`);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
            throw error;
          }
        }
      }
      await writeFile(resolved, buffer);
      return {
        ok: true,
        path: resolved,
        size_bytes: buffer.byteLength,
        sha256: createHash("sha256").update(buffer).digest("hex"),
      };
    },
  };
}

export interface ArtifactPackToolOptions {
  workspaceRoots?: string[];
  maxTotalBytes?: number;
}

export function createArtifactPackTool(options: ArtifactPackToolOptions = {}): Tool {
  const workspaceRoots = (options.workspaceRoots ?? [process.cwd()]).map((entry) => path.resolve(entry));
  const maxTotalBytes = options.maxTotalBytes ?? 25 * 1024 * 1024;
  return {
    name: "artifact.pack",
    description: "Create a versioned artifact bundle with hashes and run metadata.",
    manifest: createManifest({
      name: "artifact.pack",
      description: "Bundle files plus manifest for reproducibility.",
      input_schema: {
        type: "object",
        additionalProperties: false,
        required: ["workspace_root", "files", "output_path"],
        properties: {
          workspace_root: { type: "string", minLength: 1 },
          files: { type: "array", items: { type: "string" }, minItems: 1 },
          output_path: { type: "string", minLength: 1 },
          include_content: { type: "boolean" },
          run_metadata: { type: "object" },
        },
      },
      output_schema: {
        type: "object",
        required: ["ok", "output_path", "file_count", "total_bytes", "bundle_hash"],
        properties: {
          ok: { type: "boolean" },
          output_path: { type: "string" },
          file_count: { type: "integer" },
          total_bytes: { type: "integer" },
          bundle_hash: { type: "string" },
        },
      },
      capabilities: { network: false, filesystem: true, write: true, side_effects: true },
      safety_tags: ["artifact", "filesystem", "write"],
      scopes: {
        workspace_roots: workspaceRoots,
        max_bytes: maxTotalBytes,
      },
    }),
    async run(args: {
      workspace_root: string;
      files: string[];
      output_path: string;
      include_content?: boolean;
      run_metadata?: Record<string, unknown>;
    }) {
      const root = ensureWithinWorkspace(path.resolve(args.workspace_root), workspaceRoots);
      const includeContent = args.include_content ?? true;
      const fileEntries: Array<{ path: string; size_bytes: number; sha256: string; content_base64?: string }> = [];
      let totalBytes = 0;
      for (const entry of args.files) {
        const absolute = ensureWithinWorkspace(path.resolve(root, entry), [root]);
        const data = await readFile(absolute);
        totalBytes += data.byteLength;
        if (totalBytes > maxTotalBytes) {
          throw new Error(`Artifact exceeds maxTotalBytes (${totalBytes} > ${maxTotalBytes})`);
        }
        fileEntries.push({
          path: path.relative(root, absolute),
          size_bytes: data.byteLength,
          sha256: createHash("sha256").update(data).digest("hex"),
          content_base64: includeContent ? data.toString("base64") : undefined,
        });
      }
      const bundle = {
        version: 1,
        created_at: new Date().toISOString(),
        workspace_root: root,
        run_metadata: args.run_metadata ?? {},
        files: fileEntries,
      };
      const bundleBytes = Buffer.from(`${JSON.stringify(bundle, null, 2)}\n`, "utf8");
      const outputPath = ensureWithinWorkspace(path.resolve(root, args.output_path), [root]);
      await mkdir(path.dirname(outputPath), { recursive: true });
      await writeFile(outputPath, bundleBytes);
      return {
        ok: true,
        output_path: outputPath,
        file_count: fileEntries.length,
        total_bytes: totalBytes,
        bundle_hash: createHash("sha256").update(bundleBytes).digest("hex"),
      };
    },
  };
}

interface FetchRequestOptions {
  timeoutMs: number;
  maxBytes: number;
  maxRedirects: number;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
}

async function fetchWithRedirects(fetchImpl: FetchLike, url: string, options: FetchRequestOptions): Promise<{
  status: number;
  url: string;
  headers: { get(name: string): string | null };
  body: Buffer;
}> {
  let currentUrl = url;
  let redirects = 0;
  let method = options.method ?? "GET";
  let body = options.body;
  while (true) {
    const ac = new AbortController();
    const timeout = setTimeout(() => ac.abort(new Error("Request timeout")), options.timeoutMs);
    const signal = mergeAbortSignals(options.signal, ac.signal);
    const response = await fetchImpl(currentUrl, {
      method,
      headers: options.headers,
      body,
      redirect: "manual",
      signal,
    });
    clearTimeout(timeout);

    if (isRedirect(response.status)) {
      const location = response.headers.get("location");
      if (!location) {
        break;
      }
      if (redirects >= options.maxRedirects) {
        throw new Error(`Too many redirects (>${options.maxRedirects})`);
      }
      redirects += 1;
      currentUrl = new URL(location, currentUrl).toString();
      const parsed = new URL(currentUrl);
      guardPublicHost(parsed.hostname);
      if (response.status === 303 && method !== "GET") {
        method = "GET";
        body = undefined;
      }
      continue;
    }
    const raw = Buffer.from(await response.arrayBuffer());
    if (raw.byteLength > options.maxBytes) {
      throw new Error(`Response exceeded max bytes (${raw.byteLength} > ${options.maxBytes})`);
    }
    return {
      status: response.status,
      url: response.url || currentUrl,
      headers: response.headers,
      body: raw,
    };
  }
  throw new Error("Unexpected fetch loop termination");
}

function isRedirect(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

function parseFetchedContent(raw: string, contentType: string): { text: string; title?: string; canonicalUrl?: string; publishedAt?: string } {
  if (!contentType.includes("html")) {
    return {
      text: raw.trim(),
    };
  }
  const withoutScripts = raw
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");
  const title = matchGroup(withoutScripts, /<title[^>]*>([\s\S]*?)<\/title>/i);
  const canonical = matchGroup(withoutScripts, /<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)["'][^>]*>/i);
  const published =
    matchGroup(withoutScripts, /<meta[^>]+property=["']article:published_time["'][^>]*content=["']([^"']+)["'][^>]*>/i) ??
    matchGroup(withoutScripts, /<meta[^>]+name=["']date["'][^>]*content=["']([^"']+)["'][^>]*>/i);
  const text = decodeHtmlEntities(
    withoutScripts
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
  return {
    text,
    title: title ? decodeHtmlEntities(title.trim()) : undefined,
    canonicalUrl: canonical?.trim(),
    publishedAt: published?.trim(),
  };
}

function matchGroup(input: string, pattern: RegExp): string | undefined {
  const match = input.match(pattern);
  return match?.[1];
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'");
}

function collectHeaders(headers: { get(name: string): string | null }): Record<string, string> {
  const names = [
    "content-type",
    "content-length",
    "cache-control",
    "etag",
    "last-modified",
    "location",
  ];
  const output: Record<string, string> = {};
  for (const name of names) {
    const value = headers.get(name);
    if (value !== null) {
      output[name] = value;
    }
  }
  return output;
}

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

interface FsPolicy {
  workspaceRoots: string[];
  maxReadBytes: number;
  maxWriteBytes: number;
  allowedExtensions?: Set<string>;
  resolve(inputPath: string, fileOnly?: boolean): string;
  assertExtension(resolvedPath: string): void;
}

function createFsPolicy(options: FsToolsOptions): FsPolicy {
  const workspaceRoots = (options.workspaceRoots ?? [process.cwd()]).map((entry) => path.resolve(entry));
  const maxReadBytes = options.maxReadBytes ?? 2_000_000;
  const maxWriteBytes = options.maxWriteBytes ?? 2_000_000;
  const allowedExtensions = options.allowedExtensions ? new Set(options.allowedExtensions.map((ext) => ext.toLowerCase())) : undefined;

  return {
    workspaceRoots,
    maxReadBytes,
    maxWriteBytes,
    allowedExtensions,
    resolve(inputPath: string, fileOnly = false) {
      const resolved = path.resolve(inputPath);
      const safe = ensureWithinWorkspace(resolved, workspaceRoots);
      if (fileOnly && safe.endsWith(path.sep)) {
        throw new Error(`Invalid file path: ${inputPath}`);
      }
      return safe;
    },
    assertExtension(resolvedPath: string) {
      if (!allowedExtensions || allowedExtensions.size === 0) {
        return;
      }
      const ext = path.extname(resolvedPath).toLowerCase();
      if (!allowedExtensions.has(ext)) {
        throw new Error(`File extension "${ext}" is not allowed`);
      }
    },
  };
}

async function walkList(
  root: string,
  current: string,
  output: Array<{ path: string; type: "file" | "dir"; size_bytes?: number }>,
  recursive: boolean,
  maxEntries: number
): Promise<void> {
  if (output.length >= maxEntries) {
    return;
  }
  const entries = await readdir(current, { withFileTypes: true });
  for (const entry of entries) {
    if (output.length >= maxEntries) {
      break;
    }
    const absolute = path.join(current, entry.name);
    const relative = path.relative(root, absolute) || ".";
    if (entry.isDirectory()) {
      output.push({ path: relative, type: "dir" });
      if (recursive) {
        await walkList(root, absolute, output, recursive, maxEntries);
      }
      continue;
    }
    const fileStat = await stat(absolute);
    output.push({ path: relative, type: "file", size_bytes: fileStat.size });
  }
}

function ensureWithinWorkspace(resolvedPath: string, workspaceRoots: string[]): string {
  for (const root of workspaceRoots) {
    if (resolvedPath === root || resolvedPath.startsWith(`${root}${path.sep}`)) {
      return resolvedPath;
    }
  }
  throw new Error(`Path "${resolvedPath}" is outside allowed workspace roots`);
}

function guardPublicHost(host: string, allowedHosts?: Set<string>): void {
  const normalized = host.toLowerCase();
  if (allowedHosts && allowedHosts.size > 0) {
    const match = Array.from(allowedHosts).some((entry) => normalized === entry || normalized.endsWith(`.${entry}`));
    if (!match) {
      throw new Error(`Host "${host}" is not in the allowlist`);
    }
  }
  if (
    normalized === "localhost" ||
    normalized.endsWith(".local") ||
    normalized === "127.0.0.1" ||
    normalized === "::1"
  ) {
    throw new Error(`Host "${host}" is blocked`);
  }
  if (isPrivateIpv4(normalized)) {
    throw new Error(`Host "${host}" is in a private network range`);
  }
}

function isPrivateIpv4(host: string): boolean {
  const match = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return false;
  const parts = match.slice(1).map((v) => Number(v));
  if (parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return false;
  }
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

function createManifest(input: Omit<ToolManifest, "auth_requirements"> & { auth_requirements?: string[] }): ToolManifest {
  return {
    ...input,
    auth_requirements: input.auth_requirements ?? [],
  };
}

function mergeAbortSignals(signalA?: AbortSignal, signalB?: AbortSignal): AbortSignal | undefined {
  if (!signalA) return signalB;
  if (!signalB) return signalA;
  if (signalA.aborted) return signalA;
  if (signalB.aborted) return signalB;
  const controller = new AbortController();
  const onA = () => controller.abort(signalA.reason);
  const onB = () => controller.abort(signalB.reason);
  signalA.addEventListener("abort", onA, { once: true });
  signalB.addEventListener("abort", onB, { once: true });
  return controller.signal;
}
