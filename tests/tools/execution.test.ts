import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

import {
  createNodeRunSandboxTool,
  createPythonRunSandboxTool,
  createShellRunRestrictedTool,
} from "../../src/tools/execution.js";

const pythonAvailable = spawnSync("python3", ["--version"], { encoding: "utf8" }).status === 0;
const describePython = pythonAvailable ? describe : describe.skip;

describe("execution tools", () => {
  it("runs node code in sandbox mode with env allowlist", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "feather-node-run-"));
    const tool = createNodeRunSandboxTool({
      workspaceRoots: [root],
      allowedEnvKeys: ["SAFE_KEY"],
    });
    const result = await tool.run(
      {
        code: "console.log(`ok:${process.env.SAFE_KEY ?? 'missing'}`)",
        env: {
          SAFE_KEY: "yes",
          BLOCKED_KEY: "no",
        },
      },
      { metadata: undefined, signal: undefined }
    );

    expect((result as { ok: boolean }).ok).toBe(true);
    expect((result as { stdout: string }).stdout).toContain("ok:yes");
  });

  it("blocks obvious network patterns when network is disabled", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "feather-node-run-"));
    const tool = createNodeRunSandboxTool({
      workspaceRoots: [root],
      allowNetwork: false,
    });
    await expect(
      tool.run(
        {
          code: "await fetch('https://example.com')",
        },
        { metadata: undefined, signal: undefined }
      )
    ).rejects.toThrow(/blocked potential network usage pattern/);
  });

  it("runs allowlisted shell commands and blocks others", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "feather-shell-run-"));
    const tool = createShellRunRestrictedTool({
      workspaceRoots: [root],
      shellAllowlist: ["echo"],
    });
    const ok = await tool.run(
      {
        command: "echo",
        args: ["hello"],
      },
      { metadata: undefined, signal: undefined }
    );
    expect((ok as { ok: boolean }).ok).toBe(true);
    expect((ok as { stdout: string }).stdout).toContain("hello");

    await expect(
      tool.run(
        {
          command: "npm",
          args: ["test"],
        },
        { metadata: undefined, signal: undefined }
      )
    ).rejects.toThrow(/not allowlisted/);
  });

  it("enforces cwd workspace restrictions for shell commands", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "feather-shell-run-"));
    const tool = createShellRunRestrictedTool({
      workspaceRoots: [root],
      shellAllowlist: ["echo"],
    });
    await expect(
      tool.run(
        {
          command: "echo",
          args: ["hi"],
          cwd: "/tmp",
        },
        { metadata: undefined, signal: undefined }
      )
    ).rejects.toThrow(/outside allowed workspace roots/);
  });
});

describePython("python execution tool", () => {
  it("runs python code in sandbox mode", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "feather-python-run-"));
    const tool = createPythonRunSandboxTool({
      workspaceRoots: [root],
      allowedEnvKeys: ["SAFE_KEY"],
    });
    const result = await tool.run(
      {
        code: "import os; print('py:' + os.getenv('SAFE_KEY', 'missing'))",
        env: { SAFE_KEY: "yes" },
      },
      { metadata: undefined, signal: undefined }
    );
    expect((result as { ok: boolean }).ok).toBe(true);
    expect((result as { stdout: string }).stdout).toContain("py:yes");
  });
});
