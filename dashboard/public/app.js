const state = {
  config: null,
  toolPresets: [],
  apiKeys: loadStoredKeys(),
  selectedAgent: null,
  editorDirty: false,
  configError: "",
};

const elements = {
  providers: document.getElementById("providers"),
  envVars: document.getElementById("env-vars"),
  tools: document.getElementById("tools"),
  agentSelect: document.getElementById("agent-select"),
  agentDescription: document.getElementById("agent-description"),
  defaultAgent: document.getElementById("default-agent"),
  agentTools: document.getElementById("agent-tools"),
  configEditor: document.getElementById("config-editor"),
  configError: document.getElementById("config-error"),
  applyConfig: document.getElementById("apply-config"),
  resetConfig: document.getElementById("reset-config"),
  runPrompt: document.getElementById("run-prompt"),
  runButton: document.getElementById("run-agent"),
  runOutput: document.getElementById("run-output"),
  downloadPackage: document.getElementById("download-package"),
  downloadConfig: document.getElementById("download-config"),
  downloadScript: document.getElementById("download-script"),
  providerForm: document.getElementById("provider-form"),
  toolForm: document.getElementById("tool-form"),
  toolPreset: document.getElementById("tool-preset"),
  toolPresetNote: document.getElementById("tool-preset-note"),
  toolFormError: document.getElementById("tool-form-error"),
};

async function init() {
  await Promise.all([reloadConfig(), loadToolPresets()]);
  elements.configEditor.addEventListener("input", () => {
    state.editorDirty = true;
  });
  elements.applyConfig.addEventListener("click", applyConfigFromEditor);
  elements.resetConfig.addEventListener("click", async () => {
    state.editorDirty = false;
    await reloadConfig();
  });
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
  elements.downloadPackage.addEventListener("click", downloadAgentPackage);
  elements.downloadConfig.addEventListener("click", downloadConfigFile);
  elements.downloadScript.addEventListener("click", downloadSampleScript);
  elements.providerForm.addEventListener("submit", handleProviderSubmit);
  elements.toolForm.addEventListener("submit", handleToolSubmit);
  elements.toolPreset.addEventListener("change", () => {
    applyToolPreset(elements.toolPreset.value);
  });
  renderToolPresetPicker();
}

function loadStoredKeys() {
  try {
    const raw = localStorage.getItem("legionaire:apiKeys") ?? localStorage.getItem("feather:apiKeys");
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed ? parsed : {};
  } catch (error) {
    console.warn("Failed to load API keys", error);
    return {};
  }
}

function persistKeys() {
  localStorage.setItem("legionaire:apiKeys", JSON.stringify(state.apiKeys));
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
  state.editorDirty = false;
  state.configError = "";
  renderAll();
}

async function loadToolPresets() {
  const response = await fetch("/api/tool-presets");
  if (!response.ok) {
    state.toolPresets = [];
    elements.toolPresetNote.textContent = "Preset catalog unavailable. You can still create custom tools.";
    return;
  }
  const payload = await response.json().catch(() => ({}));
  state.toolPresets = Array.isArray(payload?.presets) ? payload.presets : [];
  renderToolPresetPicker();
}

function renderToolPresetPicker() {
  if (!elements.toolPreset) {
    return;
  }
  elements.toolPreset.innerHTML = "";
  const customOption = document.createElement("option");
  customOption.value = "";
  customOption.textContent = "Custom";
  elements.toolPreset.appendChild(customOption);

  state.toolPresets.forEach((preset) => {
    const option = document.createElement("option");
    option.value = preset.id;
    option.textContent = preset.label;
    elements.toolPreset.appendChild(option);
  });
}

function renderAll() {
  renderProviders();
  renderEnvVars();
  renderTools();
  renderAgentSection();
  renderConfigEditor();
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

function renderEnvVars() {
  const container = elements.envVars;
  if (!container) return;
  container.innerHTML = "";
  if (!state.config) return;

  const providerEnvNames = collectProviderEnvNames(state.config);
  const additionalEnvNames = collectEnvLikeNames(state.config).filter((name) => !providerEnvNames.has(name));

  if (additionalEnvNames.length === 0) {
    return;
  }

  const heading = document.createElement("h3");
  heading.textContent = "Additional Runtime Env Values";
  container.appendChild(heading);

  const help = document.createElement("p");
  help.className = "card-help";
  help.textContent = "Detected from tool options (for example remote adapter base URLs and API keys).";
  container.appendChild(help);

  const grid = document.createElement("div");
  grid.className = "provider-grid";

  additionalEnvNames.forEach((name) => {
    const inputType = /KEY|TOKEN|SECRET|PASSWORD/.test(name) ? "password" : "text";
    const value = state.apiKeys[name] || "";
    const field = createLabeledInput(
      name,
      value,
      inputType,
      (next) => {
        if (next) {
          state.apiKeys[name] = next;
        } else {
          delete state.apiKeys[name];
        }
        persistKeys();
      }
    );
    field.querySelector("input").placeholder = name;
    grid.appendChild(field);
  });

  container.appendChild(grid);
}

function collectProviderEnvNames(config) {
  const names = new Set();
  const entries = config.providers?.entries || {};
  Object.entries(entries).forEach(([providerName, provider]) => {
    if (provider.apiKeyEnv) {
      names.add(provider.apiKeyEnv);
      return;
    }
    names.add(`${providerName.toUpperCase()}_API_KEY`);
  });
  return names;
}

function collectEnvLikeNames(value, output = new Set()) {
  if (Array.isArray(value)) {
    value.forEach((entry) => collectEnvLikeNames(entry, output));
    return Array.from(output).sort();
  }
  if (!value || typeof value !== "object") {
    return Array.from(output).sort();
  }
  Object.entries(value).forEach(([key, entry]) => {
    if (typeof entry === "string" && key.endsWith("Env") && entry.trim()) {
      output.add(entry.trim());
      return;
    }
    collectEnvLikeNames(entry, output);
  });
  return Array.from(output).sort();
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

    const optionsLabel = createLabeledTextArea(
      "Tool options (JSON)",
      formatJsonValue(tool.options),
      (value) => {
        try {
          const parsed = parseOptionalJson(value, "Tool options");
          tool.options = parsed;
          markConfigChanged();
        } catch (error) {
          state.configError = error.message;
          renderConfigEditor();
        }
      }
    );
    grid.appendChild(optionsLabel);

    const plannerSchemaLabel = createLabeledTextArea(
      "Planner input schema (JSON)",
      formatJsonValue(tool.planner?.inputSchema),
      (value) => {
        try {
          const schema = parseOptionalJson(value, "Planner input schema");
          if (schema !== undefined) {
            tool.planner = tool.planner || {};
            tool.planner.inputSchema = schema;
          } else if (tool.planner) {
            delete tool.planner.inputSchema;
          }
          if (!tool.planner?.description && !tool.planner?.inputSchema) {
            delete tool.planner;
          }
          markConfigChanged();
        } catch (error) {
          state.configError = error.message;
          renderConfigEditor();
        }
      }
    );
    grid.appendChild(plannerSchemaLabel);

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
  link.download = "legionaire.config.json";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

async function downloadAgentPackage() {
  if (!state.config) return;
  elements.downloadPackage.disabled = true;
  elements.downloadPackage.textContent = "Packaging...";
  elements.runOutput.textContent = "Building downloadable package...";
  try {
    const response = await fetch("/api/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        config: state.config,
        agent: state.selectedAgent,
      }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || "Package export failed");
    }
    const blob = await response.blob();
    const disposition = response.headers.get("content-disposition");
    const fileName = extractDownloadFilename(disposition) || "legionaire-package.tar.gz";
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    elements.runOutput.textContent = `Package downloaded: ${fileName}`;
  } catch (error) {
    elements.runOutput.textContent = `Error: ${error.message}`;
  } finally {
    elements.downloadPackage.disabled = false;
    elements.downloadPackage.textContent = "Download package";
  }
}

function downloadSampleScript() {
  const agentName = state.selectedAgent || "my-agent";
  const script = `import { createAgent } from "legionaire";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.resolve(__dirname, "legionaire.config.json");

async function main() {
  const prompt = process.argv.slice(2).join(" ") || "Hello from Legionaire";
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

function extractDownloadFilename(contentDisposition) {
  if (!contentDisposition || typeof contentDisposition !== "string") {
    return null;
  }
  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match && utf8Match[1]) {
    return decodeURIComponent(utf8Match[1]);
  }
  const basicMatch = contentDisposition.match(/filename="([^"]+)"/i) || contentDisposition.match(/filename=([^;]+)/i);
  if (basicMatch && basicMatch[1]) {
    return basicMatch[1].trim();
  }
  return null;
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

function handleToolSubmit(event) {
  event.preventDefault();
  if (!state.config) return;
  const form = event.target;
  elements.toolFormError.textContent = "";

  try {
    const data = new FormData(form);
    const name = (data.get("name") || "").toString().trim();
    if (!name) {
      throw new Error("Tool name is required");
    }
    const refType = data.get("refType") || "builtin";
    const reference = (data.get("reference") || "").toString().trim();
    if (!reference) {
      throw new Error("Builtin or module path is required");
    }
    const exportName = (data.get("export") || "").toString().trim() || undefined;
    const description = (data.get("description") || "").toString().trim() || undefined;
    const plannerDescription = (data.get("plannerDescription") || "").toString().trim() || undefined;
    const optionsJson = (data.get("optionsJson") || "").toString().trim();
    const plannerInputSchemaJson = (data.get("plannerInputSchema") || "").toString().trim();

    const options = parseOptionalJson(optionsJson, "Tool options");
    const plannerInputSchema = parseOptionalJson(plannerInputSchemaJson, "Planner input schema");

    state.config.tools = state.config.tools || {};
    const entry = {
      export: exportName,
      description,
      options,
    };
    if (refType === "module") {
      entry.module = reference;
    } else {
      entry.builtin = reference;
    }
    if (plannerDescription || plannerInputSchema !== undefined) {
      entry.planner = {
        description: plannerDescription,
        inputSchema: plannerInputSchema,
      };
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
    if (elements.toolPreset) {
      elements.toolPreset.value = "";
    }
    elements.toolPresetNote.textContent = "";
    renderAll();
  } catch (error) {
    elements.toolFormError.textContent = error.message;
  }
}

function applyToolPreset(presetId) {
  elements.toolFormError.textContent = "";
  if (!presetId) {
    elements.toolPresetNote.textContent = "";
    return;
  }
  const preset = state.toolPresets.find((entry) => entry.id === presetId);
  if (!preset) {
    elements.toolPresetNote.textContent = "Preset not found. Please refresh and try again.";
    return;
  }
  if (!state.config) {
    elements.toolPresetNote.textContent = "Load a config before applying presets.";
    return;
  }

  const form = elements.toolForm;
  form.elements.namedItem("name").value = toUniqueToolName(preset.recommendedToolName || preset.id);
  const isModulePreset = typeof preset.definition?.module === "string";
  form.elements.namedItem("refType").value = isModulePreset ? "module" : "builtin";
  form.elements.namedItem("reference").value = isModulePreset
    ? preset.definition.module
    : preset.definition.builtin || "";
  form.elements.namedItem("export").value = preset.definition.export || "";
  form.elements.namedItem("description").value = preset.definition.description || "";
  form.elements.namedItem("plannerDescription").value = preset.definition.planner?.description || "";
  form.elements.namedItem("optionsJson").value = formatJsonValue(preset.definition.options);
  form.elements.namedItem("plannerInputSchema").value = formatJsonValue(preset.definition.planner?.inputSchema);
  elements.toolPresetNote.textContent = preset.notes || preset.summary || "";
}

function toUniqueToolName(baseName) {
  const cleaned = (baseName || "tool").trim() || "tool";
  const existing = new Set(Object.keys(state.config?.tools || {}));
  if (!existing.has(cleaned)) {
    return cleaned;
  }
  let suffix = 2;
  while (existing.has(`${cleaned}_${suffix}`)) {
    suffix += 1;
  }
  return `${cleaned}_${suffix}`;
}

function parseOptionalJson(value, label) {
  if (!value) {
    return undefined;
  }
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error(`${label} must be valid JSON: ${error.message}`);
  }
}

function formatJsonValue(value) {
  if (value === undefined) {
    return "";
  }
  return JSON.stringify(value, null, 2);
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
