# API Reference

Complete TypeScript API reference for Feather Orchestrator.

## Core Classes

### `Feather`

The main orchestrator class that manages providers, rate limiting, retries, and middleware.

```typescript
class Feather {
  constructor(opts: FeatherOpts)
  
  // Core methods
  chat(args: ChatArgs): Promise<ChatResponse>
  race(specs: ProviderSpec[]): RaceProvider
  fallback(specs: ProviderSpec[]): FallbackProvider
  map<T, R>(items: T[], fn: (item: T) => Promise<R>, opts?: MapOpts): Promise<R[]>
  
  // Streaming
  stream: {
    chat(args: ChatArgs): AsyncIterable<ChatDelta>
  }
  
  // Properties
  totalCostUSD: number
  onEvent?: (event: FeatherEvent) => void
}
```

#### `FeatherOpts`

```typescript
interface FeatherOpts {
  providers?: Record<string, ChatProvider>
  registry?: ProviderRegistry
  limits?: Record<string, { rps: number; burst?: number }>
  retry?: RetryOpts
  timeoutMs?: number
  middleware?: Middleware[]
}
```

#### `ChatArgs`

```typescript
interface ChatArgs {
  provider?: string          // Provider key (optional with registry)
  model: string             // Model name or alias
  messages: Message[]       // Chat messages
  temperature?: number      // 0-2, default 0.7
  maxTokens?: number        // Max response tokens
  topP?: number            // 0-1, default 0.9
  signal?: AbortSignal     // Cancellation signal
}
```

#### `ChatResponse`

```typescript
interface ChatResponse {
  content: string           // Generated text
  raw?: any                // Raw provider response
  tokens?: {               // Token usage
    input?: number
    output?: number
  }
  costUSD?: number         // Calculated cost
  provider?: string        // Provider that handled the request
  model?: string          // Model that was used
}
```

### `Agent`

Intelligent agent with planning and tool execution capabilities.

```typescript
class Agent {
  constructor(opts: AgentOpts)
  
  // Core methods
  run(input: AgentRunInput): Promise<AgentResult>
  
  // Properties
  id: string
  planner: Planner
  memory: MemoryManager
  tools: Tool[]
}
```

#### `AgentOpts`

```typescript
interface AgentOpts {
  id: string
  planner: Planner
  memory: MemoryManager
  tools: Tool[]
  policies?: AgentPolicies
  quotas?: AgentQuotas
}
```

#### `AgentRunInput`

```typescript
interface AgentRunInput {
  sessionId: string
  input: Message
  metadata?: Record<string, any>
}
```

#### `AgentResult`

```typescript
interface AgentResult {
  status: "completed" | "error" | "quota_exceeded"
  output?: Message
  error?: Error
  actions?: ToolActionResult[]
  metadata?: Record<string, any>
}
```

## Provider Interfaces

### `ChatProvider`

Interface that any LLM provider must implement.

```typescript
interface ChatProvider {
  id: string
  chat(req: ChatRequest, opts?: CallOpts): Promise<ChatResponse>
  stream?(req: ChatRequest, opts?: CallOpts): AsyncIterable<ChatDelta>
  estimate?(req: ChatRequest): TokenEstimate
  price?: PriceTable
}
```

#### `ChatRequest`

```typescript
interface ChatRequest {
  model: string
  messages: Message[]
  temperature?: number
  maxTokens?: number
  topP?: number
}
```

#### `CallOpts`

```typescript
interface CallOpts {
  signal?: AbortSignal
  retry?: RetryOpts
  timeoutMs?: number
}
```

#### `ChatDelta`

```typescript
interface ChatDelta {
  content?: string
  raw?: any
}
```

### Built-in Providers

#### `openai(config: OpenAIConfig): ChatProvider`

```typescript
interface OpenAIConfig {
  apiKey: string
  baseUrl?: string
  pricing?: PriceTable
}
```

#### `anthropic(config: AnthropicConfig): ChatProvider`

```typescript
interface AnthropicConfig {
  apiKey: string
  baseUrl?: string
  pricing?: PriceTable
}
```

## Memory Management

### `MemoryManager`

Base interface for memory backends.

```typescript
interface MemoryManager<TTurn extends MemoryTurn = MemoryTurn> {
  append(sessionId: string, turn: TTurn): Promise<void>
  getContext(sessionId: string, maxTokens?: number): Promise<TTurn[]>
  clear(sessionId: string): Promise<void>
  listSessions(): Promise<string[]>
}
```

### Memory Implementations

#### `InMemoryMemoryManager`

```typescript
class InMemoryMemoryManager implements MemoryManager {
  constructor(opts: InMemoryOpts)
}

interface InMemoryOpts {
  maxTurns?: number
  maxTokens?: number
  summarizeThreshold?: number
}
```

#### `PostgreSQLMemoryManager`

```typescript
class PostgreSQLMemoryManager implements MemoryManager {
  constructor(opts: PostgreSQLOpts)
}

interface PostgreSQLOpts {
  connectionString: string
  maxTokens?: number
  summarizeThreshold?: number
  tableName?: string
}
```

#### `RedisMemoryManager`

```typescript
class RedisMemoryManager implements MemoryManager {
  constructor(opts: RedisOpts)
}

interface RedisOpts {
  url: string
  maxTokens?: number
  summarizeThreshold?: number
  keyPrefix?: string
}
```

### Memory Redaction

#### `withRedaction<TTurn>(base: MemoryManager<TTurn>, options: MemoryRedactionOptions<TTurn>): MemoryManager<TTurn>`

```typescript
interface MemoryRedactionOptions<TTurn extends MemoryTurn> {
  redactor: (turn: TTurn, context: MemoryRedactionContext) => TTurn
  toggle?: MemoryRedactionToggle
  includeRoles?: Set<string>
  excludeRoles?: Set<string>
  defaultEnabled?: boolean
}
```

## Planning

### `Planner`

Interface for agent planning systems.

```typescript
interface Planner {
  (input: PlannerInput): Promise<AgentPlan>
}

interface PlannerInput {
  sessionId: string
  input: Message
  context: Message[]
  iteration: number
  metadata?: Record<string, any>
}
```

### `createJsonPlanner`

Creates a deterministic JSON-based planner.

```typescript
function createJsonPlanner(opts: JsonPlannerOpts): Planner

interface JsonPlannerOpts {
  callModel: (config: { messages: Message[] }) => Promise<string>
  tools: ToolSpec[]
  systemPrompt?: string
  maxRetries?: number
}
```

## Tools

### `Tool`

Interface for agent tools.

```typescript
interface Tool {
  name: string
  description: string
  execute(input: unknown): Promise<unknown>
  validate?(input: unknown): boolean
}
```

### Built-in Tools

#### `createCalcTool(): Tool`

Safe arithmetic calculator tool.

#### `createWebSearchTool(config: WebSearchConfig): Tool`

```typescript
interface WebSearchConfig {
  apiKey: string
  baseUrl?: string
}
```

#### `createCacheTool<T>(cache: Cache<T>): Tool`

Tool wrapper for caching results.

## Caching

### `PromptCache`

Intelligent prompt caching system.

```typescript
class PromptCache {
  constructor(opts: PromptCacheOpts)
  
  get(key: string): Promise<CachedResponse | null>
  set(key: string, response: ChatResponse): Promise<void>
  clear(): Promise<void>
}

interface PromptCacheOpts {
  ttlMs?: number
  maxSize?: number
  keyGenerator?: (req: ChatRequest) => string
}
```

### `ToolCache`

Tool result caching.

```typescript
class ToolCache {
  constructor(opts: ToolCacheOpts)
  
  execute<T>(tool: Tool, input: unknown): Promise<T>
  clear(): Promise<void>
}

interface ToolCacheOpts {
  ttlMs?: number
  maxSize?: number
  keyGenerator?: (tool: Tool, input: unknown) => string
}
```

## Configuration

### `FeatherConfig`

Configuration file format.

```typescript
interface FeatherConfig {
  policy: "cheapest" | "roundrobin" | "first"
  providers: Record<string, ProviderConfig>
}

interface ProviderConfig {
  apiKeyEnv: string
  baseUrl?: string
  models: ModelConfig[]
}

interface ModelConfig {
  name: string
  aliases?: string[]
  inputPer1K: number
  outputPer1K: number
}
```

### `buildRegistry(config: FeatherConfig): ProviderRegistry`

Builds a provider registry from configuration.

## Observability

### Events

#### `FeatherEvent`

```typescript
type FeatherEvent = 
  | { type: "call.start", provider: string, model: string, requestId: string }
  | { type: "call.success", provider: string, model: string, costUSD: number, requestId: string }
  | { type: "call.error", provider: string, model: string, error: Error, requestId: string }
  | { type: "call.retry", attempt: number, waitMs: number, error: unknown, requestId: string }
  | { type: "breaker.open", provider: string }
  | { type: "breaker.close", provider: string }
```

### OpenTelemetry Integration

#### `withTelemetry<T>(operation: string, fn: () => Promise<T>): Promise<T>`

Wraps operations with OpenTelemetry tracing.

## Error Types

### `LLMError`

```typescript
class LLMError extends Error {
  constructor(
    message: string,
    provider: string,
    status?: number,
    requestId?: string,
    retryable?: boolean,
    retryAfter?: number
  )
  
  provider: string
  status?: number
  requestId?: string
  retryable: boolean
  retryAfter?: number
}
```

### `AbortError`

```typescript
class AbortError extends Error {
  constructor(reason?: any)
  reason?: any
}
```

## Utility Functions

### `createAbortError(reason?: any): AbortError`

Creates an abort error with optional reason.

### `forwardAbortSignal(source: AbortSignal, target: AbortController): () => void`

Forwards abort signals between controllers. Returns cleanup function.

### `delay(ms: number, signal?: AbortSignal): Promise<void>`

Delay with abort signal support.

### `withRetry<T>(fn: () => Promise<T>, opts?: RetryOpts): Promise<T>`

Retry function with exponential backoff.

#### `RetryOpts`

```typescript
interface RetryOpts {
  maxAttempts?: number
  baseMs?: number
  maxMs?: number
  jitter?: "none" | "full"
  signal?: AbortSignal
  onRetry?: (info: RetryInfo) => void
}

interface RetryInfo {
  attempt: number
  waitMs: number
  error: unknown
}
```

## CLI

### `feather chat [options]`

Command-line interface for chat operations.

#### Options

- `-p, --provider <provider>` - Provider name (optional with config)
- `-m, --model <model>` - Model name or alias
- `-q, --query <query>` - User message
- `-c, --config <file>` - Config file path (default: feather.config.json)
- `-h, --help` - Show help

## Type Definitions

### `Message`

```typescript
interface Message {
  role: "system" | "user" | "assistant" | "tool"
  content: string | { tool_calls?: ToolCall[] }
  name?: string
  tool_call_id?: string
}
```

### `ToolCall`

```typescript
interface ToolCall {
  id: string
  type: "function"
  function: {
    name: string
    arguments: string
  }
}
```

### `PriceTable`

```typescript
interface PriceTable {
  inputPer1K: number
  outputPer1K: number
}
```

### `TokenEstimate`

```typescript
interface TokenEstimate {
  input: number
  output: number
}
```

### `Middleware`

```typescript
type Middleware = (ctx: MiddlewareContext, next: () => Promise<void>) => Promise<void>

interface MiddlewareContext {
  provider: string
  model: string
  request: ChatRequest
  response?: ChatResponse
  startTs: number
  endTs?: number
  error?: Error
}
```

## Examples

### Basic Usage

```typescript
import { Feather, openai } from "feather-agent";

const feather = new Feather({
  providers: {
    openai: openai({ apiKey: process.env.OPENAI_API_KEY! })
  }
});

const response = await feather.chat({
  provider: "openai",
  model: "gpt-4",
  messages: [{ role: "user", content: "Hello!" }]
});
```

### Agent Usage

```typescript
import { Agent, InMemoryMemoryManager, createJsonPlanner, createCalcTool } from "feather-agent";

const agent = new Agent({
  id: "calculator",
  planner: createJsonPlanner({
    callModel: async ({ messages }) => {
      const response = await feather.chat({
        provider: "openai",
        model: "gpt-4",
        messages
      });
      return response.content;
    },
    tools: [{ name: "calc", description: "Calculate arithmetic expressions" }]
  }),
  memory: new InMemoryMemoryManager(),
  tools: [createCalcTool()]
});

const result = await agent.run({
  sessionId: "user-123",
  input: { role: "user", content: "What is 2 + 2?" }
});
```

### Custom Provider

```typescript
import { ChatProvider } from "feather-agent";

function customProvider(config: { apiKey: string }): ChatProvider {
  return {
    id: "custom",
    async chat(req) {
      const response = await fetch("https://api.custom.com/chat", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${config.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(req)
      });
      
      const data = await response.json();
      return {
        content: data.response,
        costUSD: 0.001
      };
    }
  };
}
```

---

For more examples, see the [Examples Guide](examples.md) and check out the `examples/` directory in the repository.
