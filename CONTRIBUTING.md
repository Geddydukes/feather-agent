# Contributing to Feather Agent

Thank you for your interest in contributing to Feather Agent! This guide will help you get started with contributing to the project.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Contributing Process](#contributing-process)
- [Code Standards](#code-standards)
- [Testing Guidelines](#testing-guidelines)
- [Documentation](#documentation)
- [Adding New Providers](#adding-new-providers)
- [Adding New Features](#adding-new-features)
- [Bug Reports](#bug-reports)
- [Feature Requests](#feature-requests)
- [Release Process](#release-process)

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code. Please report unacceptable behavior to [geddydukes@gmail.com](mailto:geddydukes@gmail.com).

## Getting Started

### Prerequisites

- **Node.js 18+** (uses native `fetch`)
- **npm** or **pnpm** or **yarn**
- **Git**
- **TypeScript** knowledge
- **API Keys** for testing (OpenAI, Anthropic, etc.)

### Fork and Clone

1. Fork the repository on GitHub
2. Clone your fork locally:
   ```bash
   git clone https://github.com/Geddydukes/feather-agent.git
   cd feather-agent
   ```
3. Add the upstream repository:
   ```bash
   git remote add upstream https://github.com/Geddydukes/feather-agent.git
   ```

## Development Setup

### Installation

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Run tests
npm test
```

### Environment Setup

Create a `.env` file for local development:

```bash
# API Keys for testing
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...

# Optional: Database for testing
DATABASE_URL=postgresql://user:password@localhost:5432/feather_test
REDIS_URL=redis://localhost:6379

# Optional: Monitoring
OTEL_EXPORTER_OTLP_ENDPOINT=https://api.honeycomb.io
OTEL_EXPORTER_OTLP_HEADERS=x-honeycomb-team=your-api-key
```

### Development Scripts

```bash
# Build TypeScript
npm run build

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Lint code
npm run lint

# Clean build artifacts
npm run clean

# Run examples
npm run examples:chat
npm run examples:real-world
npm run examples:agent-chaining
```

## Contributing Process

### 1. Create a Branch

```bash
# Update your fork
git fetch upstream
git checkout main
git merge upstream/main

# Create a feature branch
git checkout -b feature/your-feature-name
# or
git checkout -b fix/your-bug-fix
# or
git checkout -b docs/your-documentation-update
```

### 2. Make Changes

- Write your code following the [Code Standards](#code-standards)
- Add tests for new functionality
- Update documentation as needed
- Ensure all tests pass

### 3. Test Your Changes

```bash
# Run all tests
npm test

# Run specific test files
npm test -- tests/providers/
npm test -- tests/core/

# Run examples to verify functionality
npm run examples:chat
```

### 4. Commit Your Changes

```bash
# Stage your changes
git add .

# Commit with a descriptive message
git commit -m "feat: add support for Google Gemini provider

- Implement Gemini provider with streaming support
- Add comprehensive tests
- Update documentation with usage examples
- Fixes #123"
```

### 5. Push and Create PR

```bash
# Push your branch
git push origin feature/your-feature-name

# Create a Pull Request on GitHub
```

## Code Standards

### TypeScript Guidelines

- Use **strict TypeScript** configuration
- Prefer **interfaces** over types for object shapes
- Use **explicit return types** for public methods
- Avoid **`any`** type - use proper typing or `unknown`
- Use **const assertions** where appropriate

```typescript
// ✅ Good
interface ChatProvider {
  id: string;
  chat(req: ChatRequest, opts?: CallOpts): Promise<ChatResponse>;
  stream?(req: ChatRequest, opts?: CallOpts): AsyncIterable<ChatDelta>;
}

// ❌ Bad
type ChatProvider = {
  id: string;
  chat: (req: any, opts?: any) => Promise<any>;
};
```

### Code Style

- Use **2 spaces** for indentation
- Use **single quotes** for strings
- Use **semicolons**
- Use **trailing commas** in objects and arrays
- Use **camelCase** for variables and functions
- Use **PascalCase** for classes and interfaces

```typescript
// ✅ Good
const config: FeatherConfig = {
  providers: {
    openai: {
      apiKey: process.env.OPENAI_API_KEY!,
      pricing: { inputPer1K: 0.005, outputPer1K: 0.015 },
    },
  },
  limits: {
    'openai:gpt-4': { rps: 10, burst: 20 },
  },
};

// ❌ Bad
const config: FeatherConfig = {
  providers:{
    openai:{
      apiKey:process.env.OPENAI_API_KEY!,
      pricing:{inputPer1K:0.005,outputPer1K:0.015}
    }
  },
  limits:{
    "openai:gpt-4":{rps:10,burst:20}
  }
}
```

### Error Handling

- Use **custom error classes** for different error types
- Include **contextual information** in error messages
- Use **proper error propagation** with `throw`
- Handle **async errors** properly

```typescript
// ✅ Good
export class LLMError extends Error {
  constructor(
    message: string,
    public provider: string,
    public status?: number,
    public requestId?: string,
    public retryable: boolean = false,
    public retryAfter?: number
  ) {
    super(message);
    this.name = 'LLMError';
  }
}

// Usage
if (!response.ok) {
  throw new LLMError(
    `Provider ${provider} returned ${response.status}`,
    provider,
    response.status,
    requestId,
    isRetryableStatus(response.status),
    parseRetryAfter(response)
  );
}
```

### Async/Await Patterns

- Prefer **async/await** over Promises
- Use **Promise.all()** for parallel operations
- Use **Promise.allSettled()** when you need all results
- Handle **cancellation** with AbortSignal

```typescript
// ✅ Good
async function processBatch(items: string[]): Promise<string[]> {
  const results = await Promise.all(
    items.map(async (item) => {
      const response = await feather.chat({
        provider: 'openai',
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: item }],
      });
      return response.content;
    })
  );
  
  return results;
}

// With cancellation
async function processWithCancellation(
  items: string[],
  signal: AbortSignal
): Promise<string[]> {
  const results = await Promise.all(
    items.map(async (item) => {
      if (signal.aborted) {
        throw new AbortError('Operation cancelled');
      }
      
      const response = await feather.chat({
        provider: 'openai',
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: item }],
        signal,
      });
      
      return response.content;
    })
  );
  
  return results;
}
```

## Testing Guidelines

### Test Structure

- Use **Vitest** for testing
- Follow **AAA pattern** (Arrange, Act, Assert)
- Use **descriptive test names**
- Group related tests with `describe`
- Use **beforeEach/afterEach** for setup/cleanup

```typescript
// ✅ Good
describe('Feather Orchestrator', () => {
  let feather: Feather;
  
  beforeEach(() => {
    feather = new Feather({
      providers: {
        mock: createMockProvider(),
      },
    });
  });
  
  describe('fallback pattern', () => {
    it('should try providers in sequence until one succeeds', async () => {
      // Arrange
      const fallbackChain = feather.fallback([
        { provider: 'fail', model: 'test' },
        { provider: 'success', model: 'test' },
      ]);
      
      // Act
      const response = await fallbackChain.chat({
        messages: [{ role: 'user', content: 'test' }],
      });
      
      // Assert
      expect(response.content).toBe('Success!');
      expect(response.provider).toBe('success');
    });
  });
});
```

### Test Categories

#### Unit Tests
- Test individual functions and methods
- Mock external dependencies
- Test error conditions
- Test edge cases

```typescript
describe('CircuitBreaker', () => {
  it('should open after failure threshold', () => {
    const breaker = new Breaker(3, 1000, 2000, () => 'soft');
    
    // Simulate failures
    for (let i = 0; i < 3; i++) {
      breaker.fail(new Error('test'));
    }
    
    expect(breaker.canPass()).toBe(false);
    expect(breaker.state).toBe('open');
  });
});
```

#### Integration Tests
- Test component interactions
- Use real providers when possible
- Test end-to-end workflows
- Test configuration scenarios

```typescript
describe('Integration Tests', () => {
  it('should work with real OpenAI API', async () => {
    const feather = new Feather({
      providers: {
        openai: openai({ apiKey: process.env.OPENAI_API_KEY! }),
      },
    });
    
    const response = await feather.chat({
      provider: 'openai',
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: 'Say hello' }],
    });
    
    expect(response.content).toContain('hello');
    expect(response.costUSD).toBeGreaterThan(0);
  });
});
```

#### Performance Tests
- Test response times
- Test memory usage
- Test concurrent requests
- Test rate limiting

```typescript
describe('Performance Tests', () => {
  it('should handle concurrent requests efficiently', async () => {
    const feather = new Feather({
      providers: { mock: createMockProvider() },
    });
    
    const startTime = Date.now();
    const promises = Array.from({ length: 10 }, () =>
      feather.chat({
        provider: 'mock',
        model: 'test',
        messages: [{ role: 'user', content: 'test' }],
      })
    );
    
    const results = await Promise.all(promises);
    const duration = Date.now() - startTime;
    
    expect(results).toHaveLength(10);
    expect(duration).toBeLessThan(1000); // Should complete in under 1 second
  });
});
```

### Mock Providers

Create mock providers for testing:

```typescript
function createMockProvider(
  behavior: 'success' | 'fail' | 'slow' = 'success'
): ChatProvider {
  return {
    id: 'mock',
    async chat(req: ChatRequest): Promise<ChatResponse> {
      if (behavior === 'fail') {
        throw new Error('Mock provider failed');
      }
      
      if (behavior === 'slow') {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      return {
        content: 'Mock response',
        costUSD: 0.001,
        tokens: { input: 10, output: 5 },
      };
    },
    
    async *stream(req: ChatRequest): AsyncIterable<ChatDelta> {
      if (behavior === 'fail') {
        throw new Error('Mock provider failed');
      }
      
      const words = ['Mock', 'streaming', 'response'];
      for (const word of words) {
        yield { content: word + ' ' };
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    },
  };
}
```

## Documentation

### Code Documentation

- Use **JSDoc** for public APIs
- Include **parameter descriptions**
- Include **return value descriptions**
- Include **usage examples**
- Include **error conditions**

```typescript
/**
 * Creates a new Feather orchestrator instance.
 * 
 * @param opts - Configuration options for the orchestrator
 * @returns A new Feather instance
 * 
 * @example
 * ```typescript
 * const feather = new Feather({
 *   providers: {
 *     openai: openai({ apiKey: process.env.OPENAI_API_KEY! }),
 *   },
 *   limits: {
 *     'openai:gpt-4': { rps: 10, burst: 20 },
 *   },
 * });
 * ```
 */
export class Feather {
  constructor(opts: FeatherOpts) {
    // Implementation
  }
}
```

### README Updates

- Update **README.md** for new features
- Add **usage examples**
- Update **API documentation**
- Update **installation instructions**
- Update **configuration examples**

### Documentation Files

- Update **API reference** in `docs/api-reference.md`
- Add **examples** in `docs/examples.md`
- Update **deployment guide** in `docs/deployment.md`
- Add **troubleshooting** information

## Adding New Providers

### 1. Create Provider File

Create a new file in `src/providers/`:

```typescript
// src/providers/gemini.ts
import { ChatProvider, ChatRequest, ChatResponse, ChatDelta } from '../types.js';

export interface GeminiConfig {
  apiKey: string;
  baseUrl?: string;
  pricing?: PriceTable;
}

export function gemini(config: GeminiConfig): ChatProvider {
  return {
    id: 'gemini',
    
    async chat(req: ChatRequest): Promise<ChatResponse> {
      const response = await fetch(`${config.baseUrl || 'https://generativelanguage.googleapis.com/v1beta'}/models/${req.model}:generateContent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          contents: req.messages.map(msg => ({
            role: msg.role === 'assistant' ? 'model' : msg.role,
            parts: [{ text: msg.content }],
          })),
          generationConfig: {
            temperature: req.temperature,
            maxOutputTokens: req.maxTokens,
            topP: req.topP,
          },
        }),
      });
      
      if (!response.ok) {
        throw new Error(`Gemini API error: ${response.status}`);
      }
      
      const data = await response.json();
      const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      
      return {
        content,
        costUSD: calculateCost(data.usageMetadata, config.pricing),
        tokens: {
          input: data.usageMetadata?.promptTokenCount,
          output: data.usageMetadata?.candidatesTokenCount,
        },
        raw: data,
      };
    },
    
    async *stream(req: ChatRequest): AsyncIterable<ChatDelta> {
      // Implement streaming if supported
      const response = await fetch(`${config.baseUrl || 'https://generativelanguage.googleapis.com/v1beta'}/models/${req.model}:streamGenerateContent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          contents: req.messages.map(msg => ({
            role: msg.role === 'assistant' ? 'model' : msg.role,
            parts: [{ text: msg.content }],
          })),
        }),
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
            const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (content) {
              yield { content };
            }
          }
        }
      }
    },
    
    price: config.pricing || {
      inputPer1K: 0.001,
      outputPer1K: 0.002,
    },
  };
}

function calculateCost(usage: any, pricing?: PriceTable): number {
  if (!usage || !pricing) return 0;
  
  const inputTokens = usage.promptTokenCount || 0;
  const outputTokens = usage.candidatesTokenCount || 0;
  
  return (inputTokens / 1000) * pricing.inputPer1K + (outputTokens / 1000) * pricing.outputPer1K;
}
```

### 2. Add Tests

Create tests in `tests/providers/`:

```typescript
// tests/providers/gemini.test.ts
import { describe, it, expect, vi } from 'vitest';
import { gemini } from '../../src/providers/gemini.js';

describe('Gemini Provider', () => {
  it('should make chat requests', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        candidates: [{
          content: {
            parts: [{ text: 'Hello from Gemini!' }],
          },
        }],
        usageMetadata: {
          promptTokenCount: 10,
          candidatesTokenCount: 5,
        },
      }),
    });
    
    global.fetch = mockFetch;
    
    const provider = gemini({ apiKey: 'test-key' });
    const response = await provider.chat({
      model: 'gemini-pro',
      messages: [{ role: 'user', content: 'Hello' }],
    });
    
    expect(response.content).toBe('Hello from Gemini!');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('generateContent'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Authorization': 'Bearer test-key',
        }),
      })
    );
  });
});
```

### 3. Export Provider

Add to `src/providers/index.ts`:

```typescript
export * from './gemini.js';
```

### 4. Update Documentation

- Add to **README.md**
- Add to **API reference**
- Add **usage examples**
- Update **configuration guide**

## Adding New Features

### 1. Design the Feature

- **Define the API** - How will users interact with it?
- **Consider backwards compatibility** - Will this break existing code?
- **Plan the implementation** - What components need to change?
- **Write tests first** - Define the expected behavior

### 2. Implement the Feature

- Create **feature branch**
- Implement **core functionality**
- Add **comprehensive tests**
- Update **documentation**
- Add **examples**

### 3. Example: Adding Tool Caching

```typescript
// src/core/tool-cache.ts
export class ToolCache {
  private cache = new Map<string, { result: any; timestamp: number }>();
  
  constructor(private ttlMs: number = 300000) {} // 5 minutes default
  
  async execute<T>(tool: Tool, input: unknown): Promise<T> {
    const key = this.generateKey(tool.name, input);
    const cached = this.cache.get(key);
    
    if (cached && Date.now() - cached.timestamp < this.ttlMs) {
      return cached.result as T;
    }
    
    const result = await tool.execute(input);
    this.cache.set(key, { result, timestamp: Date.now() });
    
    return result;
  }
  
  private generateKey(toolName: string, input: unknown): string {
    return `${toolName}:${JSON.stringify(input)}`;
  }
  
  clear(): void {
    this.cache.clear();
  }
}
```

## Bug Reports

### Before Reporting

1. **Check existing issues** - Is this already reported?
2. **Update to latest version** - Is this fixed in a newer version?
3. **Search documentation** - Is this covered in the docs?
4. **Test with minimal example** - Can you reproduce it simply?

### Bug Report Template

```markdown
**Bug Description**
A clear description of what the bug is.

**To Reproduce**
Steps to reproduce the behavior:
1. Create Feather instance with...
2. Call method with...
3. See error

**Expected Behavior**
What you expected to happen.

**Actual Behavior**
What actually happened.

**Environment**
- OS: [e.g., macOS, Linux, Windows]
- Node.js version: [e.g., 18.17.0]
- Feather version: [e.g., 0.1.0]
- Provider: [e.g., OpenAI, Anthropic]

**Code Example**
```typescript
const feather = new Feather({
  providers: {
    openai: openai({ apiKey: 'sk-...' }),
  },
});

// This fails with...
const response = await feather.chat({
  provider: 'openai',
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'test' }],
});
```

**Additional Context**
Any other context about the problem.
```

## Feature Requests

### Before Requesting

1. **Check existing issues** - Is this already requested?
2. **Consider alternatives** - Can this be solved differently?
3. **Think about scope** - Is this within the project's goals?
4. **Provide use cases** - Why is this needed?

### Feature Request Template

```markdown
**Feature Description**
A clear description of the feature you'd like to see.

**Use Case**
Describe the problem this would solve or the workflow it would improve.

**Proposed Solution**
Describe your proposed solution or API design.

**Alternatives Considered**
Describe any alternative solutions you've considered.

**Additional Context**
Any other context, mockups, or examples.
```

## Release Process

### Version Numbering

We follow [Semantic Versioning](https://semver.org/):

- **MAJOR** - Breaking changes
- **MINOR** - New features (backwards compatible)
- **PATCH** - Bug fixes (backwards compatible)

### Release Checklist

1. **Update version** in `package.json`
2. **Update CHANGELOG.md** with new features/fixes
3. **Run full test suite** - `npm test`
4. **Build project** - `npm run build`
5. **Update documentation** if needed
6. **Create release PR** with version bump
7. **Tag release** - `git tag v0.1.1`
8. **Publish to npm** - `npm publish`

### Changelog Format

```markdown
## [0.1.1] - 2024-01-15

### Added
- Support for Google Gemini provider
- Tool caching functionality
- OpenTelemetry integration

### Changed
- Improved error messages for rate limits
- Updated documentation with new examples

### Fixed
- Memory leak in streaming responses
- Race condition in fallback chains
- TypeScript type definitions

### Security
- Updated dependencies to fix vulnerabilities
```

## Getting Help

- **Documentation** - Check the [docs/](docs/) directory
- **Issues** - Search [GitHub Issues](https://github.com/Geddydukes/feather-agent/issues)
- **Discussions** - Use [GitHub Discussions](https://github.com/Geddydukes/feather-agent/discussions)
- **Discord** - Join our [Discord community](https://discord.gg/feather-agent)
- **Email** - Contact [geddydukes@gmail.com](mailto:geddydukes@gmail.com)

## Recognition

Contributors will be recognized in:

- **README.md** - Contributor list
- **CHANGELOG.md** - Release notes
- **GitHub** - Contributor statistics
- **Documentation** - Code examples and guides

Thank you for contributing to Feather Orchestrator! 🚀
