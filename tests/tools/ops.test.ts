import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  createArtifactPackTool,
  createFsListTool,
  createFsReadTool,
  createFsWriteTool,
  createHttpRequestTool,
  createSchemaValidateJsonTool,
  createWebFetchTool,
} from "../../src/tools/ops.js";

describe("ops tools", () => {
  it("validates json against a schema", async () => {
    const tool = createSchemaValidateJsonTool();
    const ok = await tool.run(
      {
        value: { name: "Ada" },
        schema: {
          type: "object",
          required: ["name"],
          properties: { name: { type: "string" } },
        },
      },
      { metadata: undefined, signal: undefined }
    );
    const bad = await tool.run(
      {
        value: { name: 42 },
        schema: {
          type: "object",
          required: ["name"],
          properties: { name: { type: "string" } },
        },
      },
      { metadata: undefined, signal: undefined }
    );

    expect(ok).toEqual({ valid: true, errors: [] });
    expect((bad as { valid: boolean }).valid).toBe(false);
  });

  it("reads/writes/lists files in allowed workspace roots", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "feather-fs-"));
    const writeTool = createFsWriteTool({ workspaceRoots: [root] });
    const readTool = createFsReadTool({ workspaceRoots: [root] });
    const listTool = createFsListTool({ workspaceRoots: [root] });

    await writeTool.run(
      {
        path: path.join(root, "notes.txt"),
        content: "hello workspace",
        overwrite: true,
      },
      { metadata: undefined, signal: undefined }
    );

    const read = await readTool.run(
      {
        path: path.join(root, "notes.txt"),
      },
      { metadata: undefined, signal: undefined }
    );
    const listed = await listTool.run(
      {
        path: root,
      },
      { metadata: undefined, signal: undefined }
    );

    expect((read as { content: string }).content).toBe("hello workspace");
    expect((listed as { entries: Array<{ path: string }> }).entries.map((entry) => entry.path)).toContain("notes.txt");
  });

  it("rejects fs operations outside workspace roots", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "feather-fs-"));
    const readTool = createFsReadTool({ workspaceRoots: [root] });

    await expect(
      readTool.run(
        {
          path: "/etc/hosts",
        },
        { metadata: undefined, signal: undefined }
      )
    ).rejects.toThrow(/outside allowed workspace roots/);
  });

  it("fetches and cleans html content", async () => {
    const fetchTool = createWebFetchTool({
      allowedHosts: ["example.com"],
      fetch: async () =>
        ({
          status: 200,
          url: "https://example.com/news",
          headers: {
            get: (name: string) => (name.toLowerCase() === "content-type" ? "text/html" : null),
          },
          async arrayBuffer() {
            const bytes = Buffer.from(
              `<html><head><title>News</title><script>danger()</script></head><body>Hello <b>world</b></body></html>`,
              "utf8"
            );
            return Uint8Array.from(bytes).buffer;
          },
        }) as {
          status: number;
          url: string;
          headers: { get(name: string): string | null };
          arrayBuffer(): Promise<ArrayBuffer>;
        },
    });

    const result = await fetchTool.run(
      {
        url: "https://example.com/news",
      },
      { metadata: undefined, signal: undefined }
    );

    expect((result as { content: string }).content).toContain("Hello world");
    expect((result as { metadata: { title?: string } }).metadata.title).toBe("News");
  });

  it("blocks web fetch to local hosts", async () => {
    const fetchTool = createWebFetchTool({
      fetch: async () => {
        throw new Error("should not execute");
      },
    });
    await expect(
      fetchTool.run(
        {
          url: "http://localhost/internal",
        },
        { metadata: undefined, signal: undefined }
      )
    ).rejects.toThrow(/blocked/);
  });

  it("executes constrained http requests", async () => {
    const tool = createHttpRequestTool({
      allowedHosts: ["api.example.com"],
      fetch: async () =>
        ({
          status: 200,
          url: "https://api.example.com/v1/data",
          headers: {
            get: (name: string) => (name.toLowerCase() === "content-type" ? "application/json" : null),
          },
          async arrayBuffer() {
            const bytes = Buffer.from(JSON.stringify({ ok: true }), "utf8");
            return Uint8Array.from(bytes).buffer;
          },
        }) as {
          status: number;
          url: string;
          headers: { get(name: string): string | null };
          arrayBuffer(): Promise<ArrayBuffer>;
        },
    });

    const result = await tool.run(
      {
        url: "https://api.example.com/v1/data",
        method: "GET",
      },
      { metadata: undefined, signal: undefined }
    );
    expect((result as { status: number }).status).toBe(200);
    expect((result as { body_json: { ok: boolean } }).body_json.ok).toBe(true);
  });

  it("creates a versioned artifact bundle", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "feather-artifact-"));
    const sourceFile = path.join(root, "a.txt");
    await writeFile(sourceFile, "artifact content", "utf8");
    const tool = createArtifactPackTool({ workspaceRoots: [root] });

    const result = await tool.run(
      {
        workspace_root: root,
        files: ["a.txt"],
        output_path: "dist/bundle.json",
        run_metadata: { run: "test" },
      },
      { metadata: undefined, signal: undefined }
    );

    const outputPath = (result as { output_path: string }).output_path;
    const raw = await readFile(outputPath, "utf8");
    expect((result as { ok: boolean }).ok).toBe(true);
    expect(raw).toContain("\"a.txt\"");
    expect(raw).toContain("\"run\": \"test\"");
  });
});
