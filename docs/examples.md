# Examples Guide

This guide provides comprehensive examples of Feather Orchestrator usage patterns, from basic orchestration to advanced agent workflows.

## Table of Contents

- [Basic Orchestration](#basic-orchestration)
- [Multi-Provider Patterns](#multi-provider-patterns)
- [Intelligent Agents](#intelligent-agents)
- [Production Applications](#production-applications)
- [Advanced Patterns](#advanced-patterns)
- [Performance Optimization](#performance-optimization)
- [Error Handling](#error-handling)
- [Testing Examples](#testing-examples)

## Basic Orchestration

### Simple Chat

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
  messages: [
    { role: "user", content: "Explain quantum computing in simple terms." }
  ]
});

console.log(response.content);
console.log(`Cost: $${response.costUSD}`);
```

### Streaming Responses

```typescript
import { Feather, openai } from "feather-agent";

const feather = new Feather({
  providers: {
    openai: openai({ apiKey: process.env.OPENAI_API_KEY! })
  }
});

console.log("Streaming response:");
for await (const delta of feather.stream.chat({
  provider: "openai",
  model: "gpt-4",
  messages: [{ role: "user", content: "Write a haiku about coding." }]
})) {
  process.stdout.write(delta.content || "");
}
console.log("\n");
```

### Batch Processing

```typescript
import { Feather, openai } from "feather-agent";

const feather = new Feather({
  providers: {
    openai: openai({ apiKey: process.env.OPENAI_API_KEY! })
  }
});

const prompts = [
  "Explain machine learning",
  "What is React?",
  "How does HTTP work?",
  "Describe cloud computing"
];

const results = await feather.map(
  prompts,
  async (prompt) => {
    const response = await feather.chat({
      provider: "openai",
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: prompt }],
      maxTokens: 100
    });
    return { prompt, response: response.content };
  },
  { concurrency: 2 } // Process 2 at a time
);

console.log("Batch results:");
results.forEach(({ prompt, response }) => {
  console.log(`${prompt}: ${response.substring(0, 50)}...`);
});
```

## Multi-Provider Patterns

### Fallback Chain

```typescript
import { Feather, openai, anthropic } from "feather-agent";

const feather = new Feather({
  providers: {
    openai: openai({ apiKey: process.env.OPENAI_API_KEY! }),
    anthropic: anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
  }
});

// Try providers in sequence until one succeeds
const fallbackChain = feather.fallback([
  { provider: "openai", model: "gpt-4" },
  { provider: "anthropic", model: "claude-3-5-haiku" },
  { provider: "openai", model: "gpt-3.5-turbo" }
]);

const response = await fallbackChain.chat({
  messages: [
    { role: "system", content: "You are a helpful assistant." },
    { role: "user", content: "Explain the concept of recursion." }
  ]
});

console.log("Response:", response.content);
console.log("Provider used:", response.provider);
```

### Race Pattern

```typescript
import { Feather, openai, anthropic } from "feather-agent";

const feather = new Feather({
  providers: {
    openai: openai({ apiKey: process.env.OPENAI_API_KEY! }),
    anthropic: anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
  }
});

// Try all providers simultaneously, return the first successful response
const raceChain = feather.race([
  { provider: "openai", model: "gpt-4" },
  { provider: "anthropic", model: "claude-3-5-haiku" }
]);

const startTime = Date.now();
const response = await raceChain.chat({
  messages: [{ role: "user", content: "What's 2+2?" }]
});
const duration = Date.now() - startTime;

console.log("Fastest response:", response.content);
console.log("Response time:", duration, "ms");
console.log("Winner:", response.provider);
```

### A/B Testing

```typescript
import { Feather, openai, anthropic } from "feather-agent";

const feather = new Feather({
  providers: {
    openai: openai({ apiKey: process.env.OPENAI_API_KEY! }),
    anthropic: anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
  }
});

async function abTest(prompt: string) {
  const raceChain = feather.race([
    { provider: "openai", model: "gpt-4" },
    { provider: "anthropic", model: "claude-3-5-haiku" }
  ]);
  
  const startTime = Date.now();
  const response = await raceChain.chat({
    messages: [{ role: "user", content: prompt }]
  });
  const duration = Date.now() - startTime;
  
  console.log(`Winner: ${response.provider} (${duration}ms)`);
  console.log(`Response: ${response.content}`);
  
  return { response, duration };
}

// Test different prompts
await abTest("Explain machine learning");
await abTest("Write a creative story");
await abTest("Solve this math problem: 15 * 23");
```

## Intelligent Agents

### Basic Agent

```typescript
import { 
  Agent, 
  InMemoryMemoryManager, 
  createJsonPlanner, 
  createCalcTool 
} from "feather-agent";

const feather = new Feather({
  providers: {
    openai: openai({ apiKey: process.env.OPENAI_API_KEY! })
  }
});

const agent = new Agent({
  id: "math-tutor",
  planner: createJsonPlanner({
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
      { name: "calc", description: "Evaluate arithmetic expressions safely" }
    ],
    systemPrompt: "You are a helpful math tutor. Use the calculator tool when needed."
  }),
  memory: new InMemoryMemoryManager({ maxTurns: 50 }),
  tools: [createCalcTool()]
});

// Run conversations
const result = await agent.run({
  sessionId: "student-123",
  input: { role: "user", content: "What is (15 + 25) * 2?" }
});

if (result.status === "completed") {
  console.log(result.output?.content);
  // Output: "I'll calculate that for you. (15 + 25) * 2 = 40 * 2 = 80"
}
```

### Agent with Web Search

```typescript
import { 
  Agent, 
  InMemoryMemoryManager, 
  createJsonPlanner, 
  createWebSearchTool 
} from "feather-agent";

const agent = new Agent({
  id: "research-assistant",
  planner: createJsonPlanner({
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
      { name: "web_search", description: "Search the web for current information" }
    ],
    systemPrompt: "You are a research assistant. Use web search to find current information when needed."
  }),
  memory: new InMemoryMemoryManager({ maxTurns: 100 }),
  tools: [createWebSearchTool({ apiKey: process.env.SERP_API_KEY! })]
});

const result = await agent.run({
  sessionId: "research-456",
  input: { role: "user", content: "What are the latest developments in AI?" }
});

if (result.status === "completed") {
  console.log(result.output?.content);
}
```

### Multi-Agent Workflow

```typescript
import { 
  Agent, 
  InMemoryMemoryManager, 
  createJsonPlanner, 
  createCalcTool,
  createWebSearchTool 
} from "feather-agent";

// Research Agent
const researchAgent = new Agent({
  id: "researcher",
  planner: createJsonPlanner({
    callModel: async ({ messages }) => {
      const response = await feather.chat({
        provider: "openai",
        model: "gpt-4",
        messages,
        temperature: 0.1
      });
      return response.content;
    },
    tools: [{ name: "web_search", description: "Search for information" }]
  }),
  memory: new InMemoryMemoryManager(),
  tools: [createWebSearchTool({ apiKey: process.env.SERP_API_KEY! })]
});

// Writing Agent
const writingAgent = new Agent({
  id: "writer",
  planner: createJsonPlanner({
    callModel: async ({ messages }) => {
      const response = await feather.chat({
        provider: "anthropic",
        model: "claude-3-5-haiku",
        messages,
        temperature: 0.7
      });
      return response.content;
    },
    tools: []
  }),
  memory: new InMemoryMemoryManager(),
  tools: []
});

// Sequential workflow
async function createArticle(topic: string) {
  // Step 1: Research
  const research = await researchAgent.run({
    sessionId: "research-session",
    input: { role: "user", content: `Research: ${topic}` }
  });
  
  if (research.status !== "completed") {
    throw new Error("Research failed");
  }
  
  // Step 2: Write article based on research
  const article = await writingAgent.run({
    sessionId: "writing-session",
    input: { 
      role: "user", 
      content: `Write an article about ${topic} based on this research: ${research.output?.content}` 
    }
  });
  
  return article.output?.content;
}

const article = await createArticle("quantum computing");
console.log(article);
```

## Production Applications

### Chat Service

```typescript
import { Feather, openai, anthropic } from "feather-agent";

class ChatService {
  private feather: Feather;
  private costTracker: Map<string, number> = new Map();
  
  constructor() {
    this.feather = new Feather({
      providers: {
        primary: openai({ 
          apiKey: process.env.OPENAI_API_KEY!,
          pricing: { inputPer1K: 0.005, outputPer1K: 0.015 }
        }),
        backup: anthropic({ 
          apiKey: process.env.ANTHROPIC_API_KEY!,
          pricing: { inputPer1K: 0.008, outputPer1K: 0.024 }
        })
      },
      limits: {
        "openai:gpt-4": { rps: 100, burst: 200 },
        "anthropic:claude-3-5-haiku": { rps: 50, burst: 100 }
      },
      retry: { maxAttempts: 3, baseMs: 1000, maxMs: 5000 },
      timeoutMs: 30000,
      middleware: [
        this.loggingMiddleware,
        this.costTrackingMiddleware,
        this.piiRedactionMiddleware
      ]
    });
  }
  
  async chat(messages: Message[], userId: string): Promise<ChatResponse> {
    // Automatic failover with cost optimization
    const fallbackChain = this.feather.fallback([
      { provider: "primary", model: "gpt-4" },
      { provider: "backup", model: "claude-3-5-haiku" },
      { provider: "primary", model: "gpt-3.5-turbo" }
    ]);
    
    const response = await fallbackChain.chat({
      messages,
      temperature: 0.7,
      maxTokens: 1000
    });
    
    // Track costs per user
    this.trackUserCost(userId, response.costUSD || 0);
    
    return response;
  }
  
  private loggingMiddleware = async (ctx: any, next: () => Promise<void>) => {
    console.log(`[${new Date().toISOString()}] Request to ${ctx.provider}:${ctx.model}`);
    const start = Date.now();
    await next();
    console.log(`[${new Date().toISOString()}] Response in ${Date.now() - start}ms`);
  };
  
  private costTrackingMiddleware = async (ctx: any, next: () => Promise<void>) => {
    await next();
    if (ctx.response?.costUSD) {
      console.log(`Cost: $${ctx.response.costUSD.toFixed(6)}`);
      // Send to your metrics system
      await this.sendToMetrics({
        provider: ctx.provider,
        model: ctx.model,
        cost: ctx.response.costUSD,
        timestamp: new Date()
      });
    }
  };
  
  private piiRedactionMiddleware = async (ctx: any, next: () => Promise<void>) => {
    // Redact PII before sending to providers
    ctx.request.messages = this.redactPII(ctx.request.messages);
    await next();
  };
  
  private redactPII(messages: Message[]): Message[] {
    return messages.map(msg => ({
      ...msg,
      content: typeof msg.content === "string" 
        ? msg.content
            .replace(/\b\d{4}-\d{4}-\d{4}-\d{4}\b/g, '[CARD]')
            .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[SSN]')
            .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL]')
        : msg.content
    }));
  }
  
  private trackUserCost(userId: string, cost: number) {
    const current = this.costTracker.get(userId) || 0;
    this.costTracker.set(userId, current + cost);
  }
  
  getUserCost(userId: string): number {
    return this.costTracker.get(userId) || 0;
  }
  
  private async sendToMetrics(data: any) {
    // Implementation depends on your metrics system
    console.log("Sending to metrics:", data);
  }
}

// Usage
const chatService = new ChatService();

const response = await chatService.chat([
  { role: "user", content: "Hello! How are you?" }
], "user-123");

console.log(response.content);
console.log(`User cost: $${chatService.getUserCost("user-123")}`);
```

### Content Generation Pipeline

```typescript
import { Feather, openai, anthropic } from "feather-agent";

class ContentPipeline {
  private feather: Feather;
  
  constructor() {
    this.feather = new Feather({
      providers: {
        openai: openai({ apiKey: process.env.OPENAI_API_KEY! }),
        anthropic: anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
      },
      limits: {
        "openai:gpt-4": { rps: 10, burst: 20 },
        "anthropic:claude-3-5-haiku": { rps: 15, burst: 30 }
      }
    });
  }
  
  async generateContent(topic: string, contentType: string): Promise<string> {
    // Step 1: Generate outline
    const outline = await this.feather.chat({
      provider: "openai",
      model: "gpt-4",
      messages: [
        { role: "system", content: "You are a content strategist." },
        { role: "user", content: `Create an outline for a ${contentType} about ${topic}` }
      ],
      temperature: 0.3
    });
    
    // Step 2: Generate content based on outline
    const content = await this.feather.chat({
      provider: "anthropic",
      model: "claude-3-5-haiku",
      messages: [
        { role: "system", content: "You are a skilled writer." },
        { role: "user", content: `Write a ${contentType} about ${topic} using this outline:\n\n${outline.content}` }
      ],
      temperature: 0.7,
      maxTokens: 2000
    });
    
    // Step 3: Review and improve
    const review = await this.feather.chat({
      provider: "openai",
      model: "gpt-4",
      messages: [
        { role: "system", content: "You are an editor. Review and improve content." },
        { role: "user", content: `Review and improve this ${contentType}:\n\n${content.content}` }
      ],
      temperature: 0.2
    });
    
    return review.content;
  }
  
  async generateBatch(topics: string[], contentType: string): Promise<string[]> {
    const results = await this.feather.map(
      topics,
      async (topic) => {
        return await this.generateContent(topic, contentType);
      },
      { concurrency: 3 } // Process 3 topics at a time
    );
    
    return results;
  }
}

// Usage
const pipeline = new ContentPipeline();

const article = await pipeline.generateContent("artificial intelligence", "blog post");
console.log(article);

const articles = await pipeline.generateBatch([
  "machine learning",
  "deep learning", 
  "neural networks"
], "article");
console.log(`Generated ${articles.length} articles`);
```

## Advanced Patterns

### Circuit Breaker Pattern

```typescript
import { Feather, openai } from "feather-agent";

class ResilientService {
  private feather: Feather;
  private circuitBreaker: Map<string, boolean> = new Map();
  
  constructor() {
    this.feather = new Feather({
      providers: {
        openai: openai({ apiKey: process.env.OPENAI_API_KEY! }),
        backup: openai({ 
          apiKey: process.env.OPENAI_BACKUP_API_KEY!,
          baseUrl: "https://backup-api.openai.com/v1"
        })
      },
      limits: {
        "openai:gpt-4": { rps: 5, burst: 10 },
        "backup:gpt-4": { rps: 2, burst: 5 }
      },
      retry: { maxAttempts: 2, baseMs: 1000, maxMs: 3000 }
    });
  }
  
  async chatWithFallback(messages: Message[]): Promise<ChatResponse> {
    try {
      // Try primary provider first
      if (!this.circuitBreaker.get("openai")) {
        return await this.feather.chat({
          provider: "openai",
          model: "gpt-4",
          messages
        });
      }
    } catch (error) {
      console.log("Primary provider failed, trying backup");
      this.circuitBreaker.set("openai", true);
      
      // Try backup provider
      return await this.feather.chat({
        provider: "backup",
        model: "gpt-4",
        messages
      });
    }
    
    throw new Error("All providers failed");
  }
  
  resetCircuitBreaker(provider: string) {
    this.circuitBreaker.set(provider, false);
  }
}
```

### Cost-Aware Routing

```typescript
import { Feather, openai, anthropic } from "feather-agent";

class CostAwareService {
  private feather: Feather;
  private dailyBudget: number = 100; // $100 daily budget
  private spentToday: number = 0;
  
  constructor() {
    this.feather = new Feather({
      providers: {
        expensive: openai({ 
          apiKey: process.env.OPENAI_API_KEY!,
          pricing: { inputPer1K: 0.03, outputPer1K: 0.06 }
        }),
        cheap: openai({ 
          apiKey: process.env.OPENAI_API_KEY!,
          pricing: { inputPer1K: 0.001, outputPer1K: 0.002 }
        }),
        moderate: anthropic({ 
          apiKey: process.env.ANTHROPIC_API_KEY!,
          pricing: { inputPer1K: 0.008, outputPer1K: 0.024 }
        })
      }
    });
  }
  
  async chatWithBudgetAwareness(messages: Message[]): Promise<ChatResponse> {
    const remainingBudget = this.dailyBudget - this.spentToday;
    
    if (remainingBudget > 10) {
      // High budget - use expensive model
      const response = await this.feather.chat({
        provider: "expensive",
        model: "gpt-4",
        messages
      });
      this.spentToday += response.costUSD || 0;
      return response;
    } else if (remainingBudget > 2) {
      // Medium budget - use moderate model
      const response = await this.feather.chat({
        provider: "moderate",
        model: "claude-3-5-haiku",
        messages
      });
      this.spentToday += response.costUSD || 0;
      return response;
    } else {
      // Low budget - use cheap model
      const response = await this.feather.chat({
        provider: "cheap",
        model: "gpt-3.5-turbo",
        messages
      });
      this.spentToday += response.costUSD || 0;
      return response;
    }
  }
  
  getBudgetStatus(): { spent: number; remaining: number; percentage: number } {
    const remaining = this.dailyBudget - this.spentToday;
    const percentage = (this.spentToday / this.dailyBudget) * 100;
    
    return {
      spent: this.spentToday,
      remaining,
      percentage
    };
  }
}
```

## Performance Optimization

### Prompt Caching

```typescript
import { Feather, openai, PromptCache } from "feather-agent";

class OptimizedService {
  private feather: Feather;
  private promptCache: PromptCache;
  
  constructor() {
    this.promptCache = new PromptCache({
      ttlMs: 3600000, // 1 hour
      maxSize: 1000
    });
    
    this.feather = new Feather({
      providers: {
        openai: openai({ apiKey: process.env.OPENAI_API_KEY! })
      },
      middleware: [
        this.cachingMiddleware
      ]
    });
  }
  
  private cachingMiddleware = async (ctx: any, next: () => Promise<void>) => {
    // Check cache first
    const cacheKey = this.generateCacheKey(ctx.request);
    const cached = await this.promptCache.get(cacheKey);
    
    if (cached) {
      console.log("Cache hit!");
      ctx.response = cached.response;
      return;
    }
    
    // Cache miss - make request
    await next();
    
    // Cache the response
    if (ctx.response) {
      await this.promptCache.set(cacheKey, ctx.response);
    }
  };
  
  private generateCacheKey(request: ChatRequest): string {
    // Create a hash of the request for caching
    const content = JSON.stringify({
      model: request.model,
      messages: request.messages,
      temperature: request.temperature
    });
    return Buffer.from(content).toString('base64');
  }
}
```

### Tool Caching

```typescript
import { ToolCache, createCalcTool } from "feather-agent";

class CachedToolService {
  private toolCache: ToolCache;
  private calcTool: Tool;
  
  constructor() {
    this.toolCache = new ToolCache({
      ttlMs: 1800000, // 30 minutes
      maxSize: 500
    });
    
    this.calcTool = createCalcTool();
  }
  
  async calculate(expression: string): Promise<number> {
    // Use cached tool execution
    return await this.toolCache.execute(this.calcTool, expression);
  }
}
```

## Error Handling

### Comprehensive Error Handling

```typescript
import { Feather, openai, LLMError, AbortError } from "feather-agent";

class RobustService {
  private feather: Feather;
  
  constructor() {
    this.feather = new Feather({
      providers: {
        openai: openai({ apiKey: process.env.OPENAI_API_KEY! })
      },
      retry: { maxAttempts: 3, baseMs: 1000, maxMs: 5000 }
    });
  }
  
  async chatWithErrorHandling(messages: Message[]): Promise<ChatResponse | null> {
    try {
      const response = await this.feather.chat({
        provider: "openai",
        model: "gpt-4",
        messages
      });
      
      return response;
    } catch (error) {
      if (error instanceof LLMError) {
        console.error("LLM API Error:", {
          message: error.message,
          provider: error.provider,
          status: error.status,
          retryable: error.retryable,
          retryAfter: error.retryAfter
        });
        
        if (error.retryable && error.retryAfter) {
          console.log(`Retrying after ${error.retryAfter} seconds`);
          await this.delay(error.retryAfter * 1000);
          return this.chatWithErrorHandling(messages);
        }
      } else if (error instanceof AbortError) {
        console.error("Request was cancelled:", error.reason);
      } else {
        console.error("Unexpected error:", error);
      }
      
      return null;
    }
  }
  
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

### Graceful Degradation

```typescript
import { Feather, openai, anthropic } from "feather-agent";

class GracefulService {
  private feather: Feather;
  
  constructor() {
    this.feather = new Feather({
      providers: {
        openai: openai({ apiKey: process.env.OPENAI_API_KEY! }),
        anthropic: anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
      }
    });
  }
  
  async chatWithGracefulDegradation(messages: Message[]): Promise<ChatResponse> {
    const providers = [
      { provider: "openai", model: "gpt-4" },
      { provider: "anthropic", model: "claude-3-5-haiku" },
      { provider: "openai", model: "gpt-3.5-turbo" }
    ];
    
    for (const spec of providers) {
      try {
        const response = await this.feather.chat({
          provider: spec.provider,
          model: spec.model,
          messages
        });
        
        console.log(`Success with ${spec.provider}:${spec.model}`);
        return response;
      } catch (error) {
        console.log(`Failed with ${spec.provider}:${spec.model}:`, error.message);
        continue;
      }
    }
    
    // All providers failed - return a fallback response
    return {
      content: "I'm sorry, I'm experiencing technical difficulties. Please try again later.",
      costUSD: 0
    };
  }
}
```

## Testing Examples

### Unit Tests

```typescript
import { describe, it, expect, vi } from "vitest";
import { Feather } from "feather-agent";

describe("Feather Orchestrator", () => {
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
  
  it("should handle rate limiting", async () => {
    const feather = new Feather({
      providers: {
        mock: {
          id: "mock",
          async chat() {
            return { content: "Success!" };
          }
        }
      },
      limits: {
        "mock:test": { rps: 1, burst: 1 }
      }
    });
    
    // First request should succeed
    const response1 = await feather.chat({
      provider: "mock",
      model: "test",
      messages: [{ role: "user", content: "test" }]
    });
    
    expect(response1.content).toBe("Success!");
    
    // Second request should be rate limited
    await expect(feather.chat({
      provider: "mock",
      model: "test",
      messages: [{ role: "user", content: "test" }]
    })).rejects.toThrow();
  });
});
```

### Integration Tests

```typescript
import { describe, it, expect } from "vitest";
import { Feather, openai } from "feather-agent";

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
  
  it("should handle streaming", async () => {
    const feather = new Feather({
      providers: {
        openai: openai({ apiKey: process.env.OPENAI_API_KEY! })
      }
    });
    
    const chunks: string[] = [];
    
    for await (const delta of feather.stream.chat({
      provider: "openai",
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: "Count to 3" }]
    })) {
      if (delta.content) {
        chunks.push(delta.content);
      }
    }
    
    const fullResponse = chunks.join("");
    expect(fullResponse).toContain("1");
    expect(fullResponse).toContain("2");
    expect(fullResponse).toContain("3");
  });
});
```

### Agent Tests

```typescript
import { describe, it, expect } from "vitest";
import { Agent, InMemoryMemoryManager, createJsonPlanner, createCalcTool } from "feather-agent";

describe("Agent Tests", () => {
  it("should use tools correctly", async () => {
    const agent = new Agent({
      id: "test-agent",
      planner: createJsonPlanner({
        callModel: async ({ messages }) => {
          // Mock planner that always uses calc tool
          return JSON.stringify({
            actions: [{ tool: "calc", input: "2 + 2" }]
          });
        },
        tools: [{ name: "calc", description: "Calculate expressions" }]
      }),
      memory: new InMemoryMemoryManager(),
      tools: [createCalcTool()]
    });
    
    const result = await agent.run({
      sessionId: "test-session",
      input: { role: "user", content: "What is 2 + 2?" }
    });
    
    expect(result.status).toBe("completed");
    expect(result.output?.content).toContain("4");
  });
});
```

---

For more examples, check out the `examples/` directory in the repository and explore the [API Reference](api-reference.md) for detailed method signatures.
