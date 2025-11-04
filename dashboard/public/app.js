const TOOL_LIBRARY = [
  {
    key: "web-search",
    title: "Web Search & Scraper",
    category: "Core Foundational",
    tier: "core",
    summary: "Query DuckDuckGo, Tavily, or SerpAPI and optionally scrape result pages.",
    autoSeed: true,
    features: [
      "Adapters for DuckDuckGo, Tavily, or SerpAPI",
      "fetchHTML(url) helper using Cheerio/JSDOM style parsing",
      "Redis-backed caching to avoid duplicate requests",
    ],
    definition: {
      name: "Web Search & Scraper",
      description: "Query search APIs for fresh information and optionally scrape pages for richer context.",
      module: "@agent/presets/web-search.js",
      planner: {
        description: "Use for web lookups or when fresh information is required.",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string", description: "Search query" },
            topK: { type: "number", minimum: 1, maximum: 10 },
            scrape: { type: "boolean", description: "Fetch and parse HTML for each result" },
          },
          required: ["query"],
        },
      },
      options: {
        preset: true,
        tier: "core",
        category: "Core Foundational",
        setup: "pending",
        env: ["REDIS_URL", "TAVILY_API_KEY", "SERPAPI_KEY"],
        notes: [
          "Cache responses in Redis and reuse tokens",
          "Expose fetchHTML(url) helper backed by Cheerio or JSDOM",
          "Return { title, url, snippet, content, tokens }",
        ],
      },
    },
  },
  {
    key: "rag-docs",
    title: "RAG / Document QA",
    category: "Core Foundational",
    tier: "core",
    summary: "Upload, chunk, embed, and query private documents.",
    autoSeed: true,
    features: [
      "Supabase pgvector storage with metadata",
      "storeDocs() and queryDocs() helpers",
      "Chunking tuned for 1K–2K token windows",
    ],
    definition: {
      name: "RAG / Document QA",
      description: "Index documents in pgvector and retrieve the most relevant chunks for grounding responses.",
      module: "@agent/presets/rag-docs.js",
      planner: {
        description: "Use to answer questions grounded in uploaded knowledge bases.",
        inputSchema: {
          type: "object",
          properties: {
            action: { type: "string", enum: ["storeDocs", "queryDocs"], description: "Whether to add or query documents" },
            docs: { type: "array", items: { type: "string" }, description: "Raw documents or URLs to ingest" },
            query: { type: "string", description: "Question to answer using stored context" },
          },
        },
      },
      options: {
        preset: true,
        tier: "core",
        category: "Core Foundational",
        setup: "pending",
        env: ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"],
        notes: [
          "Split docs into 1K–2K token chunks before embedding",
          "Use pgvector similarity search with cosine distance",
          "Pair retrieval results with your preferred LLM",
        ],
      },
    },
  },
  {
    key: "http-connector",
    title: "HTTP / API Connector",
    category: "Core Foundational",
    tier: "core",
    summary: "Call REST or GraphQL APIs with validation and allowlists.",
    autoSeed: true,
    features: [
      "Supports GET/POST/PUT/DELETE/PATCH requests",
      "Environment variable interpolation via ${env.NAME}",
      "Outbound domain allowlist for safety",
    ],
    definition: {
      name: "HTTP / API Connector",
      description: "Make authenticated HTTP requests to REST or GraphQL services with allowlist controls.",
      module: "@agent/presets/http-connector.js",
      planner: {
        description: "Use for API calls when the endpoint and method are known.",
        inputSchema: {
          type: "object",
          properties: {
            url: { type: "string", description: "Destination URL" },
            method: { type: "string", enum: ["GET", "POST", "PUT", "PATCH", "DELETE"] },
            headers: { type: "object", additionalProperties: { type: "string" } },
            body: { type: "string" },
          },
          required: ["url", "method"],
        },
      },
      options: {
        preset: true,
        tier: "core",
        category: "Core Foundational",
        setup: "pending",
        notes: [
          "Allow environment interpolation via ${env.MY_KEY}",
          "Validate requested hostname against a configurable allowlist",
          "Return response status, headers, and body",
        ],
      },
    },
  },
  {
    key: "code-runner",
    title: "Code Runner",
    category: "Core Foundational",
    tier: "core",
    summary: "Safely execute short Python or Node.js snippets in a sandbox.",
    autoSeed: true,
    features: [
      "Firecracker/Docker/VM2 sandbox abstraction",
      "CPU and memory guards with timeouts",
      "Returns stdout, stderr, and exitCode",
    ],
    definition: {
      name: "Code Runner",
      description: "Execute short-lived code snippets inside a locked-down sandbox.",
      module: "@agent/presets/code-runner.js",
      planner: {
        description: "Use for evaluating code or running quick scripts.",
        inputSchema: {
          type: "object",
          properties: {
            language: { type: "string", enum: ["python", "node"], description: "Runtime language" },
            code: { type: "string", description: "Source code to execute" },
            args: { type: "array", items: { type: "string" } },
          },
          required: ["language", "code"],
        },
      },
      options: {
        preset: true,
        tier: "core",
        category: "Core Foundational",
        setup: "pending",
        notes: [
          "Spawn code in VM2, Docker, or Firecracker",
          "Limit execution by CPU time and memory",
          "Stream stdout/stderr back to the agent",
        ],
      },
    },
  },
  {
    key: "vector-memory",
    title: "Vector Memory",
    category: "Core Foundational",
    tier: "core",
    summary: "Persistent semantic memory for agents with CRUD helpers.",
    autoSeed: true,
    features: [
      "pgvector or Chroma-backed storage",
      "memory.set/get/search/forget helpers",
      "Automatic summarisation after N turns",
    ],
    definition: {
      name: "Vector Memory",
      description: "Provide long-term semantic memory via vector storage and summarisation.",
      module: "@agent/presets/vector-memory.js",
      planner: {
        description: "Use to recall or persist cross-session information.",
        inputSchema: {
          type: "object",
          properties: {
            operation: { type: "string", enum: ["get", "set", "search", "forget"], description: "Memory operation" },
            key: { type: "string" },
            value: { type: "string" },
            query: { type: "string" },
          },
          required: ["operation"],
        },
      },
      options: {
        preset: true,
        tier: "core",
        category: "Core Foundational",
        setup: "pending",
        notes: [
          "Backed by pgvector or Chroma with metadata columns",
          "Expose memory.set/get/search/forget methods",
          "Summarise after configurable number of interactions",
        ],
      },
    },
  },
  {
    key: "router-classifier",
    title: "Router / Intent Classifier",
    category: "Cognitive & Reasoning",
    tier: "advanced",
    summary: "Route user requests to the right tool or model using rules and LLM fallbacks.",
    features: [
      "Rule-first YAML or JSONLogic definitions",
      "LLM fallback for ambiguous cases",
      "Caches decisions keyed by input hash",
    ],
    definition: {
      name: "Router / Intent Classifier",
      description: "Decide which downstream tool or model should handle the next turn.",
      module: "@agent/presets/router-classifier.js",
      planner: {
        description: "Use to pick the optimal tool when multiple options exist.",
      },
      options: {
        preset: true,
        tier: "advanced",
        category: "Cognitive & Reasoning",
        setup: "pending",
        notes: [
          "Evaluate deterministic rules before LLM fallback",
          "Cache routing results for repeated prompts",
        ],
      },
    },
  },
  {
    key: "planner-chain",
    title: "Planner / Chain Builder",
    category: "Cognitive & Reasoning",
    tier: "advanced",
    summary: "Generate multi-step execution plans and track outcomes for RLHF.",
    features: [
      "Outputs ordered tool call arrays",
      "Stores plans vs execution traces in Postgres",
      "Supports fine-tuning via RLHF on successful plans",
    ],
    definition: {
      name: "Planner / Chain Builder",
      description: "Compose multi-step action plans that can be replayed or audited.",
      module: "@agent/presets/planner-chain.js",
      planner: {
        description: "Use to pre-plan complex tasks before execution.",
      },
      options: {
        preset: true,
        tier: "advanced",
        category: "Cognitive & Reasoning",
        setup: "pending",
        notes: [
          "Persist plans in Postgres with status tracking",
          "Log plan vs execution for analytics",
        ],
      },
    },
  },
  {
    key: "evaluator-critic",
    title: "Evaluator / Critic",
    category: "Cognitive & Reasoning",
    tier: "advanced",
    summary: "Rate responses against schemas and capture quality metrics.",
    features: [
      "Compares actual output with expected schema",
      "LLM-powered accuracy/helpfulness scoring",
      "Persists metrics for dashboards",
    ],
    definition: {
      name: "Evaluator / Critic",
      description: "Run a post-execution review to grade accuracy, tone, and adherence to schema.",
      module: "@agent/presets/evaluator-critic.js",
      planner: {
        description: "Trigger after executions that need validation or quality scoring.",
      },
      options: {
        preset: true,
        tier: "advanced",
        category: "Cognitive & Reasoning",
        setup: "pending",
        notes: [
          "Accepts expected_output_schema for structural checks",
          "Supports LLM-driven rubric scoring",
        ],
      },
    },
  },
  {
    key: "math-data",
    title: "Math & Data Analysis",
    category: "Cognitive & Reasoning",
    tier: "advanced",
    summary: "Evaluate formulas, summarise CSVs, and build quick charts.",
    features: [
      "mathjs expressions or Python+pandas sandbox",
      "CSV ingestion with summary statistics",
      "Returns numeric results plus structured JSON",
    ],
    definition: {
      name: "Math & Data Analysis",
      description: "Perform numerical computations or lightweight data analysis within a sandbox.",
      module: "@agent/presets/math-data.js",
      planner: {
        description: "Use for number crunching, CSV summaries, or chart-ready aggregates.",
      },
      options: {
        preset: true,
        tier: "advanced",
        category: "Cognitive & Reasoning",
        setup: "pending",
        notes: [
          "Support mathjs expressions and Python notebooks",
          "Return both textual summary and machine-readable JSON",
        ],
      },
    },
  },
  {
    key: "file-generator",
    title: "File Generator",
    category: "Cognitive & Reasoning",
    tier: "advanced",
    summary: "Produce PDFs, CSVs, DOCX, or Markdown exports with templating.",
    features: [
      "reportlab/pypandoc or Node equivalents",
      "Templating with {{variable}} substitution",
      "Returns presigned download URLs",
    ],
    definition: {
      name: "File Generator",
      description: "Generate downloadable artefacts such as PDFs or spreadsheets from agent output.",
      module: "@agent/presets/file-generator.js",
      planner: {
        description: "Use when the user requests a downloadable file or structured report.",
      },
      options: {
        preset: true,
        tier: "advanced",
        category: "Cognitive & Reasoning",
        setup: "pending",
        notes: [
          "Support PDF, CSV, DOCX, and Markdown exports",
          "Use templating for variable substitution",
        ],
      },
    },
  },
  {
    key: "email-tool",
    title: "Email Tool",
    category: "Integration & Productivity",
    tier: "pro",
    summary: "Read, summarise, draft, and send Gmail messages via OAuth.",
    features: [
      "Gmail API integration with incremental sync",
      "Redacts sensitive metadata before logging",
      "Rate-limits outbound sends",
    ],
    definition: {
      name: "Email Tool",
      description: "Connect to Gmail via OAuth to read, summarise, and send messages on behalf of the user.",
      module: "@agent/presets/email-tool.js",
      planner: {
        description: "Use for inbox triage, drafting, or sending emails.",
      },
      options: {
        preset: true,
        tier: "pro",
        category: "Integration & Productivity",
        setup: "pending",
        paywall: true,
        notes: [
          "Requires OAuth consent screen and secure token storage",
          "Redact PII and cache message metadata",
        ],
      },
    },
  },
  {
    key: "calendar-tool",
    title: "Calendar Tool",
    category: "Integration & Productivity",
    tier: "pro",
    summary: "Read and create events for Google or Outlook calendars.",
    features: [
      "Normalises events to { title, time, attendees, location }",
      "Supports natural-language scheduling",
      "OAuth scopes for read/write access",
    ],
    definition: {
      name: "Calendar Tool",
      description: "Interact with Google Calendar or Outlook to check availability and create events.",
      module: "@agent/presets/calendar-tool.js",
      planner: {
        description: "Use to schedule meetings or review upcoming events.",
      },
      options: {
        preset: true,
        tier: "pro",
        category: "Integration & Productivity",
        setup: "pending",
        paywall: true,
        notes: [
          "OAuth required – scope calendars.readonly or calendars.modify",
          "Normalise event data into shared schema",
        ],
      },
    },
  },
  {
    key: "messaging-tool",
    title: "Slack / Discord / SMS Tool",
    category: "Integration & Productivity",
    tier: "pro",
    summary: "Send and receive messages across chat platforms via SDKs.",
    features: [
      "Slack SDK, Discord.js, or Twilio integration",
      "Standardised payload schema",
      "Webhook listener for inbound events",
    ],
    definition: {
      name: "Slack / Discord / SMS Tool",
      description: "Send outbound updates or handle inbound hooks across collaboration platforms.",
      module: "@agent/presets/messaging-tool.js",
      planner: {
        description: "Use to post updates to Slack, Discord, or SMS threads.",
      },
      options: {
        preset: true,
        tier: "pro",
        category: "Integration & Productivity",
        setup: "pending",
        paywall: true,
        notes: [
          "Provide channel, message, and attachments fields",
          "Respect platform rate limits and redact secrets",
        ],
      },
    },
  },
  {
    key: "payments-stripe",
    title: "Payments / Stripe Tool",
    category: "Integration & Productivity",
    tier: "pro",
    summary: "Inspect billing details or initiate Stripe checkout sessions.",
    features: [
      "Secure key handling via secrets manager",
      "Helpers for invoices and checkout",
      "Automatic masking of PII in logs",
    ],
    definition: {
      name: "Payments / Stripe Tool",
      description: "Query customer billing data or create checkout sessions through Stripe APIs.",
      module: "@agent/presets/payments-stripe.js",
      planner: {
        description: "Use for billing questions or to issue payment links.",
      },
      options: {
        preset: true,
        tier: "pro",
        category: "Integration & Productivity",
        setup: "pending",
        paywall: true,
        notes: [
          "Load Stripe keys from a secrets manager",
          "Mask personally identifiable information",
        ],
      },
    },
  },
  {
    key: "file-transfer",
    title: "File Upload / Download Tool",
    category: "Integration & Productivity",
    tier: "pro",
    summary: "Handle uploads to Supabase Storage or S3 with validation.",
    features: [
      "Streams uploads directly to object storage",
      "Returns file_id plus presigned URL",
      "Validates MIME types and file size",
    ],
    definition: {
      name: "File Upload / Download Tool",
      description: "Enable agents to accept or serve arbitrary files securely.",
      module: "@agent/presets/file-transfer.js",
      planner: {
        description: "Use when the task involves receiving or sharing files.",
      },
      options: {
        preset: true,
        tier: "pro",
        category: "Integration & Productivity",
        setup: "pending",
        paywall: true,
        notes: [
          "Stream uploads to Supabase Storage or S3",
          "Validate MIME type and size thresholds",
        ],
      },
    },
  },
];

const PRESET_STORAGE_KEY = "feather:coreToolsSeeded";

const state = {
  config: null,
  apiKeys: loadStoredKeys(),
  selectedAgent: null,
  editorDirty: false,
  configError: "",
};

const elements = {
  providers: document.getElementById("providers"),
  tools: document.getElementById("tools"),
  toolLibrary: document.getElementById("tool-library"),
  agentSelect: document.getElementById("agent-select"),
  agentDescription: document.getElementById("agent-description"),
  defaultAgent: document.getElementById("default-agent"),
  agentTools: document.getElementById("agent-tools"),
  configEditor: document.getElementById("config-editor"),
  configError: document.getElementById("config-error"),
  applyConfig: document.getElementById("apply-config"),
  resetConfig: document.getElementById("reset-config"),
  configPretty: document.getElementById("config-pretty"),
  runPrompt: document.getElementById("run-prompt"),
  runButton: document.getElementById("run-agent"),
  runOutput: document.getElementById("run-output"),
  downloadConfig: document.getElementById("download-config"),
  downloadScript: document.getElementById("download-script"),
  providerForm: document.getElementById("provider-form"),
  providerHelp: document.getElementById("provider-help"),
  toolForm: document.getElementById("tool-form"),
  toolHelp: document.getElementById("tool-help"),
  toolUpload: document.getElementById("tool-upload"),
  toolUploadButton: document.getElementById("tool-upload-button"),
};

async function init() {
  await reloadConfig();
  elements.configEditor.addEventListener("input", () => {
    state.editorDirty = true;
  });
  elements.configPretty?.addEventListener("click", prettyPrintConfig);
  elements.applyConfig.addEventListener("click", applyConfigFromEditor);
  elements.resetConfig.addEventListener("click", async () => {
    state.editorDirty = false;
    await reloadConfig();
  });
  elements.providerHelp?.addEventListener("click", () => scrollToCard("provider-card"));
  elements.toolHelp?.addEventListener("click", () => scrollToCard("tool-card"));
  elements.agentSelect.addEventListener("change", () => {
    state.selectedAgent = elements.agentSelect.value || null;
    renderAgentSection();
    syncConfigEditor();
  });
  elements.agentDescription.addEventListener("change", () => {
    const agent = currentAgent();
    if (!agent) return;
    agent.description = elements.agentDescription.value || undefined;
    markConfigChanged();
  });
  elements.defaultAgent.addEventListener("change", () => {
    if (!state.config) return;
    state.config.defaults = state.config.defaults || {};
    state.config.defaults.agent = elements.defaultAgent.value || undefined;
    markConfigChanged();
  });
  elements.runButton.addEventListener("click", runAgent);
  elements.downloadConfig.addEventListener("click", downloadConfigFile);
  elements.downloadScript.addEventListener("click", downloadSampleScript);
  elements.providerForm.addEventListener("submit", handleProviderSubmit);
  elements.toolForm.addEventListener("submit", handleToolSubmit);
  elements.toolUploadButton?.addEventListener("click", () => elements.toolUpload?.click());
  elements.toolUpload?.addEventListener("change", handleToolUpload);
}

function loadStoredKeys() {
  try {
    const raw = localStorage.getItem("feather:apiKeys");
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed ? parsed : {};
  } catch (error) {
    console.warn("Failed to load API keys", error);
    return {};
  }
}

function persistKeys() {
  localStorage.setItem("feather:apiKeys", JSON.stringify(state.apiKeys));
}

async function reloadConfig() {
  const response = await fetch("/api/config");
  if (!response.ok) {
    throw new Error("Failed to load config from server");
  }
  const data = await response.json();
  state.config = data;
  const agentNames = Object.keys(state.config.agents || {});
  if (!state.selectedAgent || !agentNames.includes(state.selectedAgent)) {
    state.selectedAgent = state.config.defaults?.agent || agentNames[0] || null;
  }
  const presetsSeeded = seedCorePresets();
  state.editorDirty = false;
  state.configError = "";
  if (presetsSeeded) {
    syncConfigEditor();
  }
  renderAll();
}

function renderAll() {
  renderToolLibrary();
  renderProviders();
  renderTools();
  renderAgentSection();
  renderConfigEditor();
}

function renderToolLibrary() {
  const container = elements.toolLibrary;
  if (!container) return;
  container.innerHTML = "";
  const activeTools = state.config?.tools || {};
  TOOL_LIBRARY.forEach((preset) => {
    const card = document.createElement("article");
    card.className = "tool-card";

    const header = document.createElement("header");
    const title = document.createElement("h4");
    title.textContent = preset.title;
    header.appendChild(title);

    const tierBadge = document.createElement("span");
    tierBadge.className = preset.tier === "pro" ? "badge badge--pro" : "badge";
    tierBadge.textContent = preset.tier === "pro" ? "Pro" : preset.tier === "advanced" ? "Advanced" : "Core";
    header.appendChild(tierBadge);
    card.appendChild(header);

    const summary = document.createElement("p");
    summary.textContent = preset.summary;
    card.appendChild(summary);

    if (Array.isArray(preset.features) && preset.features.length > 0) {
      const list = document.createElement("ul");
      preset.features.forEach((item) => {
        const li = document.createElement("li");
        li.textContent = item;
        list.appendChild(li);
      });
      card.appendChild(list);
    }

    const setup = preset.definition?.options?.setup;
    if (setup === "pending") {
      const note = document.createElement("p");
      note.className = "setup-note";
      note.textContent = "Implementation required – wire up the module path noted in the config.";
      card.appendChild(note);
    }

    const footer = document.createElement("footer");
    const alreadyAdded = Boolean(activeTools[preset.key]);
    const button = document.createElement("button");
    if (preset.tier === "pro") {
      button.type = "button";
      button.className = "ghost";
      button.disabled = true;
      button.textContent = "Unlock in Feather Pro";
    } else {
      button.type = "button";
      button.className = alreadyAdded ? "ghost" : "primary";
      button.textContent = alreadyAdded ? "Added" : "Add to registry";
      button.disabled = alreadyAdded;
      if (!alreadyAdded) {
        button.addEventListener("click", () => applyToolPreset(preset));
      }
    }
    footer.appendChild(button);
    card.appendChild(footer);

    container.appendChild(card);
  });
}

function applyToolPreset(preset) {
  if (!state.config) return;
  state.config.tools = state.config.tools || {};
  if (state.config.tools[preset.key]) return;
  state.config.tools[preset.key] = cloneDefinition(preset.definition);
  markConfigChanged();
  renderAll();
}

function cloneDefinition(definition) {
  if (typeof structuredClone === "function") {
    return structuredClone(definition);
  }
  return JSON.parse(JSON.stringify(definition));
}

function seedCorePresets() {
  if (!state.config) return false;
  state.config.tools = state.config.tools || {};
  const alreadySeeded = localStorage.getItem(PRESET_STORAGE_KEY) === "1";
  let changed = false;
  if (!alreadySeeded) {
    for (const preset of TOOL_LIBRARY) {
      if (!preset.autoSeed) continue;
      if (state.config.tools[preset.key]) continue;
      state.config.tools[preset.key] = cloneDefinition(preset.definition);
      changed = true;
    }
    if (changed || corePresetsPresent()) {
      localStorage.setItem(PRESET_STORAGE_KEY, "1");
    }
  } else if (corePresetsPresent()) {
    localStorage.setItem(PRESET_STORAGE_KEY, "1");
  }
  return changed;
}

function corePresetsPresent() {
  if (!state.config?.tools) return false;
  return TOOL_LIBRARY.filter((preset) => preset.autoSeed).every((preset) => preset.key in state.config.tools);
}

function renderProviders() {
  const container = elements.providers;
  container.innerHTML = "";
  if (!state.config) return;
  const entries = state.config.providers?.entries || {};
  const names = Object.keys(entries);
  if (names.length === 0) {
    container.innerHTML = `<p>No providers registered yet. Use the form below to add one.</p>`;
    return;
  }
  names.sort().forEach((name) => {
    const provider = entries[name];
    const wrapper = document.createElement("div");
    wrapper.className = "provider-item";

    const header = document.createElement("div");
    header.className = "button-row";
    const title = document.createElement("h3");
    title.textContent = name;
    title.style.flex = "1";
    header.appendChild(title);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "Remove";
    remove.addEventListener("click", () => {
      delete entries[name];
      markConfigChanged();
      renderAll();
    });
    header.appendChild(remove);
    wrapper.appendChild(header);

    const grid = document.createElement("div");
    grid.className = "provider-grid";

    const referenceType = provider.module ? "module" : "builtin";
    const typeLabel = createLabeledSelect("Reference type", referenceType, [
      { label: "Builtin", value: "builtin" },
      { label: "Module", value: "module" },
    ]);
    typeLabel.querySelector("select").addEventListener("change", (event) => {
      const value = event.target.value;
      if (value === "builtin") {
        provider.builtin = provider.builtin || provider.module || "";
        delete provider.module;
      } else {
        provider.module = provider.module || provider.builtin || "";
        delete provider.builtin;
      }
      markConfigChanged();
      renderAll();
    });
    grid.appendChild(typeLabel);

    const referenceLabel = createLabeledInput(
      "Builtin or module path",
      referenceType === "module" ? provider.module ?? "" : provider.builtin ?? "",
      "text",
      (value) => {
        if (referenceType === "module") {
          if (value) {
            provider.module = value;
          } else {
            delete provider.module;
          }
        } else if (value) {
          provider.builtin = value;
        } else {
          delete provider.builtin;
        }
        markConfigChanged();
      }
    );
    grid.appendChild(referenceLabel);

    const exportLabel = createLabeledInput(
      "Export name",
      provider.export ?? "",
      "text",
      (value) => {
        provider.export = value || undefined;
        markConfigChanged();
      }
    );
    grid.appendChild(exportLabel);

    const envLabel = document.createElement("label");
    envLabel.textContent = "API key env";
    const envInput = document.createElement("input");
    envInput.type = "text";
    envInput.value = provider.apiKeyEnv ?? "";
    envInput.placeholder = `${name.toUpperCase()}_API_KEY`;
    envInput.addEventListener("change", () => {
      const oldEnv = provider.apiKeyEnv ?? `${name.toUpperCase()}_API_KEY`;
      const next = envInput.value.trim() || undefined;
      provider.apiKeyEnv = next;
      if (oldEnv !== next) {
        const existingValue = state.apiKeys[oldEnv];
        if (existingValue && next && !state.apiKeys[next]) {
          state.apiKeys[next] = existingValue;
        }
        delete state.apiKeys[oldEnv];
        persistKeys();
      }
      markConfigChanged();
      renderAll();
    });
    envLabel.appendChild(envInput);
    grid.appendChild(envLabel);

    const baseUrlLabel = createLabeledInput(
      "Base URL",
      provider.baseUrl ?? "",
      "url",
      (value) => {
        provider.baseUrl = value || undefined;
        markConfigChanged();
      }
    );
    grid.appendChild(baseUrlLabel);

    const envName = provider.apiKeyEnv ?? `${name.toUpperCase()}_API_KEY`;
    const apiKeyValue = state.apiKeys[envName] || "";
    const keyLabel = createLabeledInput(
      provider.apiKeyEnv ? `${provider.apiKeyEnv} value` : "API key",
      apiKeyValue,
      "password",
      (value) => {
        const currentName = provider.apiKeyEnv ?? `${name.toUpperCase()}_API_KEY`;
        if (value) {
          state.apiKeys[currentName] = value;
        } else {
          delete state.apiKeys[currentName];
        }
        persistKeys();
      }
    );
    keyLabel.querySelector("input").placeholder = provider.apiKeyEnv ?? `${name.toUpperCase()}_API_KEY`;
    grid.appendChild(keyLabel);

    wrapper.appendChild(grid);
    container.appendChild(wrapper);
  });
}

function renderTools() {
  const container = elements.tools;
  container.innerHTML = "";
  if (!state.config) return;
  const entries = state.config.tools || {};
  const names = Object.keys(entries);
  if (names.length === 0) {
    container.innerHTML = `<p>No tools registered yet. Add one to expose functionality to planners.</p>`;
    return;
  }
  names.sort().forEach((name) => {
    const tool = entries[name];
    const wrapper = document.createElement("div");
    wrapper.className = "tool-item";

    const header = document.createElement("div");
    header.className = "button-row";
    const title = document.createElement("h3");
    title.textContent = tool.name || name;
    title.style.flex = "1";
    header.appendChild(title);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "Remove";
    remove.addEventListener("click", () => {
      delete entries[name];
      Object.values(state.config.agents || {}).forEach((agent) => {
        if (!Array.isArray(agent.tools)) return;
        agent.tools = agent.tools.filter((entry) => entry !== name);
      });
      markConfigChanged();
      renderAll();
    });
    header.appendChild(remove);
    wrapper.appendChild(header);

    const metaItems = [];
    if (tool.options?.category) {
      metaItems.push(tool.options.category);
    }
    if (tool.options?.tier) {
      metaItems.push(tool.options.tier === "pro" ? "Pro" : tool.options.tier);
    }
    if (tool.options?.setup === "pending") {
      metaItems.push("Setup required");
    }
    if (tool.options?.paywall) {
      metaItems.push("Pro upgrade");
    }
    if (metaItems.length > 0) {
      const meta = document.createElement("div");
      meta.className = "tool-meta";
      metaItems.forEach((label) => {
        const chip = document.createElement("span");
        chip.textContent = label;
        meta.appendChild(chip);
      });
      wrapper.appendChild(meta);
    }

    const grid = document.createElement("div");
    grid.className = "tool-grid";

    const referenceType = tool.module ? "module" : "builtin";
    const typeLabel = createLabeledSelect("Reference type", referenceType, [
      { label: "Builtin", value: "builtin" },
      { label: "Module", value: "module" },
    ]);
    typeLabel.querySelector("select").addEventListener("change", (event) => {
      const value = event.target.value;
      if (value === "builtin") {
        tool.builtin = tool.builtin || tool.module || "";
        delete tool.module;
      } else {
        tool.module = tool.module || tool.builtin || "";
        delete tool.builtin;
      }
      markConfigChanged();
      renderAll();
    });
    grid.appendChild(typeLabel);

    const referenceLabel = createLabeledInput(
      "Builtin or module path",
      referenceType === "module" ? tool.module ?? "" : tool.builtin ?? "",
      "text",
      (value) => {
        if (referenceType === "module") {
          if (value) {
            tool.module = value;
          } else {
            delete tool.module;
          }
        } else if (value) {
          tool.builtin = value;
        } else {
          delete tool.builtin;
        }
        markConfigChanged();
      }
    );
    grid.appendChild(referenceLabel);

    const exportLabel = createLabeledInput("Export name", tool.export ?? "", "text", (value) => {
      tool.export = value || undefined;
      markConfigChanged();
    });
    grid.appendChild(exportLabel);

    const nameLabel = createLabeledInput("Display name", tool.name ?? "", "text", (value) => {
      tool.name = value || undefined;
      markConfigChanged();
    });
    grid.appendChild(nameLabel);

    const descriptionLabel = createLabeledTextArea(
      "Description",
      tool.description ?? "",
      (value) => {
        tool.description = value || undefined;
        markConfigChanged();
      }
    );
    grid.appendChild(descriptionLabel);

    const plannerDescriptionLabel = createLabeledTextArea(
      "Planner description",
      tool.planner?.description ?? "",
      (value) => {
        tool.planner = tool.planner || {};
        tool.planner.description = value || undefined;
        if (!value && !tool.planner.inputSchema) {
          delete tool.planner;
        }
        markConfigChanged();
      }
    );
    grid.appendChild(plannerDescriptionLabel);

    wrapper.appendChild(grid);
    container.appendChild(wrapper);
  });
}

function renderAgentSection() {
  const agentSelect = elements.agentSelect;
  const defaultSelect = elements.defaultAgent;
  const descriptionInput = elements.agentDescription;
  const toolsContainer = elements.agentTools;
  agentSelect.innerHTML = "";
  defaultSelect.innerHTML = "";
  toolsContainer.innerHTML = "";
  if (!state.config) return;
  const agents = state.config.agents || {};
  const agentNames = Object.keys(agents);
  if (agentNames.length === 0) {
    agentSelect.disabled = true;
    defaultSelect.disabled = true;
    descriptionInput.disabled = true;
    toolsContainer.innerHTML = `<p>No agents configured yet. Edit the JSON to add one.</p>`;
    return;
  }
  agentSelect.disabled = false;
  defaultSelect.disabled = false;
  descriptionInput.disabled = false;
  agentNames.forEach((name) => {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    if (name === state.selectedAgent) {
      option.selected = true;
    }
    agentSelect.appendChild(option);
  });
  agentNames.forEach((name) => {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    if (name === (state.config.defaults?.agent || null)) {
      option.selected = true;
    }
    defaultSelect.appendChild(option);
  });

  const agent = currentAgent();
  if (!agent) return;
  descriptionInput.value = agent.description ?? "";

  const toolNames = Object.keys(state.config.tools || {});
  if (toolNames.length === 0) {
    toolsContainer.innerHTML = `<p>No shared tools available. Add one above.</p>`;
    return;
  }
  const selectedTools = new Set((agent.tools || []).filter((item) => typeof item === "string"));
  toolNames.sort().forEach((name) => {
    const label = document.createElement("label");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = selectedTools.has(name);
    checkbox.addEventListener("change", () => {
      agent.tools = agent.tools || [];
      const list = agent.tools.filter((entry) => typeof entry === "string");
      if (checkbox.checked) {
        if (!list.includes(name)) {
          list.push(name);
        }
      } else {
        const index = list.indexOf(name);
        if (index >= 0) {
          list.splice(index, 1);
        }
      }
      agent.tools = list;
      markConfigChanged();
    });
    label.appendChild(checkbox);
    const text = document.createElement("span");
    text.textContent = name;
    label.appendChild(text);
    toolsContainer.appendChild(label);
  });
}

function renderConfigEditor() {
  if (!state.config) return;
  if (!state.editorDirty) {
    elements.configEditor.value = JSON.stringify(state.config, null, 2);
  }
  elements.configError.textContent = state.configError || "";
}

function syncConfigEditor() {
  if (!state.config || state.editorDirty) return;
  elements.configEditor.value = JSON.stringify(state.config, null, 2);
}

function markConfigChanged() {
  state.configError = "";
  state.editorDirty = false;
  syncConfigEditor();
}

function currentAgent() {
  if (!state.config || !state.selectedAgent) return null;
  return state.config.agents?.[state.selectedAgent] || null;
}

async function applyConfigFromEditor() {
  try {
    const text = elements.configEditor.value;
    const parsed = JSON.parse(text);
    const response = await fetch("/api/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config: parsed }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || "Validation failed");
    }
    const body = await response.json();
    state.config = body.config;
    state.editorDirty = false;
    state.configError = "";
    const agentNames = Object.keys(state.config.agents || {});
    if (!state.selectedAgent || !agentNames.includes(state.selectedAgent)) {
      state.selectedAgent = state.config.defaults?.agent || agentNames[0] || null;
    }
    renderAll();
  } catch (error) {
    state.configError = error.message;
    renderConfigEditor();
  }
}

async function runAgent() {
  if (!state.config) return;
  const prompt = elements.runPrompt.value.trim();
  if (!prompt) {
    elements.runOutput.textContent = "Enter a prompt before running the agent.";
    return;
  }
  elements.runButton.disabled = true;
  elements.runButton.textContent = "Running...";
  elements.runOutput.textContent = "Executing agent...";
  try {
    const response = await fetch("/api/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        config: state.config,
        agent: state.selectedAgent,
        prompt,
        apiKeys: state.apiKeys,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || "Agent execution failed");
    }
    elements.runOutput.textContent = JSON.stringify(payload.result, null, 2);
  } catch (error) {
    elements.runOutput.textContent = `Error: ${error.message}`;
  } finally {
    elements.runButton.disabled = false;
    elements.runButton.textContent = "Execute";
  }
}

function downloadConfigFile() {
  if (!state.config) return;
  const blob = new Blob([JSON.stringify(state.config, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "feather.config.json";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function downloadSampleScript() {
  const agentName = state.selectedAgent || "my-agent";
  const script = `import { createAgent } from "feather-agent";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.resolve(__dirname, "feather.config.json");

async function main() {
  const prompt = process.argv.slice(2).join(" ") || "Hello from Feather";
  const { agent } = await createAgent({ config: configPath, agent: "${agentName}" });
  const result = await agent.run({ sessionId: \`cli-\${Date.now()}\`, input: prompt });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
`;
  const blob = new Blob([script], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "run-agent.ts";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function handleProviderSubmit(event) {
  event.preventDefault();
  if (!state.config) return;
  const form = event.target;
  const data = new FormData(form);
  const name = (data.get("name") || "").toString().trim();
  if (!name) return;
  const refType = data.get("refType") || "builtin";
  const reference = (data.get("reference") || "").toString().trim();
  if (!reference) return;
  const exportName = (data.get("export") || "").toString().trim() || undefined;
  const apiKeyEnv = (data.get("apiKeyEnv") || "").toString().trim() || undefined;
  const baseUrl = (data.get("baseUrl") || "").toString().trim() || undefined;
  state.config.providers = state.config.providers || { entries: {} };
  const entry = {
    export: exportName,
    apiKeyEnv,
    baseUrl,
  };
  if (refType === "module") {
    entry.module = reference;
  } else {
    entry.builtin = reference;
  }
  state.config.providers.entries[name] = entry;
  markConfigChanged();
  form.reset();
  renderAll();
}

function handleToolUpload(event) {
  const input = event.target;
  const file = input?.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const text = reader.result;
      if (typeof text !== "string") {
        throw new Error("Unsupported file contents");
      }
      const manifest = JSON.parse(text);
      if (!manifest || typeof manifest !== "object") {
        throw new Error("Manifest must be a JSON object");
      }
      const keySource = manifest.id || manifest.name || file.name.replace(/\.[^.]+$/, "");
      const key = (keySource || "").toString().trim();
      if (!key) {
        throw new Error("Manifest must include a name or id");
      }
      if (!manifest.builtin && !manifest.module) {
        throw new Error("Manifest must define a builtin or module reference");
      }
      if (!state.config) {
        state.config = { version: 1, tools: {}, agents: {}, defaults: {} };
      }
      state.config.tools = state.config.tools || {};
      state.config.tools[key] = manifest;
      markConfigChanged();
      renderAll();
      state.configError = "";
      elements.configError.textContent = "";
    } catch (error) {
      state.configError = `Upload failed: ${error.message}`;
      renderConfigEditor();
    } finally {
      input.value = "";
    }
  };
  reader.onerror = () => {
    state.configError = "Upload failed: unable to read file";
    renderConfigEditor();
    input.value = "";
  };
  reader.readAsText(file);
}

function handleToolSubmit(event) {
  event.preventDefault();
  if (!state.config) return;
  const form = event.target;
  const data = new FormData(form);
  const name = (data.get("name") || "").toString().trim();
  if (!name) return;
  const refType = data.get("refType") || "builtin";
  const reference = (data.get("reference") || "").toString().trim();
  if (!reference) return;
  const exportName = (data.get("export") || "").toString().trim() || undefined;
  const description = (data.get("description") || "").toString().trim() || undefined;
  const plannerDescription = (data.get("plannerDescription") || "").toString().trim() || undefined;
  state.config.tools = state.config.tools || {};
  const entry = {
    export: exportName,
    description,
  };
  if (refType === "module") {
    entry.module = reference;
  } else {
    entry.builtin = reference;
  }
  if (plannerDescription) {
    entry.planner = { description: plannerDescription };
  }
  entry.name = name;
  state.config.tools[name] = entry;
  Object.values(state.config.agents || {}).forEach((agent) => {
    if (!Array.isArray(agent.tools)) {
      agent.tools = [];
    }
  });
  markConfigChanged();
  form.reset();
  renderAll();
}

function prettyPrintConfig() {
  try {
    const parsed = JSON.parse(elements.configEditor.value);
    const formatted = JSON.stringify(parsed, null, 2);
    elements.configEditor.value = formatted;
    state.editorDirty = true;
    state.configError = "";
    elements.configError.textContent = "";
  } catch (error) {
    state.configError = `Pretty print failed: ${error.message}`;
    renderConfigEditor();
  }
}

function scrollToCard(id) {
  const target = document.getElementById(id);
  if (!target) return;
  target.scrollIntoView({ behavior: "smooth", block: "start" });
  target.classList.add("highlight");
  window.setTimeout(() => target.classList.remove("highlight"), 1200);
}

function createLabeledInput(labelText, value, type, onChange) {
  const label = document.createElement("label");
  label.textContent = labelText;
  const input = document.createElement("input");
  input.type = type;
  input.value = value ?? "";
  input.addEventListener("change", () => onChange(input.value.trim()));
  label.appendChild(input);
  return label;
}

function createLabeledTextArea(labelText, value, onChange) {
  const label = document.createElement("label");
  label.textContent = labelText;
  const textarea = document.createElement("textarea");
  textarea.rows = 3;
  textarea.value = value ?? "";
  textarea.addEventListener("change", () => onChange(textarea.value.trim()));
  label.appendChild(textarea);
  return label;
}

function createLabeledSelect(labelText, selected, options) {
  const label = document.createElement("label");
  label.textContent = labelText;
  const select = document.createElement("select");
  options.forEach((option) => {
    const opt = document.createElement("option");
    opt.value = option.value;
    opt.textContent = option.label;
    if (option.value === selected) {
      opt.selected = true;
    }
    select.appendChild(opt);
  });
  label.appendChild(select);
  return label;
}

init().catch((error) => {
  console.error(error);
  elements.runOutput.textContent = `Failed to initialise dashboard: ${error.message}`;
});
