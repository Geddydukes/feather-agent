import { describe, expect, it } from "vitest";

import { createConnectorInvokeTool } from "../../src/tools/connectors.js";

describe("connector tools", () => {
  it("invokes allowlisted connector operations", async () => {
    const tool = createConnectorInvokeTool(
      {
        invoke: async ({ connector_name, operation }) => ({
          ok: true,
          data: { connector_name, operation },
        }),
      },
      {
        allowedConnectors: ["crm"],
        allowedOperations: ["upsert_contact"],
      }
    );

    const result = await tool.run(
      {
        connector_name: "crm",
        operation: "upsert_contact",
        args: { id: "123" },
      },
      { metadata: undefined, signal: undefined }
    );
    expect((result as { ok: boolean }).ok).toBe(true);
  });

  it("blocks non-allowlisted connector operations", async () => {
    const tool = createConnectorInvokeTool(
      {
        invoke: async () => ({ ok: true }),
      },
      {
        allowedConnectors: ["crm"],
      }
    );
    await expect(
      tool.run(
        {
          connector_name: "payments",
          operation: "charge",
        },
        { metadata: undefined, signal: undefined }
      )
    ).rejects.toThrow(/not allowlisted/);
  });
});
