import { randomUUID } from "node:crypto";

import type { Tool } from "./types.js";
import type { ToolManifest } from "./manifest.js";

type PlanStatus = "draft" | "active" | "completed" | "blocked";
type PlanStepStatus = "pending" | "in_progress" | "completed" | "blocked";

interface PlanStep {
  id: string;
  title: string;
  status: PlanStepStatus;
  depends_on?: string[];
  exit_criteria?: string;
  notes?: string;
}

interface PlanRecord {
  plan_id: string;
  namespace: string;
  goal: string;
  status: PlanStatus;
  steps: PlanStep[];
  notes?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export class InMemoryPlanStore {
  private readonly plans = new Map<string, PlanRecord>();

  create(input: {
    namespace: string;
    plan_id?: string;
    goal: string;
    steps: Array<{ id: string; title: string; depends_on?: string[]; exit_criteria?: string }>;
    metadata?: Record<string, unknown>;
  }): PlanRecord {
    const namespace = normalizeScope(input.namespace);
    const planId = input.plan_id?.trim() || randomUUID();
    const key = `${namespace}:${planId}`;
    if (this.plans.has(key)) {
      throw new Error(`Plan "${planId}" already exists in namespace "${namespace}"`);
    }
    const now = new Date().toISOString();
    const plan: PlanRecord = {
      plan_id: planId,
      namespace,
      goal: input.goal.trim(),
      status: "draft",
      steps: input.steps.map((step) => ({
        id: step.id,
        title: step.title,
        status: "pending",
        depends_on: step.depends_on,
        exit_criteria: step.exit_criteria,
      })),
      metadata: input.metadata,
      created_at: now,
      updated_at: now,
    };
    this.plans.set(key, plan);
    return clonePlan(plan);
  }

  update(input: {
    namespace: string;
    plan_id: string;
    status?: PlanStatus;
    notes?: string;
    step_updates?: Array<{
      id: string;
      status?: PlanStepStatus;
      notes?: string;
      title?: string;
      exit_criteria?: string;
      depends_on?: string[];
    }>;
  }): PlanRecord {
    const namespace = normalizeScope(input.namespace);
    const key = `${namespace}:${input.plan_id.trim()}`;
    const current = this.plans.get(key);
    if (!current) {
      throw new Error(`Plan "${input.plan_id}" not found in namespace "${namespace}"`);
    }
    if (input.status) {
      current.status = input.status;
    }
    if (input.notes !== undefined) {
      current.notes = input.notes;
    }
    for (const update of input.step_updates ?? []) {
      const step = current.steps.find((entry) => entry.id === update.id);
      if (!step) {
        throw new Error(`Step "${update.id}" not found in plan "${current.plan_id}"`);
      }
      if (update.status) step.status = update.status;
      if (update.notes !== undefined) step.notes = update.notes;
      if (update.title !== undefined) step.title = update.title;
      if (update.exit_criteria !== undefined) step.exit_criteria = update.exit_criteria;
      if (update.depends_on !== undefined) step.depends_on = update.depends_on;
    }
    current.updated_at = new Date().toISOString();
    return clonePlan(current);
  }
}

interface BudgetLimits {
  tokens: number;
  tool_calls: number;
  milliseconds: number;
}

interface BudgetUsage {
  tokens: number;
  tool_calls: number;
  milliseconds: number;
}

interface BudgetState {
  limits: BudgetLimits;
  used: BudgetUsage;
}

export class InMemoryBudgetManager {
  private readonly states = new Map<string, BudgetState>();

  constructor(private readonly defaultLimits: BudgetLimits = { tokens: 100000, tool_calls: 1000, milliseconds: 300000 }) {}

  get(scope: string, limits?: Partial<BudgetLimits>): BudgetState {
    const key = normalizeScope(scope);
    let state = this.states.get(key);
    if (!state) {
      state = {
        limits: applyBudgetLimits(this.defaultLimits, limits),
        used: { tokens: 0, tool_calls: 0, milliseconds: 0 },
      };
      this.states.set(key, state);
    } else if (limits) {
      state.limits = applyBudgetLimits(state.limits, limits);
    }
    return cloneBudgetState(state);
  }

  consume(scope: string, delta: Partial<BudgetUsage>, limits?: Partial<BudgetLimits>): BudgetState {
    const key = normalizeScope(scope);
    const current = this.get(key, limits);
    const nextUsed: BudgetUsage = {
      tokens: current.used.tokens + (delta.tokens ?? 0),
      tool_calls: current.used.tool_calls + (delta.tool_calls ?? 0),
      milliseconds: current.used.milliseconds + (delta.milliseconds ?? 0),
    };
    if (nextUsed.tokens > current.limits.tokens) {
      throw new Error(`Token budget exceeded (${nextUsed.tokens} > ${current.limits.tokens})`);
    }
    if (nextUsed.tool_calls > current.limits.tool_calls) {
      throw new Error(`Tool-call budget exceeded (${nextUsed.tool_calls} > ${current.limits.tool_calls})`);
    }
    if (nextUsed.milliseconds > current.limits.milliseconds) {
      throw new Error(`Time budget exceeded (${nextUsed.milliseconds} > ${current.limits.milliseconds})`);
    }
    const updated: BudgetState = {
      limits: current.limits,
      used: nextUsed,
    };
    this.states.set(key, updated);
    return cloneBudgetState(updated);
  }
}

export interface TaskSpawnAdapter {
  spawn(request: {
    objective: string;
    profile?: string;
    tool_allowlist?: string[];
    max_iterations?: number;
    input?: Record<string, unknown>;
    signal?: AbortSignal;
    metadata?: Record<string, unknown>;
  }): Promise<{
    task_id: string;
    status: "queued" | "running" | "completed" | "failed";
    agent_id?: string;
    message?: string;
  }>;
}

export interface TaskSpawnOptions {
  allowedProfiles?: string[];
  requireHumanConfirmation?: boolean;
}

export function createPlanCreateTool(store: InMemoryPlanStore): Tool {
  const name = "plan.create";
  const description = "Create structured execution plans with explicit step state.";
  return {
    name,
    description,
    manifest: createManifest({
      name,
      description,
      input_schema: {
        type: "object",
        additionalProperties: false,
        required: ["goal", "steps"],
        properties: {
          namespace: { type: "string" },
          plan_id: { type: "string" },
          goal: { type: "string", minLength: 1 },
          steps: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              required: ["id", "title"],
              properties: {
                id: { type: "string" },
                title: { type: "string" },
                depends_on: { type: "array", items: { type: "string" } },
                exit_criteria: { type: "string" },
              },
            },
          },
          metadata: { type: "object" },
        },
      },
      output_schema: {
        type: "object",
        required: ["ok", "plan"],
        properties: {
          ok: { type: "boolean" },
          plan: { type: "object" },
        },
      },
      capabilities: { network: false, filesystem: false, write: true, side_effects: false },
      safety_tags: ["planning", "control-plane"],
    }),
    run(args: {
      namespace?: string;
      plan_id?: string;
      goal: string;
      steps: Array<{ id: string; title: string; depends_on?: string[]; exit_criteria?: string }>;
      metadata?: Record<string, unknown>;
    }) {
      const plan = store.create({
        namespace: args.namespace ?? "default",
        plan_id: args.plan_id,
        goal: args.goal,
        steps: args.steps,
        metadata: args.metadata,
      });
      return { ok: true, plan };
    },
  };
}

export function createPlanUpdateTool(store: InMemoryPlanStore): Tool {
  const name = "plan.update";
  const description = "Update plan status and step lifecycle fields.";
  return {
    name,
    description,
    manifest: createManifest({
      name,
      description,
      input_schema: {
        type: "object",
        additionalProperties: false,
        required: ["plan_id"],
        properties: {
          namespace: { type: "string" },
          plan_id: { type: "string", minLength: 1 },
          status: { type: "string", enum: ["draft", "active", "completed", "blocked"] },
          notes: { type: "string" },
          step_updates: {
            type: "array",
            items: {
              type: "object",
              required: ["id"],
              properties: {
                id: { type: "string" },
                status: { type: "string", enum: ["pending", "in_progress", "completed", "blocked"] },
                notes: { type: "string" },
                title: { type: "string" },
                exit_criteria: { type: "string" },
                depends_on: { type: "array", items: { type: "string" } },
              },
            },
          },
        },
      },
      output_schema: {
        type: "object",
        required: ["ok", "plan"],
        properties: {
          ok: { type: "boolean" },
          plan: { type: "object" },
        },
      },
      capabilities: { network: false, filesystem: false, write: true, side_effects: false },
      safety_tags: ["planning", "control-plane"],
    }),
    run(args: {
      namespace?: string;
      plan_id: string;
      status?: PlanStatus;
      notes?: string;
      step_updates?: Array<{
        id: string;
        status?: PlanStepStatus;
        notes?: string;
        title?: string;
        exit_criteria?: string;
        depends_on?: string[];
      }>;
    }) {
      const plan = store.update({
        namespace: args.namespace ?? "default",
        plan_id: args.plan_id,
        status: args.status,
        notes: args.notes,
        step_updates: args.step_updates,
      });
      return { ok: true, plan };
    },
  };
}

export function createTaskSpawnTool(adapter: TaskSpawnAdapter, options: TaskSpawnOptions = {}): Tool {
  if (!adapter || typeof adapter.spawn !== "function") {
    throw new Error("createTaskSpawnTool requires an adapter with spawn(request)");
  }
  const name = "task.spawn";
  const description = "Spawn sub-agents with restricted profiles and tool permissions.";
  const allowedProfiles = new Set((options.allowedProfiles ?? []).map((entry) => entry.trim()).filter(Boolean));
  const requireConfirmation = options.requireHumanConfirmation ?? false;
  return {
    name,
    description,
    manifest: createManifest({
      name,
      description,
      input_schema: {
        type: "object",
        additionalProperties: false,
        required: ["objective"],
        properties: {
          objective: { type: "string", minLength: 1 },
          profile: { type: "string" },
          tool_allowlist: { type: "array", items: { type: "string" } },
          max_iterations: { type: "integer", minimum: 1, maximum: 100 },
          input: { type: "object" },
          human_confirmed: { type: "boolean" },
        },
      },
      output_schema: {
        type: "object",
        required: ["ok", "task_id", "status"],
        properties: {
          ok: { type: "boolean" },
          task_id: { type: "string" },
          status: { type: "string" },
          agent_id: { type: "string" },
          message: { type: "string" },
        },
      },
      capabilities: { network: false, filesystem: false, write: true, side_effects: true },
      safety_tags: ["orchestration", "sub-agent", "human-confirmation"],
    }),
    async run(
      args: {
        objective: string;
        profile?: string;
        tool_allowlist?: string[];
        max_iterations?: number;
        input?: Record<string, unknown>;
        human_confirmed?: boolean;
      },
      ctx
    ) {
      if (requireConfirmation && !args.human_confirmed) {
        throw new Error("task.spawn requires human_confirmed=true");
      }
      if (args.profile && allowedProfiles.size > 0 && !allowedProfiles.has(args.profile)) {
        throw new Error(`task.spawn profile "${args.profile}" is not allowlisted`);
      }
      const result = await adapter.spawn({
        objective: args.objective,
        profile: args.profile,
        tool_allowlist: args.tool_allowlist,
        max_iterations: args.max_iterations,
        input: args.input,
        signal: ctx.signal,
        metadata: ctx.metadata,
      });
      return {
        ok: true,
        task_id: result.task_id,
        status: result.status,
        agent_id: result.agent_id,
        message: result.message,
      };
    },
  };
}

export function createBudgetGetTool(manager: InMemoryBudgetManager): Tool {
  const name = "budget.get";
  const description = "Read token/time/tool-call budget usage and remaining headroom.";
  return {
    name,
    description,
    manifest: createManifest({
      name,
      description,
      input_schema: {
        type: "object",
        additionalProperties: false,
        required: ["scope"],
        properties: {
          scope: { type: "string", minLength: 1 },
          limits: {
            type: "object",
            properties: {
              tokens: { type: "integer", minimum: 1 },
              tool_calls: { type: "integer", minimum: 1 },
              milliseconds: { type: "integer", minimum: 1 },
            },
          },
        },
      },
      output_schema: {
        type: "object",
        required: ["scope", "limits", "used", "remaining"],
        properties: {
          scope: { type: "string" },
          limits: { type: "object" },
          used: { type: "object" },
          remaining: { type: "object" },
        },
      },
      capabilities: { network: false, filesystem: false, write: false, side_effects: false },
      safety_tags: ["budget", "control-plane", "read"],
    }),
    run(args: { scope: string; limits?: Partial<BudgetLimits> }) {
      const state = manager.get(args.scope, sanitizeBudgetLimits(args.limits));
      return {
        scope: normalizeScope(args.scope),
        limits: state.limits,
        used: state.used,
        remaining: remainingBudget(state),
      };
    },
  };
}

export function createBudgetConsumeTool(manager: InMemoryBudgetManager): Tool {
  const name = "budget.consume";
  const description = "Consume budget units and enforce session bounds.";
  return {
    name,
    description,
    manifest: createManifest({
      name,
      description,
      input_schema: {
        type: "object",
        additionalProperties: false,
        required: ["scope"],
        properties: {
          scope: { type: "string", minLength: 1 },
          tokens: { type: "integer", minimum: 0 },
          tool_calls: { type: "integer", minimum: 0 },
          milliseconds: { type: "integer", minimum: 0 },
          limits: {
            type: "object",
            properties: {
              tokens: { type: "integer", minimum: 1 },
              tool_calls: { type: "integer", minimum: 1 },
              milliseconds: { type: "integer", minimum: 1 },
            },
          },
        },
      },
      output_schema: {
        type: "object",
        required: ["scope", "limits", "used", "remaining"],
        properties: {
          scope: { type: "string" },
          limits: { type: "object" },
          used: { type: "object" },
          remaining: { type: "object" },
        },
      },
      capabilities: { network: false, filesystem: false, write: true, side_effects: false },
      safety_tags: ["budget", "control-plane", "write"],
    }),
    run(args: { scope: string; tokens?: number; tool_calls?: number; milliseconds?: number; limits?: Partial<BudgetLimits> }) {
      const delta = {
        tokens: sanitizeNonNegative(args.tokens),
        tool_calls: sanitizeNonNegative(args.tool_calls),
        milliseconds: sanitizeNonNegative(args.milliseconds),
      };
      if (delta.tokens === 0 && delta.tool_calls === 0 && delta.milliseconds === 0) {
        throw new Error("budget.consume requires at least one positive consumption field");
      }
      const state = manager.consume(args.scope, delta, sanitizeBudgetLimits(args.limits));
      return {
        scope: normalizeScope(args.scope),
        limits: state.limits,
        used: state.used,
        remaining: remainingBudget(state),
      };
    },
  };
}

function applyBudgetLimits(base: BudgetLimits, overrides?: Partial<BudgetLimits>): BudgetLimits {
  return {
    tokens: sanitizePositive(overrides?.tokens) ?? base.tokens,
    tool_calls: sanitizePositive(overrides?.tool_calls) ?? base.tool_calls,
    milliseconds: sanitizePositive(overrides?.milliseconds) ?? base.milliseconds,
  };
}

function sanitizeBudgetLimits(value?: Partial<BudgetLimits>): Partial<BudgetLimits> | undefined {
  if (!value) return undefined;
  return {
    tokens: sanitizePositive(value.tokens),
    tool_calls: sanitizePositive(value.tool_calls),
    milliseconds: sanitizePositive(value.milliseconds),
  };
}

function sanitizePositive(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }
  return Math.floor(value);
}

function sanitizeNonNegative(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return 0;
  }
  return Math.floor(value);
}

function remainingBudget(state: BudgetState): BudgetUsage {
  return {
    tokens: Math.max(0, state.limits.tokens - state.used.tokens),
    tool_calls: Math.max(0, state.limits.tool_calls - state.used.tool_calls),
    milliseconds: Math.max(0, state.limits.milliseconds - state.used.milliseconds),
  };
}

function normalizeScope(value: string): string {
  const scope = value.trim();
  if (!scope) {
    throw new Error("scope must be a non-empty string");
  }
  return scope;
}

function clonePlan(plan: PlanRecord): PlanRecord {
  return JSON.parse(JSON.stringify(plan)) as PlanRecord;
}

function cloneBudgetState(state: BudgetState): BudgetState {
  return JSON.parse(JSON.stringify(state)) as BudgetState;
}

function createManifest(input: Omit<ToolManifest, "auth_requirements"> & { auth_requirements?: string[] }): ToolManifest {
  return {
    ...input,
    auth_requirements: input.auth_requirements ?? [],
  };
}
