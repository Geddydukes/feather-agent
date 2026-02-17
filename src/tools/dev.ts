import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";

import type { Tool } from "./types.js";
import type { ToolManifest } from "./manifest.js";

const execFileAsync = promisify(execFile);

export interface DevToolsOptions {
  workspaceRoots?: string[];
  maxOutputBytes?: number;
  commandTimeoutMs?: number;
}

interface DevPolicy {
  workspaceRoots: string[];
  maxOutputBytes: number;
  commandTimeoutMs: number;
}

export function createFsDiffTool(options: DevToolsOptions = {}): Tool {
  const policy = createDevPolicy(options);
  return {
    name: "fs.diff",
    description: "Generate unified diff between two files in allowed workspaces.",
    manifest: createManifest({
      name: "fs.diff",
      description: "Produce unified file diffs under workspace-root constraints.",
      input_schema: {
        type: "object",
        additionalProperties: false,
        required: ["path_a", "path_b"],
        properties: {
          path_a: { type: "string", minLength: 1 },
          path_b: { type: "string", minLength: 1 },
          context_lines: { type: "integer", minimum: 0, maximum: 20 },
          max_bytes: { type: "integer", minimum: 1, maximum: 2_000_000 },
        },
      },
      output_schema: {
        type: "object",
        required: ["diff", "truncated", "bytes"],
        properties: {
          diff: { type: "string" },
          truncated: { type: "boolean" },
          bytes: { type: "integer" },
        },
      },
      capabilities: { network: false, filesystem: true, write: false, side_effects: false },
      safety_tags: ["filesystem", "read", "diff"],
      scopes: {
        workspace_roots: policy.workspaceRoots,
        max_bytes: policy.maxOutputBytes,
      },
    }),
    async run(args: { path_a: string; path_b: string; context_lines?: number; max_bytes?: number }) {
      const fileA = ensureWithinWorkspace(path.resolve(args.path_a), policy.workspaceRoots);
      const fileB = ensureWithinWorkspace(path.resolve(args.path_b), policy.workspaceRoots);
      const contextLines = args.context_lines ?? 3;
      const maxBytes = args.max_bytes ?? policy.maxOutputBytes;
      const { stdout, code } = await runGitCommand(["--no-pager", "diff", "--no-index", `--unified=${contextLines}`, "--", fileA, fileB], {
        cwd: process.cwd(),
        timeoutMs: policy.commandTimeoutMs,
        maxOutputBytes: maxBytes,
        allowExitCodes: [0, 1],
      });
      if (code !== 0 && code !== 1) {
        throw new Error(`fs.diff failed with exit code ${code}`);
      }
      const truncated = Buffer.byteLength(stdout, "utf8") >= maxBytes;
      return {
        diff: stdout,
        truncated,
        bytes: Buffer.byteLength(stdout, "utf8"),
      };
    },
  };
}

export function createGitStatusTool(options: DevToolsOptions = {}): Tool {
  const policy = createDevPolicy(options);
  return {
    name: "git.status",
    description: "Read repository status in porcelain format.",
    manifest: createManifest({
      name: "git.status",
      description: "Inspect git status in an allowed repository.",
      input_schema: {
        type: "object",
        additionalProperties: false,
        required: ["repo_path"],
        properties: {
          repo_path: { type: "string", minLength: 1 },
          include_untracked: { type: "boolean" },
        },
      },
      output_schema: {
        type: "object",
        required: ["branch", "clean", "files"],
        properties: {
          branch: { type: "string" },
          clean: { type: "boolean" },
          files: { type: "array", items: { type: "object" } },
        },
      },
      capabilities: { network: false, filesystem: true, write: false, side_effects: false },
      safety_tags: ["git", "read"],
      scopes: { workspace_roots: policy.workspaceRoots },
    }),
    async run(args: { repo_path: string; include_untracked?: boolean }) {
      const repoPath = ensureWithinWorkspace(path.resolve(args.repo_path), policy.workspaceRoots);
      const includeUntracked = args.include_untracked !== false;
      const { stdout } = await runGitCommand(
        ["-C", repoPath, "status", "--porcelain=v1", "--branch", includeUntracked ? "--untracked-files=all" : "--untracked-files=no"],
        {
          cwd: repoPath,
          timeoutMs: policy.commandTimeoutMs,
          maxOutputBytes: policy.maxOutputBytes,
          allowExitCodes: [0],
        }
      );
      return parseGitStatus(stdout);
    },
  };
}

export function createGitDiffTool(options: DevToolsOptions = {}): Tool {
  const policy = createDevPolicy(options);
  return {
    name: "git.diff",
    description: "Read git diff output with strict limits.",
    manifest: createManifest({
      name: "git.diff",
      description: "Generate git diff for repo paths under constraints.",
      input_schema: {
        type: "object",
        additionalProperties: false,
        required: ["repo_path"],
        properties: {
          repo_path: { type: "string", minLength: 1 },
          staged: { type: "boolean" },
          pathspecs: { type: "array", items: { type: "string" } },
          context_lines: { type: "integer", minimum: 0, maximum: 20 },
          max_bytes: { type: "integer", minimum: 1, maximum: 2_000_000 },
        },
      },
      output_schema: {
        type: "object",
        required: ["diff", "truncated", "bytes"],
        properties: {
          diff: { type: "string" },
          truncated: { type: "boolean" },
          bytes: { type: "integer" },
        },
      },
      capabilities: { network: false, filesystem: true, write: false, side_effects: false },
      safety_tags: ["git", "read", "diff"],
      scopes: { workspace_roots: policy.workspaceRoots, max_bytes: policy.maxOutputBytes },
    }),
    async run(args: { repo_path: string; staged?: boolean; pathspecs?: string[]; context_lines?: number; max_bytes?: number }) {
      const repoPath = ensureWithinWorkspace(path.resolve(args.repo_path), policy.workspaceRoots);
      const contextLines = args.context_lines ?? 3;
      const maxBytes = args.max_bytes ?? policy.maxOutputBytes;
      const command = ["-C", repoPath, "--no-pager", "diff", "--no-ext-diff", `--unified=${contextLines}`];
      if (args.staged) {
        command.push("--cached");
      }
      if (Array.isArray(args.pathspecs) && args.pathspecs.length > 0) {
        command.push("--");
        for (const entry of args.pathspecs) {
          if (typeof entry !== "string" || entry.trim() === "") continue;
          command.push(entry);
        }
      }
      const { stdout, code } = await runGitCommand(command, {
        cwd: repoPath,
        timeoutMs: policy.commandTimeoutMs,
        maxOutputBytes: maxBytes,
        allowExitCodes: [0],
      });
      if (code !== 0) {
        throw new Error(`git.diff failed with exit code ${code}`);
      }
      return {
        diff: stdout,
        truncated: Buffer.byteLength(stdout, "utf8") >= maxBytes,
        bytes: Buffer.byteLength(stdout, "utf8"),
      };
    },
  };
}

export function createGitCommitTool(options: DevToolsOptions = {}): Tool {
  const policy = createDevPolicy(options);
  return {
    name: "git.commit",
    description: "Create commit with allowlisted arguments only.",
    manifest: createManifest({
      name: "git.commit",
      description: "Commit staged or selected files with fixed argument policy.",
      input_schema: {
        type: "object",
        additionalProperties: false,
        required: ["repo_path", "message"],
        properties: {
          repo_path: { type: "string", minLength: 1 },
          message: { type: "string", minLength: 1, maxLength: 200 },
          paths: { type: "array", items: { type: "string" } },
          allow_empty: { type: "boolean" },
        },
      },
      output_schema: {
        type: "object",
        required: ["ok", "commit", "summary"],
        properties: {
          ok: { type: "boolean" },
          commit: { type: "string" },
          summary: { type: "string" },
        },
      },
      capabilities: { network: false, filesystem: true, write: true, side_effects: true },
      safety_tags: ["git", "write"],
      scopes: { workspace_roots: policy.workspaceRoots },
    }),
    async run(args: { repo_path: string; message: string; paths?: string[]; allow_empty?: boolean }) {
      const repoPath = ensureWithinWorkspace(path.resolve(args.repo_path), policy.workspaceRoots);
      const message = args.message.trim();
      if (!message) {
        throw new Error("git.commit requires a non-empty message");
      }
      const command = ["-C", repoPath, "commit", "-m", message];
      if (args.allow_empty) {
        command.push("--allow-empty");
      }
      if (Array.isArray(args.paths) && args.paths.length > 0) {
        command.push("--");
        for (const entry of args.paths) {
          if (!entry || typeof entry !== "string") continue;
          command.push(entry);
        }
      }
      const { stdout, stderr, code } = await runGitCommand(command, {
        cwd: repoPath,
        timeoutMs: policy.commandTimeoutMs,
        maxOutputBytes: policy.maxOutputBytes,
        allowExitCodes: [0],
      });
      if (code !== 0) {
        throw new Error(`git.commit failed: ${stderr || stdout}`);
      }
      const hashOutput = await runGitCommand(["-C", repoPath, "rev-parse", "HEAD"], {
        cwd: repoPath,
        timeoutMs: policy.commandTimeoutMs,
        maxOutputBytes: 1024,
        allowExitCodes: [0],
      });
      return {
        ok: true,
        commit: hashOutput.stdout.trim(),
        summary: stdout.trim() || stderr.trim(),
      };
    },
  };
}

export function createGitBranchTool(options: DevToolsOptions = {}): Tool {
  const policy = createDevPolicy(options);
  return {
    name: "git.branch",
    description: "List/create/switch branches with guarded operations.",
    manifest: createManifest({
      name: "git.branch",
      description: "Safe branch operations without arbitrary command passthrough.",
      input_schema: {
        type: "object",
        additionalProperties: false,
        required: ["repo_path", "action"],
        properties: {
          repo_path: { type: "string", minLength: 1 },
          action: { type: "string", enum: ["list", "current", "create", "switch"] },
          name: { type: "string" },
          from: { type: "string" },
        },
      },
      output_schema: {
        type: "object",
        required: ["action"],
        properties: {
          action: { type: "string" },
          current: { type: "string" },
          branches: { type: "array", items: { type: "string" } },
          created: { type: "string" },
          switched: { type: "string" },
        },
      },
      capabilities: { network: false, filesystem: true, write: true, side_effects: true },
      safety_tags: ["git", "branch"],
      scopes: { workspace_roots: policy.workspaceRoots },
    }),
    async run(args: { repo_path: string; action: "list" | "current" | "create" | "switch"; name?: string; from?: string }) {
      const repoPath = ensureWithinWorkspace(path.resolve(args.repo_path), policy.workspaceRoots);
      if (args.action === "list") {
        const { stdout } = await runGitCommand(["-C", repoPath, "branch", "--format=%(refname:short)"], {
          cwd: repoPath,
          timeoutMs: policy.commandTimeoutMs,
          maxOutputBytes: policy.maxOutputBytes,
          allowExitCodes: [0],
        });
        return {
          action: args.action,
          branches: stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean),
        };
      }
      if (args.action === "current") {
        const { stdout } = await runGitCommand(["-C", repoPath, "rev-parse", "--abbrev-ref", "HEAD"], {
          cwd: repoPath,
          timeoutMs: policy.commandTimeoutMs,
          maxOutputBytes: 1024,
          allowExitCodes: [0],
        });
        return {
          action: args.action,
          current: stdout.trim(),
        };
      }
      const name = args.name?.trim();
      if (!name || !isSafeBranchName(name)) {
        throw new Error("git.branch requires a safe branch name");
      }
      if (args.action === "create") {
        const command = ["-C", repoPath, "branch", name];
        if (args.from?.trim()) {
          command.push(args.from.trim());
        }
        await runGitCommand(command, {
          cwd: repoPath,
          timeoutMs: policy.commandTimeoutMs,
          maxOutputBytes: policy.maxOutputBytes,
          allowExitCodes: [0],
        });
        return {
          action: args.action,
          created: name,
        };
      }
      if (args.action === "switch") {
        await runGitCommand(["-C", repoPath, "switch", name], {
          cwd: repoPath,
          timeoutMs: policy.commandTimeoutMs,
          maxOutputBytes: policy.maxOutputBytes,
          allowExitCodes: [0],
        });
        return {
          action: args.action,
          switched: name,
        };
      }
      throw new Error(`Unsupported git.branch action: ${args.action}`);
    },
  };
}

function createDevPolicy(options: DevToolsOptions): DevPolicy {
  return {
    workspaceRoots: (options.workspaceRoots ?? [process.cwd()]).map((entry) => path.resolve(entry)),
    maxOutputBytes: options.maxOutputBytes ?? 512_000,
    commandTimeoutMs: options.commandTimeoutMs ?? 15_000,
  };
}

async function runGitCommand(
  args: string[],
  options: {
    cwd: string;
    timeoutMs: number;
    maxOutputBytes: number;
    allowExitCodes: number[];
  }
): Promise<{ stdout: string; stderr: string; code: number }> {
  try {
    const result = await execFileAsync("git", args, {
      cwd: options.cwd,
      timeout: options.timeoutMs,
      maxBuffer: options.maxOutputBytes,
      encoding: "utf8",
    });
    return {
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
      code: 0,
    };
  } catch (error) {
    const e = error as NodeJS.ErrnoException & { stdout?: string; stderr?: string; code?: number | string };
    const code = typeof e.code === "number" ? e.code : Number.NaN;
    if (Number.isFinite(code) && options.allowExitCodes.includes(code)) {
      return {
        stdout: e.stdout ?? "",
        stderr: e.stderr ?? "",
        code,
      };
    }
    const stderr = e.stderr ?? e.message;
    throw new Error(`git command failed: ${stderr}`);
  }
}

function parseGitStatus(output: string): {
  branch: string;
  clean: boolean;
  files: Array<{ path: string; index: string; worktree: string }>;
} {
  const lines = output.split(/\r?\n/);
  let branch = "HEAD";
  const files: Array<{ path: string; index: string; worktree: string }> = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    if (line.startsWith("##")) {
      branch = line.slice(2).trim().split("...")[0] || branch;
      continue;
    }
    const index = line[0] ?? " ";
    const worktree = line[1] ?? " ";
    const filePath = line.slice(3).trim();
    files.push({
      path: filePath,
      index,
      worktree,
    });
  }
  return {
    branch,
    clean: files.length === 0,
    files,
  };
}

function ensureWithinWorkspace(resolvedPath: string, workspaceRoots: string[]): string {
  for (const root of workspaceRoots) {
    if (resolvedPath === root || resolvedPath.startsWith(`${root}${path.sep}`)) {
      return resolvedPath;
    }
  }
  throw new Error(`Path "${resolvedPath}" is outside allowed workspace roots`);
}

function isSafeBranchName(name: string): boolean {
  if (!/^[A-Za-z0-9._/-]+$/.test(name)) return false;
  if (name.startsWith("-")) return false;
  if (name.includes("..")) return false;
  if (name.includes("@{")) return false;
  if (name.endsWith("/")) return false;
  return true;
}

function createManifest(input: Omit<ToolManifest, "auth_requirements"> & { auth_requirements?: string[] }): ToolManifest {
  return {
    ...input,
    auth_requirements: input.auth_requirements ?? [],
  };
}

