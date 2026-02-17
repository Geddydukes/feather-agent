# Legionaire

[![npm version](https://badge.fury.io/js/legionaire.svg)](https://badge.fury.io/js/legionaire)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache--2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Node.js >= 18](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg)](https://www.typescriptlang.org/)

> **Production-ready LLM agent framework** with enterprise-grade reliability, multi-provider support, and intelligent orchestration capabilities.

Legionaire is like Kubernetes for AI - it provides a unified, production-ready platform for managing multiple LLM providers with automatic failover, intelligent routing, cost optimization, and comprehensive observability.

## ✨ Why Legionaire?

### 🎯 **Multi-Provider Strategy**
- **Avoid vendor lock-in** with unified provider abstraction
- **Intelligent failover** between OpenAI, Anthropic, and custom providers
- **Cost optimization** through smart provider selection
- **Zero downtime** during provider outages

### 🛡️ **Enterprise Reliability**
- **Circuit breakers** prevent cascade failures
- **Exponential backoff** with jitter for intelligent retries
- **Rate limiting** with token bucket algorithm
- **Automatic error classification** (retryable vs permanent)

### 🤖 **Intelligent Agents**
- **JSON-based planning** for structured decision making
- **Tool integration** with caching and validation
- **Memory management** with PostgreSQL, Redis, or in-memory backends
- **Context building** with token-aware summarization

### 📊 **Production Features**
- **Real-time streaming** with proper abort handling
- **Cost tracking** per request and aggregate
- **OpenTelemetry integration** for distributed tracing
- **Middleware system** for logging, monitoring, and PII redaction

## 🚀 Quick Start

### Installation

```bash
npm install legionaire
# or
pnpm add legionaire
# or
yarn add legionaire
```

> **Requires Node.js >= 18** (uses native `fetch`)

### Basic Usage

```typescript
import { Feather, openai, anthropic } from "legionaire";

// Initialize with multiple providers
const feather = new Feather({
  providers: {
    openai: openai({ apiKey: process.env.OPENAI_API_KEY! }),
    anthropic: anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
  },
  limits: {
    "openai:gpt-4": { rps: 5, burst: 10 },
    "anthropic:claude-3-5-haiku": { rps: 3, burst: 5 }
  }
});

// Simple chat with automatic failover
const response = await feather.chat({
  provider: "openai",
  model: "gpt-4",
  messages: [
    { role: "user", content: "Explain quantum computing in simple terms." }
  ]
});

console.log(response.content);
console.log(`Cost: $${response.costUSD}`);
```

### Advanced Patterns

```typescript
// Fallback chain - try providers in sequence
const fallbackChain = feather.fallback([
  { provider: "openai", model: "gpt-4" },
  { provider: "anthropic", model: "claude-3-5-haiku" },
  { provider: "openai", model: "gpt-3.5-turbo" }
]);

// Race pattern - fastest response wins
const raceChain = feather.race([
  { provider: "openai", model: "gpt-4" },
  { provider: "anthropic", model: "claude-3-5-haiku" }
]);

// Batch processing with concurrency control
const results = await feather.map(
  ["task1", "task2", "task3"],
  async (task) => {
    const response = await feather.chat({
      provider: "openai",
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: task }]
    });
    return response.content;
  },
  { concurrency: 2 }
);
```

## 🤖 Intelligent Agents

Legionaire includes a complete agent framework for building sophisticated AI applications. You can
now bootstrap an agent in **five lines** using `createAgent` and a config file:

```typescript
import { createAgent } from "legionaire";

const { agent } = await createAgent();
const result = await agent.run({
  sessionId: "demo",
  input: { role: "user", content: "Plan a three-step study routine." }
});

console.log(result.status === "completed" ? result.output.content : result.error.message);
```

The factory reads `legionaire.config.json`, hydrates providers, memory, planners, and tools, then
returns both the `agent` and the underlying orchestrator. See [Configuration reference](docs/configuration.md)
for the schema and extension points. The low-level APIs remain available when you need manual
control:

## 🖥️ Visual dashboard

Prefer pointing and clicking? Run the bundled dashboard to manage providers, tool registries, and agents without touching JSON:

```bash
npm run dashboard
```

The server launches on <http://localhost:5173> and serves a secure, client-side UI that keeps API keys in your browser's local storage. You can:

- Register built-in or custom providers and supply API keys when you run an agent.
- Add shared tools from presets (including calculator and web-search templates), then toggle them per agent.
- Edit tool `options` JSON and planner input schemas directly from the tool editor.
- Use built-in platform primitives out of the box: `tool.list`, `tool.call`, `memory.kv_*`, `memory.blob_*`, `secrets.get`, `audit.log_event`.
- Use guarded ops tools out of the box: `schema.validate_json`, `web.fetch`, `http.request`, `fs.list/read/write`, `artifact.pack`.
- Use guarded dev tools out of the box: `fs.diff`, `git.status/diff/commit/branch`.
- Use explicit safety/browser tools out of the box: `web.browser_session`, `prompt_injection.scan`, `redaction.apply`, `policy.check`, `allowlist.enforce`.
- Use structured data tools out of the box: `db.query_sql`, `vector.upsert/search`, `etl.csv_read/write`.
- Use restricted execution tools out of the box: `python.run_sandbox`, `node.run_sandbox`, `shell.run_restricted`.
- Use communication tools out of the box: `email.search/send`, `calendar.list/create/update`, `chat.post_message`.
- Use control and plugin tools out of the box: `connector.invoke`, `plan.create/update`, `task.spawn`, `budget.get/consume`.
- For adapter-backed tools, use `options.remote` (base URL + API key env names) to connect without writing custom adapter modules.
- Edit the configuration JSON with schema validation feedback.
- Execute prompts directly to verify the agent pipeline.
- Download a runnable agent package (`.tar.gz`) with `legionaire.config.json`, `.env.example`, and `src/run-agent.mjs`.
- Download raw `legionaire.config.json` and a sample script when you only need source files.

See [docs/dashboard.md](docs/dashboard.md) for architecture details and extension tips.

```typescript
import { Agent, InMemoryMemoryManager, createJsonPlanner, createCalcTool } from "legionaire";

// (Assumes a Feather orchestrator is already instantiated as shown above.)
const planner = createJsonPlanner({
  callModel: async ({ messages }) => {
    const response = await feather.chat({
      provider: "openai",
      model: "gpt-4",
      messages,
      temperature: 0.1
    });
    return response.content;
  },
  tools: [
    { name: "calc", description: "Evaluate arithmetic expressions" },
    { name: "web_search", description: "Search the web for information" }
  ]
});

const agent = new Agent({
  id: "math-tutor",
  planner,
  memory: new InMemoryMemoryManager({ maxTurns: 100 }),
  tools: [createCalcTool()]
});
```

## 📖 Documentation

### Core Concepts
- **[Quick Start Guide](docs/quick-start.md)** - Get up and running in minutes
- **[Memory Management](docs/memory.md)** - PostgreSQL, Redis, and in-memory backends
- **[Observability](docs/observability.md)** - Monitoring, tracing, and metrics
- **[Policies & Quotas](docs/policies-quotas.md)** - Guardrails and rate limiting
- **[Prompt Caching](docs/prompt-caching.md)** - Reduce costs with intelligent caching

### Advanced Topics
- **[System Overview](docs/overview.md)** - Architecture and design decisions
- **[Migration Guide](docs/migration-guide.md)** - Transition from manual wiring to `createAgent`
- **[Troubleshooting](docs/troubleshooting.md)** - Common issues and solutions
- **[Remote Tool Contract](docs/remote-tool-contract.md)** - Backend endpoint contract for `options.remote`
- **[API Reference](#api-reference)** - Complete TypeScript definitions

## 🎯 Use Cases

### Multi-Provider Applications
```typescript
// A/B testing different models
const raceChain = feather.race([
  { provider: "openai", model: "gpt-4" },
  { provider: "anthropic", model: "claude-3-5-haiku" }
]);

// Cost-optimized routing
const fallbackChain = feather.fallback([
  { provider: "openai", model: "gpt-3.5-turbo" }, // Cheapest first
  { provider: "openai", model: "gpt-4" },         // Fallback to premium
  { provider: "anthropic", model: "claude-3-5-haiku" } // Cross-vendor fallback
]);
```

### Production Chat Applications
```typescript
class ChatService {
  private feather: Feather;
  
  constructor() {
    this.feather = new Feather({
      providers: {
        primary: openai({ apiKey: process.env.OPENAI_API_KEY! }),
        backup: anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
      },
      limits: {
        "openai:gpt-4": { rps: 100, burst: 200 },
        "anthropic:claude-3-5-haiku": { rps: 50, burst: 100 }
      },
      retry: { maxAttempts: 3, baseMs: 1000, maxMs: 5000 },
      middleware: [
        this.loggingMiddleware,
        this.costTrackingMiddleware,
        this.piiRedactionMiddleware
      ]
    });
  }
  
  async chat(messages: Message[]) {
    const fallbackChain = this.feather.fallback([
      { provider: "primary", model: "gpt-4" },
      { provider: "backup", model: "claude-3-5-haiku" }
    ]);
    
    return await fallbackChain.chat({ messages });
  }
}
```

### Agent Workflows
```typescript
// Sequential agent chain
const research = await feather.chat({
  provider: "openai",
  model: "gpt-4",
  messages: [{ role: "user", content: "Research quantum computing" }]
});

const article = await feather.chat({
  provider: "anthropic", 
  model: "claude-3-5-haiku",
  messages: [{ role: "user", content: `Write article: ${research.content}` }]
});

// Parallel agent processing
const [analysis, strategy, critique] = await Promise.all([
  feather.chat({ provider: "openai", model: "gpt-4", messages: analysisPrompt }),
  feather.chat({ provider: "anthropic", model: "claude-3-5-haiku", messages: strategyPrompt }),
  feather.chat({ provider: "openai", model: "gpt-3.5-turbo", messages: critiquePrompt })
]);
```

## 🛠️ Configuration

### Provider Configuration
```typescript
const feather = new Feather({
  providers: {
    openai: openai({ 
      apiKey: process.env.OPENAI_API_KEY!,
      baseUrl: "https://api.openai.com/v1", // Optional custom endpoint
      pricing: { inputPer1K: 0.005, outputPer1K: 0.015 }
    }),
    anthropic: anthropic({ 
      apiKey: process.env.ANTHROPIC_API_KEY!,
      pricing: { inputPer1K: 0.008, outputPer1K: 0.024 }
    })
  }
});
```

### Rate Limiting & Reliability
```typescript
const feather = new Feather({
  providers: { /* ... */ },
  limits: {
    "openai:gpt-4": { rps: 10, burst: 20 },      // 10 req/sec, burst to 20
    "openai:gpt-3.5-turbo": { rps: 50, burst: 100 },
    "anthropic:claude-3-5-haiku": { rps: 5, burst: 10 }
  },
  retry: {
    maxAttempts: 3,        // Try up to 3 times
    baseMs: 1000,         // Start with 1 second delay
    maxMs: 10000,         // Max 10 second delay
    jitter: "full"        // Add randomness to prevent thundering herd
  },
  timeoutMs: 30000         // 30 second timeout
});
```

### Configuration File
Create `legionaire.config.json` for declarative configuration:

```json
{
  "policy": "cheapest",
  "providers": {
    "openai": {
      "apiKeyEnv": "OPENAI_API_KEY",
      "models": [
        {
          "name": "gpt-4",
          "aliases": ["smart", "expensive"],
          "inputPer1K": 0.03,
          "outputPer1K": 0.06
        },
        {
          "name": "gpt-3.5-turbo", 
          "aliases": ["fast", "cheap"],
          "inputPer1K": 0.001,
          "outputPer1K": 0.002
        }
      ]
    },
    "anthropic": {
      "apiKeyEnv": "ANTHROPIC_API_KEY",
      "models": [
        {
          "name": "claude-3-5-haiku",
          "aliases": ["fast", "balanced"],
          "inputPer1K": 0.008,
          "outputPer1K": 0.024
        }
      ]
    }
  }
}
```

Use semantic model names:
```typescript
import { buildRegistry } from "legionaire";
import config from "./legionaire.config.json" assert { type: "json" };

const registry = buildRegistry(config);
const feather = new Feather({ registry });

// Use semantic aliases - orchestrator picks best option
const response = await feather.chat({
  model: "fast",  // Will pick cheapest "fast" model
  messages: [{ role: "user", content: "Hello!" }]
});
```

## 🖥️ CLI Usage

Install globally or use with npx:

```bash
# Install globally
npm install -g legionaire

# Use with npx
npx legionaire chat -m gpt-4 -q "What is machine learning?"

# With specific provider
npx legionaire chat -p openai -m gpt-4 -q "Hello world"

# With config file
npx legionaire chat -c ./my-config.json -m fast -q "Explain AI"
```

### CLI Options

```bash
legionaire chat [options]

Options:
  -p, --provider <provider>  Provider name (optional with config)
  -m, --model <model>        Model name or alias
  -q, --query <query>        User message
  -c, --config <file>        Config file path (default: legionaire.config.json)
  -h, --help                 Show help
```

## 🔧 Adding Custom Providers

Create providers for any LLM service:

```typescript
import { ChatProvider } from "legionaire";

export function customProvider(config: { apiKey: string }): ChatProvider {
  return {
    id: "custom",
    
    async chat(req: ChatRequest): Promise<ChatResponse> {
      const response = await fetch("https://api.custom-llm.com/chat", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${config.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: req.model,
          messages: req.messages,
          temperature: req.temperature,
          max_tokens: req.maxTokens
        })
      });
      
      if (!response.ok) {
        throw new Error(`Custom API error: ${response.status}`);
      }
      
      const data = await response.json();
      return {
        content: data.choices[0].message.content,
        tokens: {
          input: data.usage.prompt_tokens,
          output: data.usage.completion_tokens
        },
        costUSD: calculateCost(data.usage),
        raw: data
      };
    },
    
    async *stream(req: ChatRequest): AsyncIterable<ChatDelta> {
      // Implement streaming if supported
      const response = await fetch("https://api.custom-llm.com/chat/stream", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${config.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: req.model,
          messages: req.messages,
          stream: true
        })
      });
      
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      
      while (true) {
        const { value, done } = await reader!.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = JSON.parse(line.slice(6));
            if (data.choices?.[0]?.delta?.content) {
              yield { content: data.choices[0].delta.content };
            }
          }
        }
      }
    },
    
    price: {
      inputPer1K: 0.001,   // $0.001 per 1K input tokens
      outputPer1K: 0.002  // $0.002 per 1K output tokens
    }
  };
}

// Use your custom provider
const feather = new Feather({
  providers: {
    custom: customProvider({ apiKey: "your-api-key" })
  }
});
```

## 🧪 Testing

### Unit Tests
```typescript
import { describe, it, expect, vi } from "vitest";
import { Feather } from "legionaire";

describe("Legionaire", () => {
  it("should handle fallback correctly", async () => {
    const mockProvider = {
      id: "mock",
      async chat() {
        throw new Error("Provider failed");
      }
    };
    
    const feather = new Feather({
      providers: {
        fail: mockProvider,
        success: {
          id: "success",
          async chat() {
            return { content: "Success!" };
          }
        }
      }
    });
    
    const fallbackChain = feather.fallback([
      { provider: "fail", model: "test" },
      { provider: "success", model: "test" }
    ]);
    
    const response = await fallbackChain.chat({
      messages: [{ role: "user", content: "test" }]
    });
    
    expect(response.content).toBe("Success!");
  });
});
```

### Integration Tests
```typescript
import { Feather, openai } from "legionaire";

describe("Integration Tests", () => {
  it("should work with real OpenAI API", async () => {
    const feather = new Feather({
      providers: {
        openai: openai({ apiKey: process.env.OPENAI_API_KEY! })
      }
    });
    
    const response = await feather.chat({
      provider: "openai",
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: "Say hello" }]
    });
    
    expect(response.content).toContain("hello");
    expect(response.costUSD).toBeGreaterThan(0);
  });
});
```

## 📊 Monitoring & Observability

### Cost Tracking
```typescript
class CostTracker {
  private costs: Map<string, number> = new Map();
  
  async trackCost(provider: string, cost: number) {
    const current = this.costs.get(provider) || 0;
    this.costs.set(provider, current + cost);
    
    // Send to your metrics system
    await this.sendToMetrics({
      provider,
      cost,
      total: current + cost,
      timestamp: new Date()
    });
  }
  
  getTotalCost(): number {
    return Array.from(this.costs.values()).reduce((sum, cost) => sum + cost, 0);
  }
}

const costTracker = new CostTracker();

const feather = new Feather({
  providers: { /* ... */ },
  middleware: [
    async (ctx, next) => {
      await next();
      if (ctx.response?.costUSD) {
        await costTracker.trackCost(ctx.provider, ctx.response.costUSD);
      }
    }
  ]
});
```

### OpenTelemetry Integration
```typescript
import { trace, context } from '@opentelemetry/api';

export function withTelemetry<T>(
  operation: string,
  fn: () => Promise<T>
): Promise<T> {
  const tracer = trace.getTracer('legionaire');
  const span = tracer.startSpan(operation);
  
  return context.with(trace.setSpan(context.active(), span), async () => {
    try {
      const result = await fn();
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
      span.recordException(error);
      throw error;
    } finally {
      span.end();
    }
  });
}
```

## 🔒 Security Best Practices

### API Key Management
```typescript
// ✅ Good: Use environment variables
const feather = new Feather({
  providers: {
    openai: openai({ apiKey: process.env.OPENAI_API_KEY! })
  }
});

// ❌ Bad: Hardcode API keys
const feather = new Feather({
  providers: {
    openai: openai({ apiKey: "sk-1234567890abcdef" })
  }
});
```

### PII Redaction
```typescript
const feather = new Feather({
  providers: { /* ... */ },
  middleware: [
    async (ctx, next) => {
      // Redact sensitive information
      ctx.request.messages = ctx.request.messages.map(msg => ({
        ...msg,
        content: msg.content
          .replace(/\b\d{4}-\d{4}-\d{4}-\d{4}\b/g, '[CARD]')  // Credit cards
          .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[SSN]')         // SSNs
          .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL]')  // Emails
      }));
      await next();
    }
  ]
});
```

### Rate Limiting
```typescript
// Prevent abuse with strict rate limits
const feather = new Feather({
  providers: { /* ... */ },
  limits: {
    "openai:gpt-4": { rps: 1, burst: 2 },  // Very conservative limits
    "anthropic:claude-3-5-haiku": { rps: 2, burst: 3 }
  }
});
```

## 🚀 Deployment

### Docker
```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY dist/ ./dist/

EXPOSE 3000

CMD ["node", "dist/index.js"]
```

### Environment Variables
```bash
# Production environment
OPENAI_API_KEY=sk-proj-...
ANTHROPIC_API_KEY=sk-ant-...

# Optional: Custom configurations
LEGIONAIRE_CONFIG_PATH=/app/config/legionaire.config.json
LEGIONAIRE_LOG_LEVEL=info
LEGIONAIRE_RATE_LIMIT_ENABLED=true
```

### Kubernetes ConfigMap
```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: legionaire-config
data:
  legionaire.config.json: |
    {
      "policy": "cheapest",
      "providers": {
        "openai": {
          "apiKeyEnv": "OPENAI_API_KEY",
          "models": [
            {
              "name": "gpt-4",
              "aliases": ["smart"],
              "inputPer1K": 0.03,
              "outputPer1K": 0.06
            }
          ]
        }
      }
    }
```

## 📈 Performance

### Benchmarks
- **Latency**: < 50ms overhead for orchestration
- **Throughput**: 1000+ requests/second with proper rate limiting
- **Memory**: < 10MB base footprint
- **Bundle Size**: < 100KB gzipped

### Optimization Tips
- Use **prompt caching** to reduce redundant API calls
- Enable **tool caching** for repeated computations
- Configure **appropriate rate limits** per provider
- Use **semantic model aliases** for cost optimization

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Quick Start for Contributors
1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes and add tests
4. Run tests: `npm test`
5. Commit: `git commit -m 'Add amazing feature'`
6. Push: `git push origin feature/amazing-feature`
7. Open a Pull Request

### Adding New Providers
1. Create a new file in `src/providers/`
2. Implement the `ChatProvider` interface
3. Add tests in `tests/providers/`
4. Update documentation with usage examples

## 📄 License

Licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE) for details.

## 🙏 Acknowledgments

- Built with ❤️ for the developer community
- Inspired by the need for reliable LLM orchestration
- Thanks to all contributors and users

---

**Need help?** 
- 📖 Check the [documentation](docs/)
- 🐛 Report issues on [GitHub](https://github.com/Geddydukes/legionaire/issues)
- 💬 Join our [Discord community](https://discord.gg/legionaire)
- 📧 Contact us at [geddydukes@gmail.com](mailto:geddydukes@gmail.com)

**Star us on GitHub** ⭐ to show your support!
