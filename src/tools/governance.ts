import { enforceAllowlist, type AllowlistPolicy } from "./allowlist.js";
import type { Tool } from "./types.js";
import type { ToolManifest } from "./manifest.js";
import { DefaultPromptInjectionScanner, applyRedaction, type PromptInjectionScanner } from "./safety.js";

export interface CreatePromptInjectionScanToolOptions {
  scanner?: PromptInjectionScanner;
  blockThreshold?: number;
}

export function createPromptInjectionScanTool(options: CreatePromptInjectionScanToolOptions = {}): Tool {
  const scanner = options.scanner ?? new DefaultPromptInjectionScanner();
  const blockThreshold = options.blockThreshold ?? 0.7;
  if (typeof blockThreshold !== "number" || blockThreshold < 0 || blockThreshold > 1) {
    throw new Error("blockThreshold must be between 0 and 1");
  }
  const name = "prompt_injection.scan";
  const description = "Scan content for prompt-injection signals and return risk score + reasons.";
  return {
    name,
    description,
    manifest: createManifest({
      name,
      description,
      input_schema: {
        type: "object",
        additionalProperties: false,
        required: ["content"],
        properties: {
          content: {},
          threshold: { type: "number", minimum: 0, maximum: 1 },
        },
      },
      output_schema: {
        type: "object",
        required: ["score", "blocked", "reasons"],
        properties: {
          score: { type: "number" },
          blocked: { type: "boolean" },
          reasons: { type: "array", items: { type: "string" } },
        },
      },
      capabilities: { network: false, filesystem: false, write: false, side_effects: false },
      safety_tags: ["security", "prompt-injection"],
    }),
    run(args: { content: unknown; threshold?: number }) {
      const threshold = typeof args.threshold === "number" ? args.threshold : blockThreshold;
      const scan = scanner.scan(args.content);
      return {
        score: scan.score,
        reasons: scan.reasons,
        blocked: scan.score >= threshold,
      };
    },
  };
}

export function createRedactionApplyTool(): Tool {
  const name = "redaction.apply";
  const description = "Apply field-level redaction for secrets/PII-like keys in arbitrary payloads.";
  return {
    name,
    description,
    manifest: createManifest({
      name,
      description,
      input_schema: {
        type: "object",
        additionalProperties: false,
        required: ["content"],
        properties: {
          content: {},
        },
      },
      output_schema: {
        type: "object",
        required: ["content", "redacted_fields"],
        properties: {
          content: {},
          redacted_fields: { type: "array", items: { type: "string" } },
        },
      },
      capabilities: { network: false, filesystem: false, write: false, side_effects: false },
      safety_tags: ["security", "redaction"],
    }),
    run(args: { content: unknown }) {
      const result = applyRedaction(args.content);
      return {
        content: result.value,
        redacted_fields: result.redactedFields,
      };
    },
  };
}

export function createPolicyCheckTool(): Tool {
  const name = "policy.check";
  const description = "Classify action risk and required approvals for tool calls and user intents.";
  return {
    name,
    description,
    manifest: createManifest({
      name,
      description,
      input_schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          request: { type: "string" },
          tool_name: { type: "string" },
          intent: { type: "string" },
          flags: { type: "array", items: { type: "string" } },
        },
      },
      output_schema: {
        type: "object",
        required: ["risk", "approvals_required", "reasons"],
        properties: {
          risk: { type: "string", enum: ["low", "medium", "high"] },
          approvals_required: { type: "array", items: { type: "string" } },
          reasons: { type: "array", items: { type: "string" } },
        },
      },
      capabilities: { network: false, filesystem: false, write: false, side_effects: false },
      safety_tags: ["policy", "risk"],
    }),
    run(args: { request?: string; tool_name?: string; intent?: string; flags?: string[] }) {
      const text = `${args.request ?? ""} ${args.intent ?? ""} ${args.tool_name ?? ""}`.toLowerCase();
      const flags = Array.isArray(args.flags) ? args.flags.map((entry) => entry.toLowerCase()) : [];
      const reasons: string[] = [];
      let risk: "low" | "medium" | "high" = "low";

      if (includesAny(text, ["delete", "remove", "destroy", "reset", "force"])) {
        risk = "high";
        reasons.push("destructive-operation");
      }
      if (includesAny(text, ["send email", "send message", "publish", "post", "calendar"])) {
        risk = risk === "high" ? "high" : "medium";
        reasons.push("external-communication");
      }
      if (includesAny(text, ["payment", "wire", "transfer", "invoice"])) {
        risk = "high";
        reasons.push("financial-action");
      }
      if (flags.includes("sensitive") || flags.includes("pii")) {
        risk = risk === "low" ? "medium" : risk;
        reasons.push("sensitive-data");
      }

      const approvals_required: string[] = [];
      if (risk === "high") {
        approvals_required.push("human-confirmation");
      } else if (risk === "medium") {
        approvals_required.push("policy-review");
      }
      return { risk, approvals_required, reasons };
    },
  };
}

export function createAllowlistEnforceTool(policy?: AllowlistPolicy): Tool {
  const name = "allowlist.enforce";
  const description = "Verify tool/host/path/scope constraints before execution.";
  return {
    name,
    description,
    manifest: createManifest({
      name,
      description,
      input_schema: {
        type: "object",
        additionalProperties: false,
        required: ["tool_name", "args", "timeout_ms", "manifest"],
        properties: {
          tool_name: { type: "string" },
          args: {},
          timeout_ms: { type: "integer", minimum: 1 },
          manifest: { type: "object" },
          allowlist: { type: "object" },
        },
      },
      output_schema: {
        type: "object",
        required: ["allowed", "reasons"],
        properties: {
          allowed: { type: "boolean" },
          reasons: { type: "array", items: { type: "string" } },
        },
      },
      capabilities: { network: false, filesystem: false, write: false, side_effects: false },
      safety_tags: ["allowlist", "security"],
    }),
    run(args: {
      tool_name: string;
      args: unknown;
      timeout_ms: number;
      manifest: ToolManifest;
      allowlist?: AllowlistPolicy;
    }) {
      const result = enforceAllowlist({
        toolName: args.tool_name,
        args: args.args,
        timeoutMs: args.timeout_ms,
        manifest: args.manifest,
        policy: mergePolicy(policy, args.allowlist),
      });
      return {
        allowed: result.ok,
        reasons: result.reasons,
      };
    },
  };
}

function createManifest(input: Omit<ToolManifest, "auth_requirements"> & { auth_requirements?: string[] }): ToolManifest {
  return {
    ...input,
    auth_requirements: input.auth_requirements ?? [],
  };
}

function includesAny(text: string, needles: string[]): boolean {
  return needles.some((needle) => text.includes(needle));
}

function mergePolicy(base?: AllowlistPolicy, override?: AllowlistPolicy): AllowlistPolicy | undefined {
  if (!base && !override) return undefined;
  return {
    allowedTools: override?.allowedTools ?? base?.allowedTools,
    allowedHosts: override?.allowedHosts ?? base?.allowedHosts,
    workspaceRoots: override?.workspaceRoots ?? base?.workspaceRoots,
    maxTimeoutMs: override?.maxTimeoutMs ?? base?.maxTimeoutMs,
    maxBytes: override?.maxBytes ?? base?.maxBytes,
  };
}

