import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  InMemoryVectorStore,
  createCsvReadTool,
  createCsvWriteTool,
  createDbQuerySqlTool,
  createVectorSearchTool,
  createVectorUpsertTool,
} from "../../src/tools/data.js";

describe("data tools", () => {
  it("executes parameterized read-only SQL queries", async () => {
    const adapter = {
      query: async () => ({
        rows: [
          { id: 1, status: "open" },
          { id: 2, status: "closed" },
        ],
      }),
    };
    const tool = createDbQuerySqlTool(adapter, { defaultReadOnly: true, defaultMaxRows: 1 });
    const result = await tool.run(
      {
        sql: "SELECT id, status FROM tickets WHERE status = $1",
        params: ["open"],
      },
      { metadata: undefined, signal: undefined }
    );

    expect((result as { rows: Array<{ id: number }> }).rows).toHaveLength(1);
    expect((result as { truncated: boolean }).truncated).toBe(true);
  });

  it("rejects non-read-only SQL when read-only policy is active", async () => {
    const adapter = {
      query: async () => ({ rows: [] }),
    };
    const tool = createDbQuerySqlTool(adapter, { defaultReadOnly: true });
    await expect(
      tool.run(
        {
          sql: "UPDATE accounts SET status = 'inactive'",
        },
        { metadata: undefined, signal: undefined }
      )
    ).rejects.toThrow(/Read-only mode/);
  });

  it("upserts and searches vector records", async () => {
    const store = new InMemoryVectorStore();
    const upsert = createVectorUpsertTool(store);
    const search = createVectorSearchTool(store);

    await upsert.run(
      {
        namespace: "agent:user",
        items: [
          { source_id: "a", text: "agent framework planning notes", metadata: { team: "core" } },
          { source_id: "b", text: "gardening tips and soil prep", metadata: { team: "home" } },
        ],
      },
      { metadata: undefined, signal: undefined }
    );
    const result = await search.run(
      {
        namespace: "agent:user",
        query_text: "framework planning",
        top_k: 2,
      },
      { metadata: undefined, signal: undefined }
    );

    expect((result as { chunks: Array<{ source_id: string }> }).chunks[0].source_id).toBe("a");
  });

  it("reads and writes csv files with workspace guardrails", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "feather-csv-"));
    const filePath = path.join(root, "rows.csv");
    const writeTool = createCsvWriteTool({ workspaceRoots: [root] });
    const readTool = createCsvReadTool({ workspaceRoots: [root] });

    await writeTool.run(
      {
        path: filePath,
        rows: [
          { name: "alpha", amount: 12 },
          { name: "=2+2", amount: 7 },
        ],
      },
      { metadata: undefined, signal: undefined }
    );
    const raw = await readFile(filePath, "utf8");
    expect(raw).toContain("'=2+2");

    const parsed = await readTool.run(
      {
        path: filePath,
        schema: { name: "string", amount: "number" },
      },
      { metadata: undefined, signal: undefined }
    );
    expect((parsed as { row_count: number }).row_count).toBe(2);
    expect((parsed as { columns: string[] }).columns).toEqual(["name", "amount"]);
  });

  it("rejects csv reads outside workspace roots", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "feather-csv-"));
    const tool = createCsvReadTool({ workspaceRoots: [root] });
    await expect(
      tool.run(
        {
          path: "/tmp/not-allowed.csv",
        },
        { metadata: undefined, signal: undefined }
      )
    ).rejects.toThrow(/outside allowed workspace roots/);
  });
});
