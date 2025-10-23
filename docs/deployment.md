# Production Deployment Guide

This guide covers deploying Feather Orchestrator in production environments, including Docker, Kubernetes, cloud platforms, and monitoring setup.

## Table of Contents

- [Docker Deployment](#docker-deployment)
- [Kubernetes Deployment](#kubernetes-deployment)
- [Cloud Platform Deployment](#cloud-platform-deployment)
- [Environment Configuration](#environment-configuration)
- [Monitoring & Observability](#monitoring--observability)
- [Security Considerations](#security-considerations)
- [Performance Optimization](#performance-optimization)
- [Scaling Strategies](#scaling-strategies)
- [Disaster Recovery](#disaster-recovery)
- [Troubleshooting](#troubleshooting)

## Docker Deployment

### Basic Dockerfile

```dockerfile
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application code
COPY dist/ ./dist/
COPY feather.config.json ./

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S feather -u 1001
USER feather

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Start application
CMD ["node", "dist/index.js"]
```

### Multi-stage Build

```dockerfile
# Build stage
FROM node:18-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Production stage
FROM node:18-alpine AS production

WORKDIR /app

# Install only production dependencies
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Copy built application
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/feather.config.json ./

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S feather -u 1001
USER feather

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

CMD ["node", "dist/index.js"]
```

### Docker Compose

```yaml
version: '3.8'

services:
  feather-app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - DATABASE_URL=${DATABASE_URL}
      - REDIS_URL=${REDIS_URL}
    depends_on:
      - postgres
      - redis
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://localhost:3000/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"]
      interval: 30s
      timeout: 10s
      retries: 3

  postgres:
    image: postgres:15-alpine
    environment:
      - POSTGRES_DB=feather
      - POSTGRES_USER=feather
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U feather"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes
    volumes:
      - redis_data:/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 5

volumes:
  postgres_data:
  redis_data:
```

## Kubernetes Deployment

### Namespace

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: feather-agent
```

### ConfigMap

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: feather-config
  namespace: feather-agent
data:
  feather.config.json: |
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

### Secret

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: feather-secrets
  namespace: feather-agent
type: Opaque
data:
  OPENAI_API_KEY: <base64-encoded-key>
  ANTHROPIC_API_KEY: <base64-encoded-key>
  DATABASE_URL: <base64-encoded-url>
  REDIS_URL: <base64-encoded-url>
```

### Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: feather-agent
  namespace: feather-agent
spec:
  replicas: 3
  selector:
    matchLabels:
      app: feather-agent
  template:
    metadata:
      labels:
        app: feather-agent
    spec:
      containers:
      - name: feather-app
        image: feather-agent:latest
        ports:
        - containerPort: 3000
        env:
        - name: NODE_ENV
          value: "production"
        - name: OPENAI_API_KEY
          valueFrom:
            secretKeyRef:
              name: feather-secrets
              key: OPENAI_API_KEY
        - name: ANTHROPIC_API_KEY
          valueFrom:
            secretKeyRef:
              name: feather-secrets
              key: ANTHROPIC_API_KEY
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: feather-secrets
              key: DATABASE_URL
        - name: REDIS_URL
          valueFrom:
            secretKeyRef:
              name: feather-secrets
              key: REDIS_URL
        volumeMounts:
        - name: config
          mountPath: /app/feather.config.json
          subPath: feather.config.json
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /ready
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
      volumes:
      - name: config
        configMap:
          name: feather-config
```

### Service

```yaml
apiVersion: v1
kind: Service
metadata:
  name: feather-agent-service
  namespace: feather-agent
spec:
  selector:
    app: feather-agent
  ports:
  - port: 80
    targetPort: 3000
  type: ClusterIP
```

### Horizontal Pod Autoscaler

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: feather-agent-hpa
  namespace: feather-agent
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: feather-agent
  minReplicas: 3
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
```

### Ingress

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: feather-agent-ingress
  namespace: feather-agent
  annotations:
    kubernetes.io/ingress.class: nginx
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/rate-limit: "100"
    nginx.ingress.kubernetes.io/rate-limit-window: "1m"
spec:
  tls:
  - hosts:
    - api.feather-agent.com
    secretName: feather-agent-tls
  rules:
  - host: api.feather-agent.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: feather-agent-service
            port:
              number: 80
```

## Cloud Platform Deployment

### AWS ECS

#### Task Definition

```json
{
  "family": "feather-agent",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "512",
  "memory": "1024",
  "executionRoleArn": "arn:aws:iam::account:role/ecsTaskExecutionRole",
  "taskRoleArn": "arn:aws:iam::account:role/ecsTaskRole",
  "containerDefinitions": [
    {
      "name": "feather-app",
      "image": "your-account.dkr.ecr.region.amazonaws.com/feather-agent:latest",
      "portMappings": [
        {
          "containerPort": 3000,
          "protocol": "tcp"
        }
      ],
      "environment": [
        {
          "name": "NODE_ENV",
          "value": "production"
        }
      ],
      "secrets": [
        {
          "name": "OPENAI_API_KEY",
          "valueFrom": "arn:aws:secretsmanager:region:account:secret:feather/openai-api-key"
        },
        {
          "name": "ANTHROPIC_API_KEY",
          "valueFrom": "arn:aws:secretsmanager:region:account:secret:feather/anthropic-api-key"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/feather-agent",
          "awslogs-region": "us-west-2",
          "awslogs-stream-prefix": "ecs"
        }
      },
      "healthCheck": {
        "command": ["CMD-SHELL", "node -e \"require('http').get('http://localhost:3000/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })\""],
        "interval": 30,
        "timeout": 5,
        "retries": 3,
        "startPeriod": 60
      }
    }
  ]
}
```

#### Service Definition

```json
{
  "serviceName": "feather-agent-service",
  "cluster": "feather-cluster",
  "taskDefinition": "feather-agent",
  "desiredCount": 3,
  "launchType": "FARGATE",
  "networkConfiguration": {
    "awsvpcConfiguration": {
      "subnets": ["subnet-12345", "subnet-67890"],
      "securityGroups": ["sg-12345"],
      "assignPublicIp": "ENABLED"
    }
  },
  "loadBalancers": [
    {
      "targetGroupArn": "arn:aws:elasticloadbalancing:region:account:targetgroup/feather-tg/1234567890123456",
      "containerName": "feather-app",
      "containerPort": 3000
    }
  ],
  "serviceRegistries": [
    {
      "registryArn": "arn:aws:servicediscovery:region:account:service/srv-12345"
    }
  ]
}
```

### Google Cloud Run

#### Cloud Run Service

```yaml
apiVersion: serving.knative.dev/v1
kind: Service
metadata:
  name: feather-agent
  annotations:
    run.googleapis.com/ingress: all
    run.googleapis.com/execution-environment: gen2
spec:
  template:
    metadata:
      annotations:
        autoscaling.knative.dev/maxScale: "10"
        autoscaling.knative.dev/minScale: "1"
        run.googleapis.com/cpu-throttling: "true"
        run.googleapis.com/memory: "1Gi"
        run.googleapis.com/cpu: "1"
    spec:
      containerConcurrency: 100
      timeoutSeconds: 300
      containers:
      - image: gcr.io/project-id/feather-agent:latest
        ports:
        - containerPort: 3000
        env:
        - name: NODE_ENV
          value: "production"
        - name: OPENAI_API_KEY
          valueFrom:
            secretKeyRef:
              name: feather-secrets
              key: OPENAI_API_KEY
        - name: ANTHROPIC_API_KEY
          valueFrom:
            secretKeyRef:
              name: feather-secrets
              key: ANTHROPIC_API_KEY
        resources:
          limits:
            cpu: "1"
            memory: "1Gi"
          requests:
            cpu: "0.5"
            memory: "512Mi"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /ready
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
```

### Azure Container Instances

#### Container Group

```yaml
apiVersion: 2021-09-01
location: eastus
name: feather-agent
properties:
  containers:
  - name: feather-app
    properties:
      image: your-registry.azurecr.io/feather-agent:latest
      resources:
        requests:
          cpu: 1
          memoryInGb: 1
      ports:
      - port: 3000
        protocol: TCP
      environmentVariables:
      - name: NODE_ENV
        value: production
      - name: OPENAI_API_KEY
        secureValue: <secret-value>
      - name: ANTHROPIC_API_KEY
        secureValue: <secret-value>
  osType: Linux
  restartPolicy: Always
  ipAddress:
    type: Public
    ports:
    - protocol: TCP
      port: 3000
    dnsNameLabel: feather-agent
tags: {}
type: Microsoft.ContainerInstance/containerGroups
```

## Environment Configuration

### Production Environment Variables

```bash
# Application
NODE_ENV=production
PORT=3000
LOG_LEVEL=info

# API Keys
OPENAI_API_KEY=sk-proj-...
ANTHROPIC_API_KEY=sk-ant-...

# Database
DATABASE_URL=postgresql://user:password@host:5432/feather
REDIS_URL=redis://host:6379

# Monitoring
OTEL_EXPORTER_OTLP_ENDPOINT=https://api.honeycomb.io
OTEL_EXPORTER_OTLP_HEADERS=x-honeycomb-team=your-api-key
OTEL_SERVICE_NAME=feather-agent

# Security
JWT_SECRET=your-jwt-secret
ENCRYPTION_KEY=your-encryption-key

# Rate Limiting
RATE_LIMIT_ENABLED=true
RATE_LIMIT_RPS=100
RATE_LIMIT_BURST=200

# Caching
CACHE_TTL_MS=3600000
CACHE_MAX_SIZE=1000

# Circuit Breaker
CIRCUIT_BREAKER_ENABLED=true
CIRCUIT_BREAKER_FAILURE_THRESHOLD=5
CIRCUIT_BREAKER_RESET_TIMEOUT_MS=30000
```

### Configuration Management

#### Using External Config Service

```typescript
import { Feather } from "feather-agent";

class ConfigManager {
  private config: any;
  
  async loadConfig() {
    // Load from external config service (AWS Parameter Store, etc.)
    this.config = await this.loadFromParameterStore();
  }
  
  getFeatherConfig() {
    return {
      providers: this.config.providers,
      limits: this.config.limits,
      retry: this.config.retry,
      timeoutMs: this.config.timeoutMs
    };
  }
  
  private async loadFromParameterStore() {
    // Implementation depends on your config service
    return {
      providers: {
        openai: {
          apiKey: process.env.OPENAI_API_KEY!,
          pricing: { inputPer1K: 0.005, outputPer1K: 0.015 }
        }
      },
      limits: {
        "openai:gpt-4": { rps: 10, burst: 20 }
      },
      retry: { maxAttempts: 3, baseMs: 1000, maxMs: 5000 },
      timeoutMs: 30000
    };
  }
}

const configManager = new ConfigManager();
await configManager.loadConfig();

const feather = new Feather(configManager.getFeatherConfig());
```

## Monitoring & Observability

### Health Checks

```typescript
import express from 'express';
import { Feather } from 'feather-agent';

const app = express();

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    // Check if Feather is responsive
    const testResponse = await feather.chat({
      provider: "openai",
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: "health check" }],
      maxTokens: 1
    });
    
    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Readiness check
app.get('/ready', async (req, res) => {
  try {
    // Check dependencies
    await Promise.all([
      checkDatabase(),
      checkRedis(),
      checkProviders()
    ]);
    
    res.status(200).json({
      status: 'ready',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(503).json({
      status: 'not ready',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

async function checkDatabase() {
  // Check database connectivity
}

async function checkRedis() {
  // Check Redis connectivity
}

async function checkProviders() {
  // Check provider availability
}
```

### Metrics Collection

```typescript
import { Feather } from 'feather-agent';
import { Counter, Histogram, Gauge } from 'prom-client';

// Prometheus metrics
const requestCounter = new Counter({
  name: 'feather_requests_total',
  help: 'Total number of requests',
  labelNames: ['provider', 'model', 'status']
});

const requestDuration = new Histogram({
  name: 'feather_request_duration_seconds',
  help: 'Request duration in seconds',
  labelNames: ['provider', 'model']
});

const costGauge = new Gauge({
  name: 'feather_cost_usd_total',
  help: 'Total cost in USD',
  labelNames: ['provider', 'model']
});

const feather = new Feather({
  providers: { /* ... */ },
  middleware: [
    async (ctx, next) => {
      const start = Date.now();
      
      try {
        await next();
        
        // Record success metrics
        requestCounter.inc({
          provider: ctx.provider,
          model: ctx.model,
          status: 'success'
        });
        
        if (ctx.response?.costUSD) {
          costGauge.set({
            provider: ctx.provider,
            model: ctx.model
          }, ctx.response.costUSD);
        }
      } catch (error) {
        // Record error metrics
        requestCounter.inc({
          provider: ctx.provider,
          model: ctx.model,
          status: 'error'
        });
        throw error;
      } finally {
        // Record duration
        const duration = (Date.now() - start) / 1000;
        requestDuration.observe({
          provider: ctx.provider,
          model: ctx.model
        }, duration);
      }
    }
  ]
});
```

### OpenTelemetry Integration

```typescript
import { trace, context } from '@opentelemetry/api';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';

// Initialize OpenTelemetry
const sdk = new NodeSDK({
  serviceName: 'feather-agent',
  instrumentations: [getNodeAutoInstrumentations()],
});

sdk.start();

// Custom tracing
export function withTelemetry<T>(
  operation: string,
  fn: () => Promise<T>
): Promise<T> {
  const tracer = trace.getTracer('feather');
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

// Usage in Feather
const feather = new Feather({
  providers: { /* ... */ },
  middleware: [
    async (ctx, next) => {
      return withTelemetry(`feather.${ctx.provider}.${ctx.model}`, async () => {
        await next();
      });
    }
  ]
});
```

### Logging

```typescript
import winston from 'winston';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'feather-agent' },
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

const feather = new Feather({
  providers: { /* ... */ },
  middleware: [
    async (ctx, next) => {
      const start = Date.now();
      
      logger.info('Request started', {
        provider: ctx.provider,
        model: ctx.model,
        requestId: ctx.requestId
      });
      
      try {
        await next();
        
        logger.info('Request completed', {
          provider: ctx.provider,
          model: ctx.model,
          duration: Date.now() - start,
          cost: ctx.response?.costUSD
        });
      } catch (error) {
        logger.error('Request failed', {
          provider: ctx.provider,
          model: ctx.model,
          error: error.message,
          duration: Date.now() - start
        });
        throw error;
      }
    }
  ]
});
```

## Security Considerations

### API Key Management

```typescript
import { Feather } from 'feather-agent';
import { KMS } from 'aws-sdk';

class SecureConfigManager {
  private kms: KMS;
  
  constructor() {
    this.kms = new KMS({ region: process.env.AWS_REGION });
  }
  
  async decryptApiKey(encryptedKey: string): Promise<string> {
    const result = await this.kms.decrypt({
      CiphertextBlob: Buffer.from(encryptedKey, 'base64')
    }).promise();
    
    return result.Plaintext?.toString() || '';
  }
  
  async getFeatherConfig() {
    const openaiKey = await this.decryptApiKey(process.env.ENCRYPTED_OPENAI_KEY!);
    const anthropicKey = await this.decryptApiKey(process.env.ENCRYPTED_ANTHROPIC_KEY!);
    
    return {
      providers: {
        openai: { apiKey: openaiKey },
        anthropic: { apiKey: anthropicKey }
      }
    };
  }
}
```

### PII Redaction

```typescript
import { Feather } from 'feather-agent';

const feather = new Feather({
  providers: { /* ... */ },
  middleware: [
    async (ctx, next) => {
      // Redact PII before sending to providers
      ctx.request.messages = redactPII(ctx.request.messages);
      await next();
    }
  ]
});

function redactPII(messages: Message[]): Message[] {
  return messages.map(msg => ({
    ...msg,
    content: typeof msg.content === "string" 
      ? msg.content
          .replace(/\b\d{4}-\d{4}-\d{4}-\d{4}\b/g, '[CARD]')
          .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[SSN]')
          .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL]')
          .replace(/\b\d{3}-\d{3}-\d{4}\b/g, '[PHONE]')
      : msg.content
  }));
}
```

### Rate Limiting

```typescript
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api', limiter);
```

### Input Validation

```typescript
import { z } from 'zod';

const chatRequestSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(['system', 'user', 'assistant', 'tool']),
    content: z.string().max(10000),
    name: z.string().optional(),
    tool_call_id: z.string().optional()
  })).min(1).max(50),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().min(1).max(4000).optional(),
  topP: z.number().min(0).max(1).optional()
});

app.post('/api/chat', async (req, res) => {
  try {
    const validatedData = chatRequestSchema.parse(req.body);
    const response = await feather.chat(validatedData);
    res.json(response);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid request data', details: error.errors });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});
```

## Performance Optimization

### Connection Pooling

```typescript
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20, // Maximum number of connections
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

const feather = new Feather({
  providers: { /* ... */ },
  middleware: [
    async (ctx, next) => {
      // Use connection pool for database operations
      ctx.db = pool;
      await next();
    }
  ]
});
```

### Caching Strategy

```typescript
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL, {
  retryDelayOnFailover: 100,
  enableReadyCheck: false,
  maxRetriesPerRequest: null,
});

const feather = new Feather({
  providers: { /* ... */ },
  middleware: [
    async (ctx, next) => {
      const cacheKey = generateCacheKey(ctx.request);
      
      // Try cache first
      const cached = await redis.get(cacheKey);
      if (cached) {
        ctx.response = JSON.parse(cached);
        return;
      }
      
      await next();
      
      // Cache successful responses
      if (ctx.response) {
        await redis.setex(cacheKey, 3600, JSON.stringify(ctx.response));
      }
    }
  ]
});
```

### Memory Optimization

```typescript
import { Feather } from 'feather-agent';

// Configure memory limits
const feather = new Feather({
  providers: { /* ... */ },
  limits: {
    "openai:gpt-4": { rps: 5, burst: 10 }, // Conservative limits
    "anthropic:claude-3-5-haiku": { rps: 3, burst: 5 }
  },
  retry: {
    maxAttempts: 2, // Reduce retry attempts
    baseMs: 1000,
    maxMs: 3000
  },
  timeoutMs: 15000 // Shorter timeout
});

// Monitor memory usage
setInterval(() => {
  const memUsage = process.memoryUsage();
  console.log('Memory usage:', {
    rss: Math.round(memUsage.rss / 1024 / 1024) + ' MB',
    heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024) + ' MB',
    heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024) + ' MB'
  });
}, 30000);
```

## Scaling Strategies

### Horizontal Scaling

```typescript
import cluster from 'cluster';
import os from 'os';

if (cluster.isMaster) {
  const numCPUs = os.cpus().length;
  
  console.log(`Master ${process.pid} is running`);
  
  // Fork workers
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }
  
  cluster.on('exit', (worker, code, signal) => {
    console.log(`Worker ${worker.process.pid} died`);
    cluster.fork(); // Restart worker
  });
} else {
  // Worker process
  const feather = new Feather({
    providers: { /* ... */ }
  });
  
  console.log(`Worker ${process.pid} started`);
}
```

### Load Balancing

```typescript
import { Feather } from 'feather-agent';

class LoadBalancedFeather {
  private instances: Feather[];
  private currentIndex: number = 0;
  
  constructor(instances: Feather[]) {
    this.instances = instances;
  }
  
  async chat(args: ChatArgs): Promise<ChatResponse> {
    // Round-robin load balancing
    const instance = this.instances[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % this.instances.length;
    
    return await instance.chat(args);
  }
}

// Create multiple Feather instances
const instances = Array.from({ length: 3 }, () => 
  new Feather({
    providers: { /* ... */ }
  })
);

const loadBalancedFeather = new LoadBalancedFeather(instances);
```

## Disaster Recovery

### Backup Strategy

```typescript
import { Feather } from 'feather-agent';

class BackupManager {
  private feather: Feather;
  private backupProviders: Feather[];
  
  constructor(primary: Feather, backups: Feather[]) {
    this.feather = primary;
    this.backupProviders = backups;
  }
  
  async chatWithBackup(args: ChatArgs): Promise<ChatResponse> {
    try {
      return await this.feather.chat(args);
    } catch (error) {
      console.log('Primary failed, trying backups');
      
      for (const backup of this.backupProviders) {
        try {
          return await backup.chat(args);
        } catch (backupError) {
          console.log('Backup failed:', backupError.message);
          continue;
        }
      }
      
      throw new Error('All providers failed');
    }
  }
}
```

### Circuit Breaker

```typescript
import { Feather } from 'feather-agent';

class CircuitBreakerFeather {
  private feather: Feather;
  private failureCount: number = 0;
  private lastFailureTime: number = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  
  constructor(feather: Feather) {
    this.feather = feather;
  }
  
  async chat(args: ChatArgs): Promise<ChatResponse> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime > 30000) {
        this.state = 'half-open';
      } else {
        throw new Error('Circuit breaker is open');
      }
    }
    
    try {
      const response = await this.feather.chat(args);
      this.onSuccess();
      return response;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }
  
  private onSuccess() {
    this.failureCount = 0;
    this.state = 'closed';
  }
  
  private onFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    
    if (this.failureCount >= 5) {
      this.state = 'open';
    }
  }
}
```

## Troubleshooting

### Common Issues

#### High Memory Usage

```typescript
// Monitor and limit memory usage
const feather = new Feather({
  providers: { /* ... */ },
  middleware: [
    async (ctx, next) => {
      const memUsage = process.memoryUsage();
      if (memUsage.heapUsed > 500 * 1024 * 1024) { // 500MB
        throw new Error('Memory usage too high');
      }
      await next();
    }
  ]
});
```

#### Provider Timeouts

```typescript
// Implement timeout handling
const feather = new Feather({
  providers: { /* ... */ },
  timeoutMs: 10000,
  retry: {
    maxAttempts: 2,
    baseMs: 1000,
    maxMs: 3000
  }
});
```

#### Rate Limit Errors

```typescript
// Handle rate limits gracefully
const feather = new Feather({
  providers: { /* ... */ },
  limits: {
    "openai:gpt-4": { rps: 1, burst: 2 } // Very conservative
  },
  middleware: [
    async (ctx, next) => {
      try {
        await next();
      } catch (error) {
        if (error.message.includes('rate limit')) {
          console.log('Rate limited, waiting...');
          await new Promise(resolve => setTimeout(resolve, 60000)); // Wait 1 minute
          throw error; // Let retry logic handle it
        }
        throw error;
      }
    }
  ]
});
```

### Debugging

```typescript
// Enable debug logging
const feather = new Feather({
  providers: { /* ... */ },
  middleware: [
    async (ctx, next) => {
      console.log('Request:', {
        provider: ctx.provider,
        model: ctx.model,
        messages: ctx.request.messages.length
      });
      
      await next();
      
      console.log('Response:', {
        provider: ctx.provider,
        cost: ctx.response?.costUSD,
        tokens: ctx.response?.tokens
      });
    }
  ]
});
```

---

For more deployment examples and configurations, check out the `examples/` directory and explore the [API Reference](api-reference.md) for detailed configuration options.
