import { gunzipSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import { dispatchDashboardApiRequest } from "../../src/dashboard/server.js";

describe("dashboard server API dispatch", () => {
  it("returns dashboard tool presets", async () => {
    const response = await dispatchDashboardApiRequest({
      method: "GET",
      pathname: "/api/tool-presets",
    });
    expect(response?.status).toBe(200);
    const payload = response?.json as { presets: Array<{ id: string }> };
    expect(Array.isArray(payload.presets)).toBe(true);
    expect(payload.presets.map((preset) => preset.id)).toEqual(
      expect.arrayContaining(["calculator", "web-search"])
    );
  });

  it("returns 400 for malformed JSON payloads", async () => {
    const response = await dispatchDashboardApiRequest({
      method: "POST",
      pathname: "/api/export",
      body: "{not-json",
    });
    expect(response?.status).toBe(400);
    expect((response?.json as { error: string }).error).toContain("Failed to parse request body");
  });

  it("returns 413 when payload exceeds limit", async () => {
    const response = await dispatchDashboardApiRequest({
      method: "POST",
      pathname: "/api/validate",
      body: "x".repeat(1024 * 1024 + 1),
    });
    expect(response?.status).toBe(413);
    expect((response?.json as { error: string }).error).toContain("exceeds");
  });

  it("returns a tar.gz package for valid export requests", async () => {
    const response = await dispatchDashboardApiRequest({
      method: "POST",
      pathname: "/api/export",
      body: JSON.stringify({
        config: {
          version: 1,
          providers: {
            entries: {
              openai: {
                builtin: "openai",
                models: [{ name: "gpt-4o-mini" }],
              },
            },
          },
          tools: {
            calculator: {
              builtin: "calc",
            },
          },
          agents: {
            default: {
              planner: {
                kind: "json",
                model: "gpt-4o-mini",
              },
              tools: ["calculator"],
            },
          },
          defaults: {
            agent: "default",
          },
        },
        agent: "default",
        packageName: "dashboard-export",
      }),
    });

    expect(response?.status).toBe(200);
    expect(response?.headers?.["Content-Type"]).toBe("application/gzip");
    expect(response?.headers?.["Content-Disposition"]).toContain("dashboard-export.tar.gz");

    const archive = response?.body;
    expect(Buffer.isBuffer(archive)).toBe(true);
    const entries = readTarEntries(gunzipSync(archive as Buffer));
    expect(entries.has("package.json")).toBe(true);
    expect(entries.has("legionaire.config.json")).toBe(true);
    expect(entries.has("src/run-agent.mjs")).toBe(true);
  });

  it("returns 400 for /api/run when prompt is missing", async () => {
    const response = await dispatchDashboardApiRequest({
      method: "POST",
      pathname: "/api/run",
      body: JSON.stringify({
        config: {
          version: 1,
          providers: { entries: {} },
          agents: { a: { planner: { kind: "json", model: "x" } } },
          defaults: { agent: "a" },
        },
      }),
    });
    expect(response?.status).toBe(400);
    expect((response?.json as { error: string }).error).toContain("prompt");
  });
});

function readTarEntries(buffer: Buffer): Map<string, Buffer> {
  const files = new Map<string, Buffer>();
  let offset = 0;
  while (offset + 512 <= buffer.length) {
    const header = buffer.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) {
      break;
    }
    const name = readString(header, 0, 100);
    const prefix = readString(header, 345, 155);
    const filePath = prefix ? `${prefix}/${name}` : name;
    const sizeRaw = readString(header, 124, 12).trim();
    const size = sizeRaw ? Number.parseInt(sizeRaw, 8) : 0;
    const contentStart = offset + 512;
    const contentEnd = contentStart + size;
    files.set(filePath, buffer.subarray(contentStart, contentEnd));
    offset = contentStart + Math.ceil(size / 512) * 512;
  }
  return files;
}

function readString(buffer: Buffer, offset: number, length: number): string {
  return buffer
    .subarray(offset, offset + length)
    .toString("utf8")
    .replace(/\0.*$/, "");
}
