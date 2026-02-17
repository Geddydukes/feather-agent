import { describe, expect, it } from "vitest";

import {
  createRemoteSqlAdapter,
  createRemoteWebSearchAdapter,
} from "../../src/tools/remote-adapters.js";

describe("remote adapters", () => {
  it("uses env-backed base url and api key with path overrides", async () => {
    const calls: Array<{ url: string; headers: Record<string, string>; body: unknown }> = [];
    const fetchImpl: typeof fetch = (async (url, init) => {
      calls.push({
        url: String(url),
        headers: (init?.headers as Record<string, string>) ?? {},
        body: JSON.parse(String(init?.body ?? "{}")),
      });
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify([
            { title: "A", url: "https://example.com/a", snippet: "a" },
          ]);
        },
      } as unknown as Response;
    }) as typeof fetch;

    const adapter = createRemoteWebSearchAdapter({
      baseUrlEnv: "REMOTE_BASE_URL",
      apiKeyEnv: "REMOTE_API_KEY",
      paths: {
        web_search: "/search",
      },
      getEnv: (key) => {
        if (key === "REMOTE_BASE_URL") return "https://platform.example.com";
        if (key === "REMOTE_API_KEY") return "secret-token";
        return undefined;
      },
      fetchImpl,
    });

    const results = await adapter.search({
      query: "alpha",
      topK: 5,
    });

    expect(results).toHaveLength(1);
    expect(calls[0].url).toBe("https://platform.example.com/search");
    expect(calls[0].headers.Authorization).toBe("Bearer secret-token");
    expect(calls[0].body).toEqual({ query: "alpha", topK: 5 });
  });

  it("maps SQL payloads and validates response shape", async () => {
    const adapter = createRemoteSqlAdapter({
      baseUrl: "https://platform.example.com",
      fetchImpl: (async () =>
        ({
          ok: true,
          status: 200,
          async text() {
            return JSON.stringify({
              ok: true,
              data: {
                rows: [{ id: 1 }],
                row_count: 1,
              },
            });
          },
        }) as unknown as Response) as typeof fetch,
    });

    const result = await adapter.query({
      sql: "SELECT 1",
    });

    expect(result.row_count).toBe(1);
    expect(result.rows[0].id).toBe(1);
  });

  it("throws when remote base URL is missing", () => {
    expect(() =>
      createRemoteWebSearchAdapter({
        apiKey: "x",
      })
    ).toThrow(/baseUrl or baseUrlEnv/);
  });
});
