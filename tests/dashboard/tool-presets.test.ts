import { describe, expect, it } from "vitest";

import { listDashboardToolPresets } from "../../src/dashboard/tool-presets.js";

describe("dashboard tool presets", () => {
  it("returns stable presets with required metadata", () => {
    const presets = listDashboardToolPresets();
    const ids = presets.map((preset) => preset.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "calculator",
        "web-search",
        "db-query-sql",
        "vector-search",
        "shell-restricted",
        "connector-invoke",
        "plan-create",
      ])
    );
    presets.forEach((preset) => {
      expect(typeof preset.label).toBe("string");
      expect(typeof preset.summary).toBe("string");
      expect(typeof preset.recommendedToolName).toBe("string");
      expect(typeof preset.definition).toBe("object");
    });
  });

  it("returns cloned preset definitions", () => {
    const presets = listDashboardToolPresets();
    presets[0].definition.description = "mutated";

    const fresh = listDashboardToolPresets();
    expect(fresh[0].definition.description).not.toBe("mutated");
  });
});
