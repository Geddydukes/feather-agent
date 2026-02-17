import { describe, expect, it } from "vitest";

import {
  InMemoryBudgetManager,
  InMemoryPlanStore,
  createBudgetConsumeTool,
  createBudgetGetTool,
  createPlanCreateTool,
  createPlanUpdateTool,
  createTaskSpawnTool,
} from "../../src/tools/control.js";

describe("control-plane tools", () => {
  it("creates and updates plans", async () => {
    const store = new InMemoryPlanStore();
    const createTool = createPlanCreateTool(store);
    const updateTool = createPlanUpdateTool(store);

    const created = await createTool.run(
      {
        namespace: "agent:user",
        goal: "Ship feature",
        steps: [
          { id: "s1", title: "Design" },
          { id: "s2", title: "Implement", depends_on: ["s1"] },
        ],
      },
      { metadata: undefined, signal: undefined }
    );
    const planId = (created as { plan: { plan_id: string } }).plan.plan_id;

    const updated = await updateTool.run(
      {
        namespace: "agent:user",
        plan_id: planId,
        status: "active",
        step_updates: [{ id: "s1", status: "completed" }],
      },
      { metadata: undefined, signal: undefined }
    );
    expect((updated as { plan: { status: string } }).plan.status).toBe("active");
  });

  it("tracks and enforces budgets", async () => {
    const manager = new InMemoryBudgetManager({ tokens: 10, tool_calls: 2, milliseconds: 1000 });
    const getTool = createBudgetGetTool(manager);
    const consumeTool = createBudgetConsumeTool(manager);

    await consumeTool.run(
      {
        scope: "session:1",
        tokens: 4,
        tool_calls: 1,
      },
      { metadata: undefined, signal: undefined }
    );
    const budget = await getTool.run(
      {
        scope: "session:1",
      },
      { metadata: undefined, signal: undefined }
    );
    expect((budget as { remaining: { tokens: number } }).remaining.tokens).toBe(6);

    expect(() =>
      consumeTool.run(
        {
          scope: "session:1",
          tokens: 7,
        },
        { metadata: undefined, signal: undefined }
      )
    ).toThrow(/budget exceeded/i);
  });

  it("spawns tasks with profile restrictions", async () => {
    const tool = createTaskSpawnTool(
      {
        spawn: async () => ({
          task_id: "task-1",
          status: "queued",
          agent_id: "agent-research",
        }),
      },
      {
        allowedProfiles: ["research-only"],
      }
    );

    await expect(
      tool.run(
        {
          objective: "Summarize filings",
          profile: "admin",
        },
        { metadata: undefined, signal: undefined }
      )
    ).rejects.toThrow(/not allowlisted/);

    const result = await tool.run(
      {
        objective: "Summarize filings",
        profile: "research-only",
      },
      { metadata: undefined, signal: undefined }
    );
    expect((result as { task_id: string }).task_id).toBe("task-1");
  });
});
