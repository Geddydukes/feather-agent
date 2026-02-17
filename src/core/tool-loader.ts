import { createCalcTool } from "../tools/calc.js";
import { createWebSearchTool, type CreateWebSearchToolOptions, type WebSearchAdapter } from "../tools/webSearch.js";
import {
  InMemoryBlobStore,
  InMemoryKvStore,
  ScopedSecretsManager,
  createAuditLogEventTool,
  createMemoryBlobGetTool,
  createMemoryBlobPutTool,
  createMemoryKvGetTool,
  createMemoryKvSetTool,
  createSecretsGetTool,
} from "../tools/platform.js";
import {
  createWebBrowserSessionTool,
  type BrowserSessionAdapter,
} from "../tools/browser.js";
import {
  createAllowlistEnforceTool,
  createPolicyCheckTool,
  createPromptInjectionScanTool,
  createRedactionApplyTool,
} from "../tools/governance.js";
import {
  createCitationFormatTool,
  createDocOcrImageTool,
  createDocParsePdfTool,
  type OcrAdapter,
  type PdfParserAdapter,
} from "../tools/docs.js";
import {
  createArtifactPackTool,
  createFsListTool,
  createFsReadTool,
  createFsWriteTool,
  createHttpRequestTool,
  createSchemaValidateJsonTool,
  createWebFetchTool,
} from "../tools/ops.js";
import {
  createFsDiffTool,
  createGitBranchTool,
  createGitCommitTool,
  createGitDiffTool,
  createGitStatusTool,
} from "../tools/dev.js";
import {
  InMemoryVectorStore,
  createCsvReadTool,
  createCsvWriteTool,
  createDbQuerySqlTool,
  createVectorSearchTool,
  createVectorUpsertTool,
  type SqlQueryAdapter,
} from "../tools/data.js";
import {
  createNodeRunSandboxTool,
  createPythonRunSandboxTool,
  createShellRunRestrictedTool,
} from "../tools/execution.js";
import {
  createCalendarCreateTool,
  createCalendarListTool,
  createCalendarUpdateTool,
  createChatPostMessageTool,
  createEmailSearchTool,
  createEmailSendTool,
  type CalendarAdapter,
  type ChatAdapter,
  type EmailAdapter,
} from "../tools/communication.js";
import {
  createConnectorInvokeTool,
  type ConnectorInvokeAdapter,
} from "../tools/connectors.js";
import {
  InMemoryBudgetManager,
  InMemoryPlanStore,
  createBudgetConsumeTool,
  createBudgetGetTool,
  createPlanCreateTool,
  createPlanUpdateTool,
  createTaskSpawnTool,
  type TaskSpawnAdapter,
} from "../tools/control.js";
import {
  createRemoteBrowserSessionAdapter,
  createRemoteCalendarAdapter,
  createRemoteChatAdapter,
  createRemoteConnectorAdapter,
  createRemoteEmailAdapter,
  createRemoteOcrAdapter,
  createRemotePdfParserAdapter,
  createRemoteSqlAdapter,
  createRemoteTaskSpawnerAdapter,
  createRemoteWebSearchAdapter,
  type RemoteAdapterOptions,
} from "../tools/remote-adapters.js";
import { InMemoryToolAuditLogger } from "../tools/audit.js";
import type { Tool } from "../tools/types.js";
import { ModuleReferenceSchema, type ToolDefinitionConfig, type ModuleReferenceConfig } from "../types/config.js";
import { ModuleRegistry, type RegistryContext } from "./registry.js";

interface ToolFactoryContext extends RegistryContext {}

const sharedKvStore = new InMemoryKvStore();
const sharedBlobStore = new InMemoryBlobStore();
const sharedAuditLogger = new InMemoryToolAuditLogger();
const sharedVectorStore = new InMemoryVectorStore();
const sharedPlanStore = new InMemoryPlanStore();
const sharedBudgetManager = new InMemoryBudgetManager();

export interface LoadedTool {
  tool: Tool;
  planner?: ToolDefinitionConfig["planner"];
}

export function createToolRegistry(context: ToolFactoryContext) {
  return new ModuleRegistry<Tool, ToolFactoryContext>({
    kind: "tool",
    context,
    builtins: {
      calc: (ref) => createCalcTool((ref.options ?? {}) as Record<string, unknown>),
      "web.search": async (ref, ctx) => createBuiltinWebSearchTool(ref, ctx),
      "memory.kv_get": () => createMemoryKvGetTool(sharedKvStore),
      "memory.kv_set": () => createMemoryKvSetTool(sharedKvStore),
      "memory.blob_put": () => createMemoryBlobPutTool(sharedBlobStore),
      "memory.blob_get": () => createMemoryBlobGetTool(sharedBlobStore),
      "audit.log_event": () => createAuditLogEventTool(sharedAuditLogger),
      "secrets.get": (ref) => createBuiltinSecretsGetTool(ref),
      "schema.validate_json": () => createSchemaValidateJsonTool(),
      "fs.list": (ref) => createBuiltinFsListTool(ref),
      "fs.read": (ref) => createBuiltinFsReadTool(ref),
      "fs.write": (ref) => createBuiltinFsWriteTool(ref),
      "fs.diff": (ref) => createBuiltinFsDiffTool(ref),
      "web.fetch": (ref) => createBuiltinWebFetchTool(ref),
      "http.request": (ref) => createBuiltinHttpRequestTool(ref),
      "artifact.pack": (ref) => createBuiltinArtifactPackTool(ref),
      "git.status": (ref) => createBuiltinGitStatusTool(ref),
      "git.diff": (ref) => createBuiltinGitDiffTool(ref),
      "git.commit": (ref) => createBuiltinGitCommitTool(ref),
      "git.branch": (ref) => createBuiltinGitBranchTool(ref),
      "doc.parse_pdf": (ref, ctx) => createBuiltinDocParsePdfTool(ref, ctx),
      "doc.ocr_image": (ref, ctx) => createBuiltinDocOcrImageTool(ref, ctx),
      "citation.format": () => createCitationFormatTool(),
      "web.browser_session": (ref, ctx) => createBuiltinWebBrowserSessionTool(ref, ctx),
      "prompt_injection.scan": (ref) => createBuiltinPromptInjectionScanTool(ref),
      "redaction.apply": () => createRedactionApplyTool(),
      "policy.check": () => createPolicyCheckTool(),
      "allowlist.enforce": (ref) => createBuiltinAllowlistEnforceTool(ref),
      "db.query_sql": async (ref, ctx) => createBuiltinDbQuerySqlTool(ref, ctx),
      "vector.upsert": () => createVectorUpsertTool(sharedVectorStore),
      "vector.search": () => createVectorSearchTool(sharedVectorStore),
      "etl.csv_read": (ref) => createBuiltinCsvReadTool(ref),
      "etl.csv_write": (ref) => createBuiltinCsvWriteTool(ref),
      "python.run_sandbox": (ref) => createBuiltinPythonRunSandboxTool(ref),
      "node.run_sandbox": (ref) => createBuiltinNodeRunSandboxTool(ref),
      "shell.run_restricted": (ref) => createBuiltinShellRunRestrictedTool(ref),
      "email.search": async (ref, ctx) => createBuiltinEmailSearchTool(ref, ctx),
      "email.send": async (ref, ctx) => createBuiltinEmailSendTool(ref, ctx),
      "calendar.list": async (ref, ctx) => createBuiltinCalendarListTool(ref, ctx),
      "calendar.create": async (ref, ctx) => createBuiltinCalendarCreateTool(ref, ctx),
      "calendar.update": async (ref, ctx) => createBuiltinCalendarUpdateTool(ref, ctx),
      "chat.post_message": async (ref, ctx) => createBuiltinChatPostMessageTool(ref, ctx),
      "connector.invoke": async (ref, ctx) => createBuiltinConnectorInvokeTool(ref, ctx),
      "plan.create": () => createPlanCreateTool(sharedPlanStore),
      "plan.update": () => createPlanUpdateTool(sharedPlanStore),
      "task.spawn": async (ref, ctx) => createBuiltinTaskSpawnTool(ref, ctx),
      "budget.get": () => createBudgetGetTool(sharedBudgetManager),
      "budget.consume": () => createBudgetConsumeTool(sharedBudgetManager),
    },
    assert: (value) => {
      const tool = value as Tool | undefined;
      if (!tool || typeof tool.name !== "string" || typeof tool.run !== "function") {
        throw new Error("Tool factory must return a Tool instance");
      }
    },
  });
}

export async function instantiateTool(
  reference: ModuleReferenceConfig & { name?: string; description?: string; planner?: ToolDefinitionConfig["planner"] },
  registry: ModuleRegistry<Tool, ToolFactoryContext>
): Promise<LoadedTool> {
  const instance = await registry.create(reference);
  const tool = applyOverrides(instance, reference);
  return { tool, planner: reference.planner } satisfies LoadedTool;
}

function applyOverrides(tool: Tool, overrides: { name?: string; description?: string }): Tool {
  if (!overrides.name && !overrides.description) {
    return tool;
  }
  return {
    ...tool,
    name: overrides.name ?? tool.name,
    description: overrides.description ?? tool.description,
  };
}

async function createBuiltinWebSearchTool(
  reference: ModuleReferenceConfig,
  context: ToolFactoryContext
): Promise<Tool> {
  const options = toRecord(reference.options, "web.search builtin options");
  const adapter = await resolveAdapterOrRemote<WebSearchAdapter>({
    context,
    options,
    missingMessage: "web.search builtin requires options.adapter",
    adapterKind: "web search adapter",
    assert: (value) => Boolean(value) && typeof (value as WebSearchAdapter).search === "function",
    assertMessage: "Web search adapter must expose a search(request) function",
    remoteFactory: (remote) => createRemoteWebSearchAdapter(remote),
  });
  const { adapter: _adapter, remote: _remote, ...toolOptionsRaw } = options;
  return createWebSearchTool(adapter, toolOptionsRaw as CreateWebSearchToolOptions);
}

function toRecord(value: unknown, label: string): Record<string, unknown> {
  if (value === undefined) {
    return {};
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function parseModuleReference(value: unknown, missingMessage: string): ModuleReferenceConfig {
  if (value === undefined) {
    throw new Error(missingMessage);
  }
  return ModuleReferenceSchema.parse(value);
}

function createBuiltinSecretsGetTool(reference: ModuleReferenceConfig): Tool {
  const options = toRecord(reference.options, "secrets.get builtin options");
  const rawPolicy = options.policy;
  const policy: Record<string, string[]> = {};
  if (rawPolicy && typeof rawPolicy === "object" && !Array.isArray(rawPolicy)) {
    for (const [toolName, entries] of Object.entries(rawPolicy as Record<string, unknown>)) {
      if (!Array.isArray(entries)) {
        continue;
      }
      policy[toolName] = entries.filter((value): value is string => typeof value === "string");
    }
  }
  return createSecretsGetTool(
    new ScopedSecretsManager(
      {
        get: async (name) => process.env[name],
      },
      policy
    )
  );
}

function createBuiltinFsListTool(reference: ModuleReferenceConfig): Tool {
  const options = toRecord(reference.options, "fs.list builtin options");
  return createFsListTool({
    workspaceRoots: toStringArray(options.workspaceRoots),
    maxReadBytes: toPositiveNumber(options.maxReadBytes),
    allowedExtensions: toStringArray(options.allowedExtensions),
  });
}

function createBuiltinFsReadTool(reference: ModuleReferenceConfig): Tool {
  const options = toRecord(reference.options, "fs.read builtin options");
  return createFsReadTool({
    workspaceRoots: toStringArray(options.workspaceRoots),
    maxReadBytes: toPositiveNumber(options.maxReadBytes),
    allowedExtensions: toStringArray(options.allowedExtensions),
  });
}

function createBuiltinFsWriteTool(reference: ModuleReferenceConfig): Tool {
  const options = toRecord(reference.options, "fs.write builtin options");
  return createFsWriteTool({
    workspaceRoots: toStringArray(options.workspaceRoots),
    maxWriteBytes: toPositiveNumber(options.maxWriteBytes),
    allowedExtensions: toStringArray(options.allowedExtensions),
  });
}

function createBuiltinFsDiffTool(reference: ModuleReferenceConfig): Tool {
  const options = toRecord(reference.options, "fs.diff builtin options");
  return createFsDiffTool({
    workspaceRoots: toStringArray(options.workspaceRoots),
    maxOutputBytes: toPositiveNumber(options.maxOutputBytes),
    commandTimeoutMs: toPositiveNumber(options.commandTimeoutMs),
  });
}

function createBuiltinWebFetchTool(reference: ModuleReferenceConfig): Tool {
  const options = toRecord(reference.options, "web.fetch builtin options");
  return createWebFetchTool({
    defaultTimeoutMs: toPositiveNumber(options.defaultTimeoutMs),
    defaultMaxBytes: toPositiveNumber(options.defaultMaxBytes),
    defaultMaxRedirects: toPositiveNumber(options.defaultMaxRedirects),
    allowedHosts: toStringArray(options.allowedHosts),
  });
}

function createBuiltinHttpRequestTool(reference: ModuleReferenceConfig): Tool {
  const options = toRecord(reference.options, "http.request builtin options");
  return createHttpRequestTool({
    allowedHosts: toStringArray(options.allowedHosts),
    maxResponseBytes: toPositiveNumber(options.maxResponseBytes),
    methods: toStringArray(options.methods),
  });
}

function createBuiltinArtifactPackTool(reference: ModuleReferenceConfig): Tool {
  const options = toRecord(reference.options, "artifact.pack builtin options");
  return createArtifactPackTool({
    workspaceRoots: toStringArray(options.workspaceRoots),
    maxTotalBytes: toPositiveNumber(options.maxTotalBytes),
  });
}

function createBuiltinGitStatusTool(reference: ModuleReferenceConfig): Tool {
  const options = toRecord(reference.options, "git.status builtin options");
  return createGitStatusTool({
    workspaceRoots: toStringArray(options.workspaceRoots),
    maxOutputBytes: toPositiveNumber(options.maxOutputBytes),
    commandTimeoutMs: toPositiveNumber(options.commandTimeoutMs),
  });
}

function createBuiltinGitDiffTool(reference: ModuleReferenceConfig): Tool {
  const options = toRecord(reference.options, "git.diff builtin options");
  return createGitDiffTool({
    workspaceRoots: toStringArray(options.workspaceRoots),
    maxOutputBytes: toPositiveNumber(options.maxOutputBytes),
    commandTimeoutMs: toPositiveNumber(options.commandTimeoutMs),
  });
}

function createBuiltinGitCommitTool(reference: ModuleReferenceConfig): Tool {
  const options = toRecord(reference.options, "git.commit builtin options");
  return createGitCommitTool({
    workspaceRoots: toStringArray(options.workspaceRoots),
    maxOutputBytes: toPositiveNumber(options.maxOutputBytes),
    commandTimeoutMs: toPositiveNumber(options.commandTimeoutMs),
  });
}

function createBuiltinGitBranchTool(reference: ModuleReferenceConfig): Tool {
  const options = toRecord(reference.options, "git.branch builtin options");
  return createGitBranchTool({
    workspaceRoots: toStringArray(options.workspaceRoots),
    maxOutputBytes: toPositiveNumber(options.maxOutputBytes),
    commandTimeoutMs: toPositiveNumber(options.commandTimeoutMs),
  });
}

async function createBuiltinDocParsePdfTool(reference: ModuleReferenceConfig, context: ToolFactoryContext): Promise<Tool> {
  const options = toRecord(reference.options, "doc.parse_pdf builtin options");
  const adapter = await resolveAdapterOrRemote<PdfParserAdapter>({
    context,
    options,
    missingMessage: "doc.parse_pdf requires options.adapter",
    adapterKind: "pdf parser adapter",
    assert: (value) => Boolean(value) && typeof (value as PdfParserAdapter).parse === "function",
    assertMessage: "PDF parser adapter must expose parse(request)",
    remoteFactory: (remote) => createRemotePdfParserAdapter(remote),
  });
  return createDocParsePdfTool(adapter, {
    defaultMaxPages: toPositiveNumber(options.defaultMaxPages),
    name: toNonEmptyString(options.name),
    description: toNonEmptyString(options.description),
  });
}

async function createBuiltinDocOcrImageTool(reference: ModuleReferenceConfig, context: ToolFactoryContext): Promise<Tool> {
  const options = toRecord(reference.options, "doc.ocr_image builtin options");
  const adapter = await resolveAdapterOrRemote<OcrAdapter>({
    context,
    options,
    missingMessage: "doc.ocr_image requires options.adapter",
    adapterKind: "ocr adapter",
    assert: (value) => Boolean(value) && typeof (value as OcrAdapter).ocr === "function",
    assertMessage: "OCR adapter must expose ocr(request)",
    remoteFactory: (remote) => createRemoteOcrAdapter(remote),
  });
  return createDocOcrImageTool(adapter, {
    maxImageBytes: toPositiveNumber(options.maxImageBytes),
    name: toNonEmptyString(options.name),
    description: toNonEmptyString(options.description),
  });
}

async function createBuiltinWebBrowserSessionTool(
  reference: ModuleReferenceConfig,
  context: ToolFactoryContext
): Promise<Tool> {
  const options = toRecord(reference.options, "web.browser_session builtin options");
  const adapter = await resolveAdapterOrRemote<BrowserSessionAdapter>({
    context,
    options,
    missingMessage: "web.browser_session requires options.adapter",
    adapterKind: "browser session adapter",
    assert: (value) => Boolean(value) && typeof (value as BrowserSessionAdapter).runSession === "function",
    assertMessage: "Browser adapter must expose runSession(request)",
    remoteFactory: (remote) => createRemoteBrowserSessionAdapter(remote),
  });
  return createWebBrowserSessionTool(adapter, {
    name: toNonEmptyString(options.name),
    description: toNonEmptyString(options.description),
    defaultTimeoutMs: toPositiveNumber(options.defaultTimeoutMs),
    maxActions: toPositiveNumber(options.maxActions),
    allowedHosts: toStringArray(options.allowedHosts),
  });
}

function createBuiltinPromptInjectionScanTool(reference: ModuleReferenceConfig): Tool {
  const options = toRecord(reference.options, "prompt_injection.scan builtin options");
  const threshold = typeof options.blockThreshold === "number" ? options.blockThreshold : undefined;
  return createPromptInjectionScanTool({
    blockThreshold: threshold,
  });
}

function createBuiltinAllowlistEnforceTool(reference: ModuleReferenceConfig): Tool {
  const options = toRecord(reference.options, "allowlist.enforce builtin options");
  return createAllowlistEnforceTool({
    allowedTools: toStringArray(options.allowedTools),
    allowedHosts: toStringArray(options.allowedHosts),
    workspaceRoots: toStringArray(options.workspaceRoots),
    maxTimeoutMs: toPositiveNumber(options.maxTimeoutMs),
    maxBytes: toPositiveNumber(options.maxBytes),
  });
}

async function createBuiltinDbQuerySqlTool(
  reference: ModuleReferenceConfig,
  context: ToolFactoryContext
): Promise<Tool> {
  const options = toRecord(reference.options, "db.query_sql builtin options");
  const adapter = await resolveAdapterOrRemote<SqlQueryAdapter>({
    context,
    options,
    missingMessage: "db.query_sql requires options.adapter",
    adapterKind: "sql adapter",
    assert: (value) => Boolean(value) && typeof (value as SqlQueryAdapter).query === "function",
    assertMessage: "SQL adapter must expose query(request)",
    remoteFactory: (remote) => createRemoteSqlAdapter(remote),
  });
  return createDbQuerySqlTool(adapter, {
    name: toNonEmptyString(options.name),
    description: toNonEmptyString(options.description),
    defaultReadOnly: toBoolean(options.defaultReadOnly),
    defaultMaxRows: toPositiveNumber(options.defaultMaxRows),
  });
}

function createBuiltinCsvReadTool(reference: ModuleReferenceConfig): Tool {
  const options = toRecord(reference.options, "etl.csv_read builtin options");
  return createCsvReadTool({
    workspaceRoots: toStringArray(options.workspaceRoots),
    maxReadBytes: toPositiveNumber(options.maxReadBytes),
    maxWriteBytes: toPositiveNumber(options.maxWriteBytes),
  });
}

function createBuiltinCsvWriteTool(reference: ModuleReferenceConfig): Tool {
  const options = toRecord(reference.options, "etl.csv_write builtin options");
  return createCsvWriteTool({
    workspaceRoots: toStringArray(options.workspaceRoots),
    maxReadBytes: toPositiveNumber(options.maxReadBytes),
    maxWriteBytes: toPositiveNumber(options.maxWriteBytes),
  });
}

function createBuiltinPythonRunSandboxTool(reference: ModuleReferenceConfig): Tool {
  const options = toRecord(reference.options, "python.run_sandbox builtin options");
  return createPythonRunSandboxTool({
    workspaceRoots: toStringArray(options.workspaceRoots),
    defaultTimeoutMs: toPositiveNumber(options.defaultTimeoutMs),
    maxOutputBytes: toPositiveNumber(options.maxOutputBytes),
    allowNetwork: toBoolean(options.allowNetwork),
    allowedEnvKeys: toStringArray(options.allowedEnvKeys),
    pythonBinary: toNonEmptyString(options.pythonBinary),
    nodeBinary: toNonEmptyString(options.nodeBinary),
    shellAllowlist: toStringArray(options.shellAllowlist),
  });
}

function createBuiltinNodeRunSandboxTool(reference: ModuleReferenceConfig): Tool {
  const options = toRecord(reference.options, "node.run_sandbox builtin options");
  return createNodeRunSandboxTool({
    workspaceRoots: toStringArray(options.workspaceRoots),
    defaultTimeoutMs: toPositiveNumber(options.defaultTimeoutMs),
    maxOutputBytes: toPositiveNumber(options.maxOutputBytes),
    allowNetwork: toBoolean(options.allowNetwork),
    allowedEnvKeys: toStringArray(options.allowedEnvKeys),
    pythonBinary: toNonEmptyString(options.pythonBinary),
    nodeBinary: toNonEmptyString(options.nodeBinary),
    shellAllowlist: toStringArray(options.shellAllowlist),
  });
}

function createBuiltinShellRunRestrictedTool(reference: ModuleReferenceConfig): Tool {
  const options = toRecord(reference.options, "shell.run_restricted builtin options");
  return createShellRunRestrictedTool({
    workspaceRoots: toStringArray(options.workspaceRoots),
    defaultTimeoutMs: toPositiveNumber(options.defaultTimeoutMs),
    maxOutputBytes: toPositiveNumber(options.maxOutputBytes),
    allowNetwork: toBoolean(options.allowNetwork),
    allowedEnvKeys: toStringArray(options.allowedEnvKeys),
    pythonBinary: toNonEmptyString(options.pythonBinary),
    nodeBinary: toNonEmptyString(options.nodeBinary),
    shellAllowlist: toStringArray(options.shellAllowlist),
  });
}

async function createBuiltinEmailSearchTool(reference: ModuleReferenceConfig, context: ToolFactoryContext): Promise<Tool> {
  const options = toRecord(reference.options, "email.search builtin options");
  const adapter = await resolveAdapterOrRemote<EmailAdapter>({
    context,
    options,
    missingMessage: "email.search requires options.adapter",
    adapterKind: "email adapter",
    assert: (value) => Boolean(value) && typeof (value as EmailAdapter).search === "function",
    assertMessage: "Email adapter must expose search(request)",
    remoteFactory: (remote) => createRemoteEmailAdapter(remote),
  });
  return createEmailSearchTool(adapter);
}

async function createBuiltinEmailSendTool(reference: ModuleReferenceConfig, context: ToolFactoryContext): Promise<Tool> {
  const options = toRecord(reference.options, "email.send builtin options");
  const adapter = await resolveAdapterOrRemote<EmailAdapter>({
    context,
    options,
    missingMessage: "email.send requires options.adapter",
    adapterKind: "email adapter",
    assert: (value) => Boolean(value) && typeof (value as EmailAdapter).send === "function",
    assertMessage: "Email adapter must expose send(request)",
    remoteFactory: (remote) => createRemoteEmailAdapter(remote),
  });
  return createEmailSendTool(adapter, {
    allowedRecipients: toStringArray(options.allowedRecipients),
    requireHumanConfirmation: toBoolean(options.requireHumanConfirmation),
  });
}

async function createBuiltinCalendarListTool(reference: ModuleReferenceConfig, context: ToolFactoryContext): Promise<Tool> {
  const options = toRecord(reference.options, "calendar.list builtin options");
  const adapter = await resolveAdapterOrRemote<CalendarAdapter>({
    context,
    options,
    missingMessage: "calendar.list requires options.adapter",
    adapterKind: "calendar adapter",
    assert: (value) => Boolean(value) && typeof (value as CalendarAdapter).list === "function",
    assertMessage: "Calendar adapter must expose list(request)",
    remoteFactory: (remote) => createRemoteCalendarAdapter(remote),
  });
  return createCalendarListTool(adapter);
}

async function createBuiltinCalendarCreateTool(reference: ModuleReferenceConfig, context: ToolFactoryContext): Promise<Tool> {
  const options = toRecord(reference.options, "calendar.create builtin options");
  const adapter = await resolveAdapterOrRemote<CalendarAdapter>({
    context,
    options,
    missingMessage: "calendar.create requires options.adapter",
    adapterKind: "calendar adapter",
    assert: (value) => Boolean(value) && typeof (value as CalendarAdapter).create === "function",
    assertMessage: "Calendar adapter must expose create(request)",
    remoteFactory: (remote) => createRemoteCalendarAdapter(remote),
  });
  return createCalendarCreateTool(adapter, {
    allowedRecipients: toStringArray(options.allowedRecipients),
    requireHumanConfirmation: toBoolean(options.requireHumanConfirmation),
  });
}

async function createBuiltinCalendarUpdateTool(reference: ModuleReferenceConfig, context: ToolFactoryContext): Promise<Tool> {
  const options = toRecord(reference.options, "calendar.update builtin options");
  const adapter = await resolveAdapterOrRemote<CalendarAdapter>({
    context,
    options,
    missingMessage: "calendar.update requires options.adapter",
    adapterKind: "calendar adapter",
    assert: (value) => Boolean(value) && typeof (value as CalendarAdapter).update === "function",
    assertMessage: "Calendar adapter must expose update(request)",
    remoteFactory: (remote) => createRemoteCalendarAdapter(remote),
  });
  return createCalendarUpdateTool(adapter, {
    allowedRecipients: toStringArray(options.allowedRecipients),
    requireHumanConfirmation: toBoolean(options.requireHumanConfirmation),
  });
}

async function createBuiltinChatPostMessageTool(reference: ModuleReferenceConfig, context: ToolFactoryContext): Promise<Tool> {
  const options = toRecord(reference.options, "chat.post_message builtin options");
  const adapter = await resolveAdapterOrRemote<ChatAdapter>({
    context,
    options,
    missingMessage: "chat.post_message requires options.adapter",
    adapterKind: "chat adapter",
    assert: (value) => Boolean(value) && typeof (value as ChatAdapter).postMessage === "function",
    assertMessage: "Chat adapter must expose postMessage(request)",
    remoteFactory: (remote) => createRemoteChatAdapter(remote),
  });
  return createChatPostMessageTool(adapter, {
    allowedChannels: toStringArray(options.allowedChannels),
    requireHumanConfirmation: toBoolean(options.requireHumanConfirmation),
  });
}

async function createBuiltinConnectorInvokeTool(reference: ModuleReferenceConfig, context: ToolFactoryContext): Promise<Tool> {
  const options = toRecord(reference.options, "connector.invoke builtin options");
  const adapter = await resolveAdapterOrRemote<ConnectorInvokeAdapter>({
    context,
    options,
    missingMessage: "connector.invoke requires options.adapter",
    adapterKind: "connector adapter",
    assert: (value) => Boolean(value) && typeof (value as ConnectorInvokeAdapter).invoke === "function",
    assertMessage: "Connector adapter must expose invoke(request)",
    remoteFactory: (remote) => createRemoteConnectorAdapter(remote),
  });
  return createConnectorInvokeTool(adapter, {
    name: toNonEmptyString(options.name),
    description: toNonEmptyString(options.description),
    allowedConnectors: toStringArray(options.allowedConnectors),
    allowedOperations: toStringArray(options.allowedOperations),
  });
}

async function createBuiltinTaskSpawnTool(reference: ModuleReferenceConfig, context: ToolFactoryContext): Promise<Tool> {
  const options = toRecord(reference.options, "task.spawn builtin options");
  const adapter = await resolveAdapterOrRemote<TaskSpawnAdapter>({
    context,
    options,
    missingMessage: "task.spawn requires options.adapter",
    adapterKind: "task spawner adapter",
    assert: (value) => Boolean(value) && typeof (value as TaskSpawnAdapter).spawn === "function",
    assertMessage: "Task spawner adapter must expose spawn(request)",
    remoteFactory: (remote) => createRemoteTaskSpawnerAdapter(remote),
  });
  return createTaskSpawnTool(adapter, {
    allowedProfiles: toStringArray(options.allowedProfiles),
    requireHumanConfirmation: toBoolean(options.requireHumanConfirmation),
  });
}

async function resolveAdapterOrRemote<T>(input: {
  context: ToolFactoryContext;
  options: Record<string, unknown>;
  missingMessage: string;
  adapterKind: string;
  assert: (value: unknown) => boolean;
  assertMessage: string;
  remoteFactory?: (options: RemoteAdapterOptions) => T;
}): Promise<T> {
  if (input.options.remote !== undefined) {
    if (!input.remoteFactory) {
      throw new Error(`${input.adapterKind} does not support options.remote`);
    }
    const remote = parseRemoteAdapterOptions(input.options.remote, input.context);
    return input.remoteFactory(remote);
  }
  const adapterRef = parseModuleReference(input.options.adapter, input.missingMessage);
  const adapterRegistry = new ModuleRegistry<T, ToolFactoryContext>({
    kind: input.adapterKind,
    context: input.context,
    assert: (value) => {
      if (!input.assert(value)) {
        throw new Error(input.assertMessage);
      }
    },
  });
  return adapterRegistry.create(adapterRef);
}

function parseRemoteAdapterOptions(value: unknown, context: ToolFactoryContext): RemoteAdapterOptions {
  const options = toRecord(value, "remote adapter options");
  return {
    baseUrl: toNonEmptyString(options.baseUrl),
    baseUrlEnv: toNonEmptyString(options.baseUrlEnv),
    apiKey: toNonEmptyString(options.apiKey),
    apiKeyEnv: toNonEmptyString(options.apiKeyEnv),
    apiKeyHeader: toNonEmptyString(options.apiKeyHeader),
    apiKeyPrefix: typeof options.apiKeyPrefix === "string" ? options.apiKeyPrefix : undefined,
    timeoutMs: toPositiveNumber(options.timeoutMs),
    headers: toStringRecord(options.headers),
    paths: toStringRecord(options.paths),
    getEnv: context.env,
  };
}

function toStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const strings = value.filter((entry): entry is string => typeof entry === "string");
  return strings.length > 0 ? strings : undefined;
}

function toBoolean(value: unknown): boolean | undefined {
  if (typeof value !== "boolean") {
    return undefined;
  }
  return value;
}

function toStringRecord(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const output: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (typeof entry !== "string") {
      continue;
    }
    output[key] = entry;
  }
  return Object.keys(output).length > 0 ? output : undefined;
}

function toPositiveNumber(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }
  return Math.floor(value);
}

function toNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}
