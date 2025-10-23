# Quick Start Guide

This guide will get you up and running with Feather Orchestrator in under 5 minutes. We'll cover both basic orchestration and intelligent agents.

## Prerequisites

- **Node.js 18+** (uses native `fetch`)
- **API Keys** for at least one LLM provider (OpenAI, Anthropic, etc.)

## 1. Installation

```bash
npm install feather-agent
```

## 2. Basic Orchestration

Let's start with a simple multi-provider setup:

```typescript
import { Feather, openai, anthropic } from "feather-agent";

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

// Simple chat
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

### Fallback Pattern

When you want reliability over speed:

```typescript
// Try providers in sequence until one succeeds
const fallbackChain = feather.fallback([
  { provider: "openai", model: "gpt-4" },
  { provider: "anthropic", model: "claude-3-5-haiku" },
  { provider: "openai", model: "gpt-3.5-turbo" }
]);

const response = await fallbackChain.chat({
  messages: [{ role: "user", content: "Hello!" }]
});
// Will try gpt-4 first, then claude-3-5-haiku, then gpt-3.5-turbo
```

### Race Pattern

When you want speed over consistency:

```typescript
// Try all providers simultaneously, return the first successful response
const raceChain = feather.race([
  { provider: "openai", model: "gpt-4" },
  { provider: "anthropic", model: "claude-3-5-haiku" }
]);

const response = await raceChain.chat({
  messages: [{ role: "user", content: "Hello!" }]
});
// Returns whichever responds first
```

### Streaming

For real-time responses:

```typescript
for await (const delta of feather.stream.chat({
  provider: "openai",
  model: "gpt-4",
  messages: [{ role: "user", content: "Write a story." }]
})) {
  process.stdout.write(delta.content || "");
}
```

## 3. Intelligent Agents

Now let's build an intelligent agent that can use tools and maintain memory:

### Step 1: Choose Memory Backend

Start with the in-memory backend for simplicity:

```typescript
import { InMemoryMemoryManager } from "feather-agent";

const memory = new InMemoryMemoryManager({ 
  maxTurns: 100,  // Keep last 100 conversation turns
  maxTokens: 4000 // Token budget for context
});
```

### Step 2: Create Tools

Use built-in tools or create your own:

```typescript
import { createCalcTool, createWebSearchTool } from "feather-agent";

const tools = [
  createCalcTool(),           // Safe arithmetic calculator
  createWebSearchTool({       // Web search (requires API key)
    apiKey: process.env.SERP_API_KEY!
  })
];
```

### Step 3: Create a Planner

The planner decides what the agent should do next:

```typescript
import { createJsonPlanner } from "feather-agent";

const planner = createJsonPlanner({
  callModel: async ({ messages }) => {
    const response = await feather.chat({
      provider: "openai",
      model: "gpt-4",
      messages,
      temperature: 0.1  // Low temperature for consistent planning
    });
    return response.content;
  },
  tools: [
    { name: "calc", description: "Evaluate arithmetic expressions safely" },
    { name: "web_search", description: "Search the web for current information" }
  ],
  systemPrompt: "You are a helpful assistant. Use tools when needed to provide accurate information."
});
```

### Step 4: Create the Agent

```typescript
import { Agent } from "feather-agent";

const agent = new Agent({
  id: "helpful-assistant",
  planner,
  memory,
  tools
});
```

### Step 5: Run Conversations

```typescript
// Simple conversation
const result = await agent.run({
  sessionId: "user-123",
  input: { role: "user", content: "What is 15 * 23?" }
});

if (result.status === "completed") {
  console.log(result.output.content);
  // Output: "15 * 23 = 345"
}

// Multi-turn conversation with memory
await agent.run({
  sessionId: "user-123", 
  input: { role: "user", content: "What about 15 * 24?" }
});

await agent.run({
  sessionId: "user-123",
  input: { role: "user", content: "What's the difference between those two results?" }
});
// The agent remembers the previous calculations and can answer about the difference
```

## 4. Advanced Configuration

### Configuration File

Create `feather.config.json` for declarative setup:

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
import { buildRegistry } from "feather-agent";
import config from "./feather.config.json" assert { type: "json" };

const registry = buildRegistry(config);
const feather = new Feather({ registry });

// Use semantic aliases - orchestrator picks best option
const response = await feather.chat({
  model: "fast",  // Will pick cheapest "fast" model
  messages: [{ role: "user", content: "Hello!" }]
});
```

### Middleware

Add logging, monitoring, and data transformation:

```typescript
const feather = new Feather({
  providers: { /* ... */ },
  middleware: [
    // Logging middleware
    async (ctx, next) => {
      console.log(`Request to ${ctx.provider}:${ctx.model}`);
      const start = Date.now();
      await next();
      console.log(`Response in ${Date.now() - start}ms`);
    },
    
    // Cost tracking middleware
    async (ctx, next) => {
      await next();
      if (ctx.response?.costUSD) {
        console.log(`Cost: $${ctx.response.costUSD.toFixed(6)}`);
        // Send to your metrics system
        metrics.recordCost(ctx.provider, ctx.response.costUSD);
      }
    },
    
    // PII redaction middleware
    async (ctx, next) => {
      // Redact sensitive data before sending to providers
      ctx.request.messages = redactPII(ctx.request.messages);
      await next();
    }
  ]
});
```

## 5. Production Considerations

### Error Handling

```typescript
try {
  const response = await feather.chat({
    provider: "openai",
    model: "gpt-4",
    messages: [{ role: "user", content: "Hello!" }]
  });
  console.log(response.content);
} catch (error) {
  if (error.name === "LLMError") {
    console.error("LLM API error:", error.message);
    // Handle API errors (rate limits, invalid keys, etc.)
  } else if (error.name === "AbortError") {
    console.error("Request was cancelled");
    // Handle cancellation
  } else {
    console.error("Unexpected error:", error);
    // Handle other errors
  }
}
```

### Rate Limiting

```typescript
const feather = new Feather({
  providers: { /* ... */ },
  limits: {
    "openai:gpt-4": { rps: 10, burst: 20 },      // 10 req/sec, burst to 20
    "openai:gpt-3.5-turbo": { rps: 50, burst: 100 },
    "anthropic:claude-3-5-haiku": { rps: 5, burst: 10 }
  }
});
```

### Retry Configuration

```typescript
const feather = new Feather({
  providers: { /* ... */ },
  retry: {
    maxAttempts: 3,        // Try up to 3 times
    baseMs: 1000,         // Start with 1 second delay
    maxMs: 10000,         // Max 10 second delay
    jitter: "full"        // Add randomness to prevent thundering herd
  }
});
```

## 6. Next Steps

Now that you have the basics working, explore these advanced topics:

### Memory Management
- **[Memory Backends](memory.md)** - PostgreSQL, Redis, and advanced features
- **[Context Building](memory.md#context-building)** - Token-aware conversation context

### Caching & Performance
- **[Prompt Caching](prompt-caching.md)** - Reduce costs with intelligent caching
- **[Tool Caching](prompt-caching.md#tool-caching)** - Cache tool results for efficiency

### Production Features
- **[Policies & Quotas](policies-quotas.md)** - Guardrails and rate limiting
- **[Observability](observability.md)** - Monitoring, tracing, and metrics

### Advanced Patterns
- **[Agent Chaining](examples/agent-chaining.ts)** - Multi-agent workflows
- **[Batch Processing](examples/real-world-app.ts)** - Efficient bulk operations

## 7. Examples

Check out the `examples/` directory for complete working examples:

- **[Basic Chat](examples/chat.ts)** - Simple provider usage
- **[Real-World App](examples/real-world-app.ts)** - Production application patterns
- **[Agent Chaining](examples/agent-chaining.ts)** - Multi-agent workflows
- **[Observability](examples/observability.ts)** - Monitoring and metrics
- **[Tool Caching](examples/tool-cache.ts)** - Performance optimization

## 8. Troubleshooting

### Common Issues

**"Provider not found" error:**
```typescript
// Make sure you've registered the provider
const feather = new Feather({
  providers: {
    openai: openai({ apiKey: process.env.OPENAI_API_KEY! })
  }
});
```

**Rate limit errors:**
```typescript
// Increase rate limits or add retry logic
const feather = new Feather({
  providers: { /* ... */ },
  limits: {
    "openai:gpt-4": { rps: 1, burst: 2 }  // Very conservative
  },
  retry: { maxAttempts: 5, baseMs: 2000 }
});
```

**Memory issues with agents:**
```typescript
// Use a more efficient memory backend
import { PostgreSQLMemoryManager } from "feather-agent";

const memory = new PostgreSQLMemoryManager({
  connectionString: process.env.DATABASE_URL!,
  maxTokens: 2000  // Smaller token budget
});
```

### Getting Help

- 📖 Check the [documentation](docs/)
- 🐛 Report issues on [GitHub](https://github.com/Geddydukes/feather-agent/issues)
- 💬 Join our [Discord community](https://discord.gg/feather-agent)

---

**Ready for production?** Check out our [Deployment Guide](deployment.md) for Docker, Kubernetes, and cloud deployment strategies.