import type { Tool } from "./types.js";
import type { ToolManifest } from "./manifest.js";

export interface ConnectorInvokeRequest {
  connector_name: string;
  operation: string;
  args?: unknown;
  timeout_ms?: number;
  signal?: AbortSignal;
  metadata?: Record<string, unknown>;
}

export interface ConnectorInvokeResult {
  ok: boolean;
  data?: unknown;
  error?: string;
  meta?: Record<string, unknown>;
}

export interface ConnectorInvokeAdapter {
  invoke(request: ConnectorInvokeRequest): Promise<ConnectorInvokeResult>;
}

export interface CreateConnectorInvokeToolOptions {
  name?: string;
  description?: string;
  allowedConnectors?: string[];
  allowedOperations?: string[];
}

export function createConnectorInvokeTool(
  adapter: ConnectorInvokeAdapter,
  options: CreateConnectorInvokeToolOptions = {}
): Tool {
  if (!adapter || typeof adapter.invoke !== "function") {
    throw new Error("createConnectorInvokeTool requires an adapter with invoke(request)");
  }
  const name = options.name?.trim() || "connector.invoke";
  const description = options.description?.trim() || "Invoke approved external connectors through a plugin interface.";
  const allowedConnectors = new Set((options.allowedConnectors ?? []).map((entry) => entry.trim()).filter(Boolean));
  const allowedOperations = new Set((options.allowedOperations ?? []).map((entry) => entry.trim()).filter(Boolean));
  return {
    name,
    description,
    manifest: createManifest({
      name,
      description,
      input_schema: {
        type: "object",
        additionalProperties: false,
        required: ["connector_name", "operation"],
        properties: {
          connector_name: { type: "string", minLength: 1 },
          operation: { type: "string", minLength: 1 },
          args: {},
          timeout_ms: { type: "integer", minimum: 1, maximum: 300000 },
        },
      },
      output_schema: {
        type: "object",
        required: ["ok"],
        properties: {
          ok: { type: "boolean" },
          data: {},
          error: { type: "string" },
          meta: { type: "object" },
        },
      },
      capabilities: { network: true, filesystem: false, write: true, side_effects: true },
      safety_tags: ["connector", "plugin", "external-api"],
    }),
    async run(args: { connector_name: string; operation: string; args?: unknown; timeout_ms?: number }, ctx) {
      const connectorName = (args.connector_name ?? "").trim();
      const operation = (args.operation ?? "").trim();
      if (!connectorName || !operation) {
        throw new Error("connector.invoke requires connector_name and operation");
      }
      if (allowedConnectors.size > 0 && !allowedConnectors.has(connectorName)) {
        throw new Error(`connector.invoke connector "${connectorName}" is not allowlisted`);
      }
      if (allowedOperations.size > 0 && !allowedOperations.has(operation)) {
        throw new Error(`connector.invoke operation "${operation}" is not allowlisted`);
      }
      return adapter.invoke({
        connector_name: connectorName,
        operation,
        args: args.args,
        timeout_ms: args.timeout_ms,
        signal: ctx.signal,
        metadata: ctx.metadata,
      });
    },
  };
}

function createManifest(input: Omit<ToolManifest, "auth_requirements"> & { auth_requirements?: string[] }): ToolManifest {
  return {
    ...input,
    auth_requirements: input.auth_requirements ?? [],
  };
}
