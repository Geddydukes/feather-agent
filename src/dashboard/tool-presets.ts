import type { ToolDefinitionConfig } from "../types/config.js";

export interface DashboardToolPreset {
  id: string;
  label: string;
  summary: string;
  recommendedToolName: string;
  definition: ToolDefinitionConfig;
  notes?: string;
}

const TOOL_PRESETS: DashboardToolPreset[] = [
  {
    id: "calculator",
    label: "Calculator",
    summary: "Deterministic arithmetic with expression validation.",
    recommendedToolName: "calculator",
    definition: {
      builtin: "calc",
      name: "calculator",
      description: "Evaluate arithmetic expressions deterministically.",
      planner: {
        description: "Use this tool for arithmetic, percentages, and simple unit math.",
        inputSchema: {
          type: "object",
          properties: {
            expression: {
              type: "string",
              description: "Arithmetic expression such as '(12.5 * 3) - 4'.",
            },
          },
          required: ["expression"],
        },
      },
    },
  },
  {
    id: "web-search",
    label: "Web Search",
    summary: "Up-to-date web retrieval through remote tool endpoints.",
    recommendedToolName: "web_search",
    definition: {
      builtin: "web.search",
      options: {
        remote: {
          baseUrlEnv: "AGENT_PLATFORM_BASE_URL",
          apiKeyEnv: "AGENT_PLATFORM_API_KEY",
          paths: {
            web_search: "/tools/web.search",
          },
        },
        defaultTopK: 5,
        maxTopK: 8,
        cacheTtlSec: 120,
      },
      name: "web.search",
      description: "Search the web for up-to-date information.",
      planner: {
        description: "Use this tool when the answer may have changed recently and sources are needed.",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Search query with enough context for web lookup.",
            },
            topK: {
              type: "integer",
              minimum: 1,
              maximum: 8,
              description: "Optional number of search results to return.",
            },
          },
          required: ["query"],
        },
      },
    },
    notes: "Set AGENT_PLATFORM_BASE_URL and AGENT_PLATFORM_API_KEY to route this preset to your platform endpoint.",
  },
  {
    id: "web-browser-session",
    label: "Web Browser Session",
    summary: "Interactive browser automation through remote tool endpoints.",
    recommendedToolName: "web_browser",
    definition: {
      builtin: "web.browser_session",
      options: {
        remote: {
          baseUrlEnv: "AGENT_PLATFORM_BASE_URL",
          apiKeyEnv: "AGENT_PLATFORM_API_KEY",
          paths: {
            web_browser_session: "/tools/web.browser_session",
          },
        },
        maxActions: 12,
        defaultTimeoutMs: 45000,
      },
      name: "web.browser_session",
      description: "Navigate interactive websites in a sandboxed browser session.",
      planner: {
        description: "Use this tool when static fetch/search is insufficient and interaction is required.",
        inputSchema: {
          type: "object",
          properties: {
            start_url: { type: "string" },
            actions: { type: "array", items: { type: "object" } },
          },
          required: ["start_url"],
        },
      },
    },
    notes: "Requires AGENT_PLATFORM_BASE_URL and AGENT_PLATFORM_API_KEY plus a remote browser-session endpoint.",
  },
  {
    id: "prompt-injection-scan",
    label: "Prompt Injection Scan",
    summary: "Pre-flight scan for injection patterns in web/document content.",
    recommendedToolName: "prompt_scan",
    definition: {
      builtin: "prompt_injection.scan",
      options: {
        blockThreshold: 0.7,
      },
      name: "prompt_injection.scan",
      description: "Score content for injection patterns and return risk reasons.",
      planner: {
        description: "Use this before ingesting untrusted text into memory or prompts.",
        inputSchema: {
          type: "object",
          properties: {
            content: {},
            threshold: { type: "number", minimum: 0, maximum: 1 },
          },
          required: ["content"],
        },
      },
    },
  },
  {
    id: "db-query-sql",
    label: "SQL Query",
    summary: "Parameterized SQL queries through remote endpoints with read-only defaults.",
    recommendedToolName: "db_query",
    definition: {
      builtin: "db.query_sql",
      options: {
        remote: {
          baseUrlEnv: "AGENT_PLATFORM_BASE_URL",
          apiKeyEnv: "AGENT_PLATFORM_API_KEY",
          paths: {
            db_query_sql: "/tools/db.query_sql",
          },
        },
        defaultReadOnly: true,
        defaultMaxRows: 500,
      },
      name: "db.query_sql",
      description: "Run parameterized SQL queries against approved databases.",
      planner: {
        description: "Use for structured data retrieval with explicit SQL and row limits.",
        inputSchema: {
          type: "object",
          properties: {
            sql: { type: "string" },
            params: {},
            read_only: { type: "boolean" },
            max_rows: { type: "integer", minimum: 1 },
          },
          required: ["sql"],
        },
      },
    },
    notes: "Set AGENT_PLATFORM_BASE_URL and AGENT_PLATFORM_API_KEY for remote SQL adapter mode.",
  },
  {
    id: "vector-upsert",
    label: "Vector Upsert",
    summary: "Insert or update retrieval chunks in the shared vector namespace.",
    recommendedToolName: "vector_upsert",
    definition: {
      builtin: "vector.upsert",
      name: "vector.upsert",
      description: "Upsert vector chunks into the retrieval store.",
      planner: {
        description: "Use after extracting facts so they can be retrieved in future steps.",
        inputSchema: {
          type: "object",
          properties: {
            namespace: { type: "string" },
            items: { type: "array", items: { type: "object" } },
          },
          required: ["namespace", "items"],
        },
      },
    },
  },
  {
    id: "vector-search",
    label: "Vector Search",
    summary: "Retrieve relevant chunks from the shared vector namespace.",
    recommendedToolName: "vector_search",
    definition: {
      builtin: "vector.search",
      name: "vector.search",
      description: "Search vector chunks by query text or embedding.",
      planner: {
        description: "Use to retrieve previously indexed chunks by semantic relevance.",
        inputSchema: {
          type: "object",
          properties: {
            namespace: { type: "string" },
            query_text: { type: "string" },
            query_embedding: { type: "array", items: { type: "number" } },
            top_k: { type: "integer", minimum: 1, maximum: 25 },
          },
          required: ["namespace"],
        },
      },
    },
  },
  {
    id: "csv-read",
    label: "CSV Read",
    summary: "Read CSV files from the workspace with schema checks.",
    recommendedToolName: "csv_read",
    definition: {
      builtin: "etl.csv_read",
      options: {
        workspaceRoots: ["."],
        maxReadBytes: 2000000,
      },
      name: "etl.csv_read",
      description: "Read CSV files with delimiter and schema validation controls.",
      planner: {
        description: "Use to ingest spreadsheet-like files for structured analysis.",
        inputSchema: {
          type: "object",
          properties: {
            path: { type: "string" },
            delimiter: { type: "string" },
            has_header: { type: "boolean" },
            max_rows: { type: "integer", minimum: 1 },
          },
          required: ["path"],
        },
      },
    },
  },
  {
    id: "csv-write",
    label: "CSV Write",
    summary: "Write sanitized CSV outputs back to the workspace.",
    recommendedToolName: "csv_write",
    definition: {
      builtin: "etl.csv_write",
      options: {
        workspaceRoots: ["."],
        maxWriteBytes: 2000000,
      },
      name: "etl.csv_write",
      description: "Write CSV files with safe escaping and injection protection.",
      planner: {
        description: "Use to persist tabular outputs for users or downstream pipelines.",
        inputSchema: {
          type: "object",
          properties: {
            path: { type: "string" },
            rows: { type: "array" },
            include_header: { type: "boolean" },
            create_dirs: { type: "boolean" },
          },
          required: ["path", "rows"],
        },
      },
    },
  },
  {
    id: "python-sandbox",
    label: "Python Sandbox",
    summary: "Restricted Python execution for transforms, analysis, and tests.",
    recommendedToolName: "python_run",
    definition: {
      builtin: "python.run_sandbox",
      options: {
        workspaceRoots: ["."],
        defaultTimeoutMs: 20000,
        maxOutputBytes: 500000,
        allowNetwork: false,
        shellAllowlist: ["pytest"],
      },
      name: "python.run_sandbox",
      description: "Execute Python snippets in a restricted workspace sandbox.",
      planner: {
        description: "Use for local data transformations or test execution without unrestricted shell access.",
        inputSchema: {
          type: "object",
          properties: {
            code: { type: "string" },
            args: { type: "array", items: { type: "string" } },
            timeout_ms: { type: "integer", minimum: 1 },
          },
          required: ["code"],
        },
      },
    },
  },
  {
    id: "node-sandbox",
    label: "Node Sandbox",
    summary: "Restricted Node.js execution for scripts and build logic.",
    recommendedToolName: "node_run",
    definition: {
      builtin: "node.run_sandbox",
      options: {
        workspaceRoots: ["."],
        defaultTimeoutMs: 20000,
        maxOutputBytes: 500000,
        allowNetwork: false,
      },
      name: "node.run_sandbox",
      description: "Execute Node.js snippets in a restricted workspace sandbox.",
      planner: {
        description: "Use for JS/TS transforms, parsers, and local tooling steps.",
        inputSchema: {
          type: "object",
          properties: {
            code: { type: "string" },
            args: { type: "array", items: { type: "string" } },
            timeout_ms: { type: "integer", minimum: 1 },
          },
          required: ["code"],
        },
      },
    },
  },
  {
    id: "shell-restricted",
    label: "Restricted Shell",
    summary: "Allowlisted command execution for local dev workflows.",
    recommendedToolName: "shell_run",
    definition: {
      builtin: "shell.run_restricted",
      options: {
        workspaceRoots: ["."],
        defaultTimeoutMs: 20000,
        maxOutputBytes: 500000,
        shellAllowlist: ["pytest", "ruff", "npm", "node", "python3", "git", "echo"],
      },
      name: "shell.run_restricted",
      description: "Execute only approved commands inside workspace roots.",
      planner: {
        description: "Use when command execution is required but should remain tightly constrained.",
        inputSchema: {
          type: "object",
          properties: {
            command: { type: "string" },
            args: { type: "array", items: { type: "string" } },
            cwd: { type: "string" },
            timeout_ms: { type: "integer", minimum: 1 },
          },
          required: ["command"],
        },
      },
    },
  },
  {
    id: "email-search",
    label: "Email Search",
    summary: "Search mailbox content through remote platform endpoints.",
    recommendedToolName: "email_search",
    definition: {
      builtin: "email.search",
      options: {
        remote: {
          baseUrlEnv: "AGENT_PLATFORM_BASE_URL",
          apiKeyEnv: "AGENT_PLATFORM_API_KEY",
          paths: {
            email_search: "/tools/email.search",
            email_send: "/tools/email.send",
          },
        },
      },
      name: "email.search",
      description: "Search inbox messages with structured metadata.",
    },
    notes: "Set AGENT_PLATFORM_BASE_URL and AGENT_PLATFORM_API_KEY. Supports module adapters too via options.adapter.",
  },
  {
    id: "email-send",
    label: "Email Send",
    summary: "Send messages with recipient allowlists and confirmation guardrails.",
    recommendedToolName: "email_send",
    definition: {
      builtin: "email.send",
      options: {
        remote: {
          baseUrlEnv: "AGENT_PLATFORM_BASE_URL",
          apiKeyEnv: "AGENT_PLATFORM_API_KEY",
          paths: {
            email_search: "/tools/email.search",
            email_send: "/tools/email.send",
          },
        },
        requireHumanConfirmation: true,
      },
      name: "email.send",
      description: "Send email with human confirmation and allowlisted recipients.",
    },
  },
  {
    id: "connector-invoke",
    label: "Connector Invoke",
    summary: "Call approved external plugin operations through one interface.",
    recommendedToolName: "connector_invoke",
    definition: {
      builtin: "connector.invoke",
      options: {
        remote: {
          baseUrlEnv: "AGENT_PLATFORM_BASE_URL",
          apiKeyEnv: "AGENT_PLATFORM_API_KEY",
          paths: {
            connector_invoke: "/tools/connector.invoke",
          },
        },
      },
      name: "connector.invoke",
      description: "Invoke plugin operations for approved connectors.",
    },
    notes: "Set AGENT_PLATFORM_BASE_URL and AGENT_PLATFORM_API_KEY. Use options.allowedConnectors/allowedOperations to constrain routing.",
  },
  {
    id: "plan-create",
    label: "Plan Create",
    summary: "Create structured plans with explicit steps and status.",
    recommendedToolName: "plan_create",
    definition: {
      builtin: "plan.create",
      name: "plan.create",
      description: "Create structured plan objects for agent execution.",
    },
  },
  {
    id: "plan-update",
    label: "Plan Update",
    summary: "Update plan and step status as execution progresses.",
    recommendedToolName: "plan_update",
    definition: {
      builtin: "plan.update",
      name: "plan.update",
      description: "Update step progress and plan status.",
    },
  },
  {
    id: "budget-consume",
    label: "Budget Consume",
    summary: "Track token/time/tool-call spend against limits.",
    recommendedToolName: "budget_consume",
    definition: {
      builtin: "budget.consume",
      name: "budget.consume",
      description: "Consume and enforce session/tool budgets.",
    },
  },
];

export function listDashboardToolPresets(): DashboardToolPreset[] {
  return TOOL_PRESETS.map(clonePreset);
}

function clonePreset(preset: DashboardToolPreset): DashboardToolPreset {
  return {
    ...preset,
    definition: JSON.parse(JSON.stringify(preset.definition)) as ToolDefinitionConfig,
  };
}
