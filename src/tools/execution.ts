import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";

import type { Tool } from "./types.js";
import type { ToolManifest } from "./manifest.js";

const execFileAsync = promisify(execFile);

export interface ExecutionToolsOptions {
  workspaceRoots?: string[];
  defaultTimeoutMs?: number;
  maxOutputBytes?: number;
  allowNetwork?: boolean;
  allowedEnvKeys?: string[];
  pythonBinary?: string;
  nodeBinary?: string;
  shellAllowlist?: string[];
}

interface ExecutionPolicy {
  workspaceRoots: string[];
  defaultTimeoutMs: number;
  maxOutputBytes: number;
  allowNetwork: boolean;
  allowedEnvKeys: Set<string>;
  pythonBinary: string;
  nodeBinary: string;
  shellAllowlist: Set<string>;
}

export function createPythonRunSandboxTool(options: ExecutionToolsOptions = {}): Tool {
  const policy = createExecutionPolicy(options);
  const name = "python.run_sandbox";
  const description = "Execute Python code in a restricted sandbox configuration.";
  return {
    name,
    description,
    manifest: createManifest({
      name,
      description,
      input_schema: {
        type: "object",
        additionalProperties: false,
        required: ["code"],
        properties: {
          code: { type: "string", minLength: 1 },
          args: { type: "array", items: { type: "string" } },
          cwd: { type: "string" },
          timeout_ms: { type: "integer", minimum: 1, maximum: 300000 },
          env: { type: "object" },
          network_enabled: { type: "boolean" },
          max_output_bytes: { type: "integer", minimum: 1, maximum: 10_000_000 },
        },
      },
      output_schema: {
        type: "object",
        required: ["ok", "stdout", "stderr", "exit_code", "timed_out"],
        properties: {
          ok: { type: "boolean" },
          stdout: { type: "string" },
          stderr: { type: "string" },
          exit_code: { type: "integer" },
          timed_out: { type: "boolean" },
          duration_ms: { type: "integer" },
        },
      },
      capabilities: { network: false, filesystem: true, write: true, side_effects: true },
      safety_tags: ["execution", "python", "sandbox", "high-risk"],
      scopes: {
        workspace_roots: policy.workspaceRoots,
        max_timeout_ms: policy.defaultTimeoutMs,
        max_bytes: policy.maxOutputBytes,
      },
    }),
    async run(args: SandboxArgs) {
      const cwd = resolveCwd(args.cwd, policy.workspaceRoots);
      const timeoutMs = args.timeout_ms ?? policy.defaultTimeoutMs;
      const maxOutputBytes = args.max_output_bytes ?? policy.maxOutputBytes;
      const networkEnabled = args.network_enabled ?? false;
      if (!networkEnabled && !policy.allowNetwork) {
        assertNoNetworkCode(args.code, "python");
      }
      const env = buildEnv(args.env, policy.allowedEnvKeys);
      return runExecutable(policy.pythonBinary, ["-I", "-c", args.code, ...(args.args ?? [])], {
        cwd,
        timeoutMs,
        maxOutputBytes,
        env,
      });
    },
  };
}

export function createNodeRunSandboxTool(options: ExecutionToolsOptions = {}): Tool {
  const policy = createExecutionPolicy(options);
  const name = "node.run_sandbox";
  const description = "Execute Node.js code in a restricted sandbox configuration.";
  return {
    name,
    description,
    manifest: createManifest({
      name,
      description,
      input_schema: {
        type: "object",
        additionalProperties: false,
        required: ["code"],
        properties: {
          code: { type: "string", minLength: 1 },
          args: { type: "array", items: { type: "string" } },
          cwd: { type: "string" },
          timeout_ms: { type: "integer", minimum: 1, maximum: 300000 },
          env: { type: "object" },
          network_enabled: { type: "boolean" },
          max_output_bytes: { type: "integer", minimum: 1, maximum: 10_000_000 },
        },
      },
      output_schema: {
        type: "object",
        required: ["ok", "stdout", "stderr", "exit_code", "timed_out"],
        properties: {
          ok: { type: "boolean" },
          stdout: { type: "string" },
          stderr: { type: "string" },
          exit_code: { type: "integer" },
          timed_out: { type: "boolean" },
          duration_ms: { type: "integer" },
        },
      },
      capabilities: { network: false, filesystem: true, write: true, side_effects: true },
      safety_tags: ["execution", "node", "sandbox", "high-risk"],
      scopes: {
        workspace_roots: policy.workspaceRoots,
        max_timeout_ms: policy.defaultTimeoutMs,
        max_bytes: policy.maxOutputBytes,
      },
    }),
    async run(args: SandboxArgs) {
      const cwd = resolveCwd(args.cwd, policy.workspaceRoots);
      const timeoutMs = args.timeout_ms ?? policy.defaultTimeoutMs;
      const maxOutputBytes = args.max_output_bytes ?? policy.maxOutputBytes;
      const networkEnabled = args.network_enabled ?? false;
      if (!networkEnabled && !policy.allowNetwork) {
        assertNoNetworkCode(args.code, "node");
      }
      const env = buildEnv(args.env, policy.allowedEnvKeys);
      return runExecutable(
        policy.nodeBinary,
        ["--input-type=module", "-e", args.code, ...(args.args ?? []).length > 0 ? ["--", ...(args.args ?? [])] : []],
        {
          cwd,
          timeoutMs,
          maxOutputBytes,
          env,
        }
      );
    },
  };
}

export function createShellRunRestrictedTool(options: ExecutionToolsOptions = {}): Tool {
  const policy = createExecutionPolicy(options);
  const name = "shell.run_restricted";
  const description = "Execute allowlisted shell commands without arbitrary passthrough.";
  return {
    name,
    description,
    manifest: createManifest({
      name,
      description,
      input_schema: {
        type: "object",
        additionalProperties: false,
        required: ["command"],
        properties: {
          command: { type: "string", minLength: 1 },
          args: { type: "array", items: { type: "string" } },
          cwd: { type: "string" },
          timeout_ms: { type: "integer", minimum: 1, maximum: 300000 },
          env: { type: "object" },
          max_output_bytes: { type: "integer", minimum: 1, maximum: 10_000_000 },
        },
      },
      output_schema: {
        type: "object",
        required: ["ok", "stdout", "stderr", "exit_code", "timed_out"],
        properties: {
          ok: { type: "boolean" },
          stdout: { type: "string" },
          stderr: { type: "string" },
          exit_code: { type: "integer" },
          timed_out: { type: "boolean" },
          duration_ms: { type: "integer" },
        },
      },
      capabilities: { network: false, filesystem: true, write: true, side_effects: true },
      safety_tags: ["execution", "shell", "restricted", "high-risk"],
      scopes: {
        workspace_roots: policy.workspaceRoots,
        max_timeout_ms: policy.defaultTimeoutMs,
        max_bytes: policy.maxOutputBytes,
      },
    }),
    async run(args: {
      command: string;
      args?: string[];
      cwd?: string;
      timeout_ms?: number;
      env?: Record<string, string>;
      max_output_bytes?: number;
    }) {
      const command = args.command.trim();
      if (!policy.shellAllowlist.has(command)) {
        throw new Error(`Command "${command}" is not allowlisted`);
      }
      const runArgs = Array.isArray(args.args) ? args.args : [];
      assertSafeArgs(runArgs);
      const cwd = resolveCwd(args.cwd, policy.workspaceRoots);
      const timeoutMs = args.timeout_ms ?? policy.defaultTimeoutMs;
      const maxOutputBytes = args.max_output_bytes ?? policy.maxOutputBytes;
      const env = buildEnv(args.env, policy.allowedEnvKeys);
      return runExecutable(command, runArgs, {
        cwd,
        timeoutMs,
        maxOutputBytes,
        env,
      });
    },
  };
}

interface SandboxArgs {
  code: string;
  args?: string[];
  cwd?: string;
  timeout_ms?: number;
  env?: Record<string, string>;
  network_enabled?: boolean;
  max_output_bytes?: number;
}

function createExecutionPolicy(options: ExecutionToolsOptions): ExecutionPolicy {
  return {
    workspaceRoots: (options.workspaceRoots ?? [process.cwd()]).map((entry) => path.resolve(entry)),
    defaultTimeoutMs: options.defaultTimeoutMs ?? 20_000,
    maxOutputBytes: options.maxOutputBytes ?? 500_000,
    allowNetwork: options.allowNetwork ?? false,
    allowedEnvKeys: new Set(options.allowedEnvKeys ?? []),
    pythonBinary: options.pythonBinary ?? "python3",
    nodeBinary: options.nodeBinary ?? "node",
    shellAllowlist: new Set(options.shellAllowlist ?? ["pytest", "ruff", "npm", "node", "python3", "python", "git", "echo"]),
  };
}

function resolveCwd(input: string | undefined, roots: string[]): string {
  const cwd = path.resolve(input ?? roots[0]);
  return ensureWithinWorkspace(cwd, roots);
}

function ensureWithinWorkspace(resolvedPath: string, workspaceRoots: string[]): string {
  for (const root of workspaceRoots) {
    if (resolvedPath === root || resolvedPath.startsWith(`${root}${path.sep}`)) {
      return resolvedPath;
    }
  }
  throw new Error(`Path "${resolvedPath}" is outside allowed workspace roots`);
}

function assertNoNetworkCode(code: string, runtime: "python" | "node"): void {
  const content = code.toLowerCase();
  const bannedPatterns = runtime === "python"
    ? ["import requests", "urllib", "socket", "http.client", "aiohttp"]
    : ["fetch(", "http.", "https.", "net.", "tls.", "axios", "request("];
  for (const pattern of bannedPatterns) {
    if (content.includes(pattern)) {
      throw new Error(`${runtime}.run_sandbox blocked potential network usage pattern "${pattern}"`);
    }
  }
}

function assertSafeArgs(args: string[]): void {
  for (const arg of args) {
    if (typeof arg !== "string") {
      throw new Error("shell args must be strings");
    }
    if (!/^[A-Za-z0-9_@%+=:,./-]*$/.test(arg)) {
      throw new Error(`shell arg "${arg}" contains disallowed characters`);
    }
  }
}

function buildEnv(input: Record<string, string> | undefined, allowedKeys: Set<string>): Record<string, string> {
  if (!input || typeof input !== "object") {
    return {};
  }
  const output: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    if (!allowedKeys.has(key)) {
      continue;
    }
    if (typeof value !== "string") {
      continue;
    }
    output[key] = value;
  }
  return output;
}

async function runExecutable(
  command: string,
  args: string[],
  options: { cwd: string; timeoutMs: number; maxOutputBytes: number; env: Record<string, string> }
): Promise<{
  ok: boolean;
  stdout: string;
  stderr: string;
  exit_code: number;
  timed_out: boolean;
  duration_ms: number;
}> {
  const started = Date.now();
  try {
    const result = await execFileAsync(command, args, {
      cwd: options.cwd,
      timeout: options.timeoutMs,
      maxBuffer: options.maxOutputBytes,
      encoding: "utf8",
      env: { ...process.env, ...options.env },
    });
    const duration = Date.now() - started;
    return {
      ok: true,
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
      exit_code: 0,
      timed_out: false,
      duration_ms: duration,
    };
  } catch (error) {
    const duration = Date.now() - started;
    const e = error as NodeJS.ErrnoException & {
      stdout?: string;
      stderr?: string;
      code?: number | string;
      killed?: boolean;
      signal?: string;
    };
    const exitCode = typeof e.code === "number" ? e.code : 1;
    const timedOut = Boolean(e.killed && e.signal === "SIGTERM");
    return {
      ok: false,
      stdout: e.stdout ?? "",
      stderr: e.stderr ?? e.message,
      exit_code: exitCode,
      timed_out: timedOut,
      duration_ms: duration,
    };
  }
}

function createManifest(input: Omit<ToolManifest, "auth_requirements"> & { auth_requirements?: string[] }): ToolManifest {
  return {
    ...input,
    auth_requirements: input.auth_requirements ?? [],
  };
}

