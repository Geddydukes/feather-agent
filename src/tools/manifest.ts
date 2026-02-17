import { z } from "zod";

import type { Tool } from "./types.js";

export type JsonSchema = Record<string, unknown>;

export interface ToolManifestCapabilities {
  network: boolean;
  filesystem: boolean;
  write: boolean;
  side_effects: boolean;
}

export interface ToolManifestScopes {
  allowed_hosts?: string[];
  workspace_roots?: string[];
  db_ids?: string[];
  max_bytes?: number;
  max_rows?: number;
  max_timeout_ms?: number;
}

export interface ToolManifestCachePolicy {
  cache_ttl_ms?: number;
  cache_key_fields?: string[];
  stale_while_revalidate_ms?: number;
}

export interface ToolManifest {
  name: string;
  description: string;
  input_schema: JsonSchema;
  output_schema: JsonSchema;
  auth_requirements: string[];
  safety_tags: string[];
  capabilities: ToolManifestCapabilities;
  scopes?: ToolManifestScopes;
  cache?: ToolManifestCachePolicy;
}

const JsonSchemaObject = z.record(z.unknown());

const ToolManifestCapabilitiesSchema = z.object({
  network: z.boolean(),
  filesystem: z.boolean(),
  write: z.boolean(),
  side_effects: z.boolean(),
});

const ToolManifestScopesSchema = z.object({
  allowed_hosts: z.array(z.string()).optional(),
  workspace_roots: z.array(z.string()).optional(),
  db_ids: z.array(z.string()).optional(),
  max_bytes: z.number().int().positive().optional(),
  max_rows: z.number().int().positive().optional(),
  max_timeout_ms: z.number().int().positive().optional(),
});

const ToolManifestCachePolicySchema = z.object({
  cache_ttl_ms: z.number().int().nonnegative().optional(),
  cache_key_fields: z.array(z.string()).optional(),
  stale_while_revalidate_ms: z.number().int().nonnegative().optional(),
});

export const ToolManifestSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  input_schema: JsonSchemaObject,
  output_schema: JsonSchemaObject,
  auth_requirements: z.array(z.string()).default([]),
  safety_tags: z.array(z.string()).default([]),
  capabilities: ToolManifestCapabilitiesSchema,
  scopes: ToolManifestScopesSchema.optional(),
  cache: ToolManifestCachePolicySchema.optional(),
});

export const TOOL_MANIFEST_JSON_SCHEMA: JsonSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  additionalProperties: false,
  required: [
    "name",
    "description",
    "input_schema",
    "output_schema",
    "auth_requirements",
    "safety_tags",
    "capabilities",
  ],
  properties: {
    name: { type: "string", minLength: 1 },
    description: { type: "string", minLength: 1 },
    input_schema: { type: "object" },
    output_schema: { type: "object" },
    auth_requirements: {
      type: "array",
      items: { type: "string" },
    },
    safety_tags: {
      type: "array",
      items: { type: "string" },
    },
    capabilities: {
      type: "object",
      additionalProperties: false,
      required: ["network", "filesystem", "write", "side_effects"],
      properties: {
        network: { type: "boolean" },
        filesystem: { type: "boolean" },
        write: { type: "boolean" },
        side_effects: { type: "boolean" },
      },
    },
    scopes: {
      type: "object",
      additionalProperties: false,
      properties: {
        allowed_hosts: { type: "array", items: { type: "string" } },
        workspace_roots: { type: "array", items: { type: "string" } },
        db_ids: { type: "array", items: { type: "string" } },
        max_bytes: { type: "integer", minimum: 1 },
        max_rows: { type: "integer", minimum: 1 },
        max_timeout_ms: { type: "integer", minimum: 1 },
      },
    },
    cache: {
      type: "object",
      additionalProperties: false,
      properties: {
        cache_ttl_ms: { type: "integer", minimum: 0 },
        cache_key_fields: { type: "array", items: { type: "string" } },
        stale_while_revalidate_ms: { type: "integer", minimum: 0 },
      },
    },
  },
};

export function validateToolManifest(input: unknown): ToolManifest {
  return ToolManifestSchema.parse(input);
}

export function ensureToolManifest(tool: Tool): ToolManifest {
  if (tool.manifest) {
    return validateToolManifest(tool.manifest);
  }
  return createDefaultToolManifest(tool);
}

export function createDefaultToolManifest(tool: Tool): ToolManifest {
  return {
    name: tool.name,
    description: tool.description ?? `Tool ${tool.name}`,
    input_schema: {},
    output_schema: {},
    auth_requirements: [],
    safety_tags: [],
    capabilities: {
      network: false,
      filesystem: false,
      write: false,
      side_effects: false,
    },
  };
}

