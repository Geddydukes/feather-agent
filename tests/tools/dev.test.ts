import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

import {
  createFsDiffTool,
  createGitBranchTool,
  createGitCommitTool,
  createGitDiffTool,
  createGitStatusTool,
} from "../../src/tools/dev.js";

const gitAvailable = spawnSync("git", ["--version"], { encoding: "utf8" }).status === 0;
const describeGit = gitAvailable ? describe : describe.skip;

describe("dev tools", () => {
  it("produces unified diffs for workspace files", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "feather-dev-"));
    const a = path.join(root, "a.txt");
    const b = path.join(root, "b.txt");
    await writeFile(a, "line1\nline2\n", "utf8");
    await writeFile(b, "line1\nlineX\n", "utf8");

    const tool = createFsDiffTool({ workspaceRoots: [root] });
    const result = await tool.run(
      {
        path_a: a,
        path_b: b,
      },
      { metadata: undefined, signal: undefined }
    );
    expect((result as { diff: string }).diff).toContain("@@");
    expect((result as { diff: string }).diff).toContain("-line2");
    expect((result as { diff: string }).diff).toContain("+lineX");
  });
});

describeGit("git tools", () => {
  it("reads status and diff, commits changes, and manages branches", async () => {
    const repo = await mkdtemp(path.join(os.tmpdir(), "feather-git-"));
    runGit(["init"], repo);
    runGit(["config", "user.email", "bot@example.com"], repo);
    runGit(["config", "user.name", "Feather Bot"], repo);
    await writeFile(path.join(repo, "a.txt"), "alpha\n", "utf8");
    runGit(["add", "a.txt"], repo);
    runGit(["commit", "-m", "init"], repo);

    await writeFile(path.join(repo, "a.txt"), "alpha\nbeta\n", "utf8");

    const statusTool = createGitStatusTool({ workspaceRoots: [repo] });
    const diffTool = createGitDiffTool({ workspaceRoots: [repo] });
    const commitTool = createGitCommitTool({ workspaceRoots: [repo] });
    const branchTool = createGitBranchTool({ workspaceRoots: [repo] });

    const status = await statusTool.run(
      { repo_path: repo },
      { metadata: undefined, signal: undefined }
    );
    expect((status as { clean: boolean }).clean).toBe(false);

    const diff = await diffTool.run(
      { repo_path: repo },
      { metadata: undefined, signal: undefined }
    );
    expect((diff as { diff: string }).diff).toContain("+beta");

    runGit(["add", "a.txt"], repo);
    const commit = await commitTool.run(
      { repo_path: repo, message: "update a" },
      { metadata: undefined, signal: undefined }
    );
    expect((commit as { ok: boolean }).ok).toBe(true);

    const branchCreate = await branchTool.run(
      { repo_path: repo, action: "create", name: "feature/test" },
      { metadata: undefined, signal: undefined }
    );
    expect((branchCreate as { created: string }).created).toBe("feature/test");

    const branchSwitch = await branchTool.run(
      { repo_path: repo, action: "switch", name: "feature/test" },
      { metadata: undefined, signal: undefined }
    );
    expect((branchSwitch as { switched: string }).switched).toBe("feature/test");

    const current = await branchTool.run(
      { repo_path: repo, action: "current" },
      { metadata: undefined, signal: undefined }
    );
    expect((current as { current: string }).current).toBe("feature/test");
  });

  it("enforces workspace restrictions on git tools", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "feather-git-"));
    const tool = createGitStatusTool({ workspaceRoots: [root] });
    await expect(
      tool.run(
        { repo_path: "/tmp/not-allowed-repo" },
        { metadata: undefined, signal: undefined }
      )
    ).rejects.toThrow(/outside allowed workspace roots/);
  });
});

function runGit(args: string[], cwd: string): string {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `git ${args.join(" ")} failed`);
  }
  return result.stdout;
}

