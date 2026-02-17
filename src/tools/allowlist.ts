import path from "node:path";

import type { ToolManifest } from "./manifest.js";

export interface AllowlistPolicy {
  allowedTools?: string[];
  allowedHosts?: string[];
  workspaceRoots?: string[];
  maxTimeoutMs?: number;
  maxBytes?: number;
}

export interface AllowlistCheckContext {
  toolName: string;
  args: unknown;
  timeoutMs: number;
  manifest: ToolManifest;
  policy?: AllowlistPolicy;
}

export interface AllowlistCheckResult {
  ok: boolean;
  reasons: string[];
}

export function enforceAllowlist(context: AllowlistCheckContext): AllowlistCheckResult {
  const reasons: string[] = [];
  const policy = context.policy;

  if (policy?.allowedTools && policy.allowedTools.length > 0 && !policy.allowedTools.includes(context.toolName)) {
    reasons.push(`Tool "${context.toolName}" is not in the allowed tool list`);
  }

  const effectiveTimeoutLimit = minPositive(policy?.maxTimeoutMs, context.manifest.scopes?.max_timeout_ms);
  if (effectiveTimeoutLimit !== undefined && context.timeoutMs > effectiveTimeoutLimit) {
    reasons.push(`timeout_ms exceeds limit of ${effectiveTimeoutLimit}`);
  }

  const payloadBytes = Buffer.byteLength(safeJson(context.args), "utf8");
  const effectiveMaxBytes = minPositive(policy?.maxBytes, context.manifest.scopes?.max_bytes);
  if (effectiveMaxBytes !== undefined && payloadBytes > effectiveMaxBytes) {
    reasons.push(`Tool args exceed max bytes (${payloadBytes} > ${effectiveMaxBytes})`);
  }

  if (context.manifest.capabilities.network) {
    const effectiveHosts = mergeLists(policy?.allowedHosts, context.manifest.scopes?.allowed_hosts);
    if (effectiveHosts.length > 0) {
      const urls = collectUrls(context.args);
      for (const entry of urls) {
        if (!isHostAllowed(entry, effectiveHosts)) {
          reasons.push(`Host "${entry.host}" is not allowed`);
        }
      }
    }
  }

  if (context.manifest.capabilities.filesystem) {
    const effectiveRoots = mergeLists(policy?.workspaceRoots, context.manifest.scopes?.workspace_roots)
      .map((root) => path.resolve(root));
    if (effectiveRoots.length > 0) {
      const filePaths = collectPaths(context.args);
      for (const candidate of filePaths) {
        const resolved = path.resolve(candidate);
        if (!effectiveRoots.some((root) => resolved === root || resolved.startsWith(`${root}${path.sep}`))) {
          reasons.push(`Path "${candidate}" is outside allowed workspace roots`);
        }
      }
    }
  }

  return {
    ok: reasons.length === 0,
    reasons,
  };
}

function minPositive(a: number | undefined, b: number | undefined): number | undefined {
  if (a === undefined) return b;
  if (b === undefined) return a;
  return Math.min(a, b);
}

function mergeLists(a?: string[], b?: string[]): string[] {
  if (a && b) {
    const right = new Set(b);
    return a.filter((entry) => right.has(entry));
  }
  return [...(a ?? b ?? [])];
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value) ?? "";
  } catch {
    return "";
  }
}

function collectUrls(value: unknown, urls: URL[] = []): URL[] {
  if (typeof value === "string") {
    const parsed = parseUrl(value);
    if (parsed) {
      urls.push(parsed);
    }
    return urls;
  }
  if (Array.isArray(value)) {
    value.forEach((entry) => collectUrls(entry, urls));
    return urls;
  }
  if (!value || typeof value !== "object") {
    return urls;
  }
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === "string" && looksLikeUrlKey(key)) {
      const parsed = parseUrl(entry);
      if (parsed) {
        urls.push(parsed);
      }
      continue;
    }
    collectUrls(entry, urls);
  }
  return urls;
}

function collectPaths(value: unknown, paths: string[] = []): string[] {
  if (typeof value === "string") {
    return paths;
  }
  if (Array.isArray(value)) {
    value.forEach((entry) => collectPaths(entry, paths));
    return paths;
  }
  if (!value || typeof value !== "object") {
    return paths;
  }
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === "string" && looksLikePathKey(key)) {
      paths.push(entry);
      continue;
    }
    collectPaths(entry, paths);
  }
  return paths;
}

function looksLikeUrlKey(key: string): boolean {
  const lower = key.toLowerCase();
  return lower.includes("url") || lower.includes("uri") || lower.includes("href");
}

function looksLikePathKey(key: string): boolean {
  const lower = key.toLowerCase();
  return lower.includes("path") || lower.includes("file") || lower.includes("dir");
}

function parseUrl(value: string): URL | null {
  try {
    const parsed = new URL(value);
    if (!parsed.hostname) return null;
    return parsed;
  } catch {
    return null;
  }
}

function isHostAllowed(url: URL, allowed: string[]): boolean {
  const host = url.hostname.toLowerCase();
  return allowed.some((entry) => {
    const normalized = entry.toLowerCase();
    return host === normalized || host.endsWith(`.${normalized}`);
  });
}

