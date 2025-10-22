# zlient

A type-safe HTTP client framework with Zod validation for building robust API clients.

## Features

- 🔒 **Type-safe**: Full TypeScript support with automatic type inference
- ✅ **Runtime validation**: Zod schemas for request/response validation
- 🔄 **Retry logic**: Built-in configurable retry strategies with exponential backoff
- 🎯 **Authentication**: Multiple auth providers (API Key, Bearer Token, Custom)
- 🪝 **Interceptors**: Before request and after response hooks
- ⏱️ **Timeouts**: Configurable request timeouts
- 📦 **Multiple endpoints**: Easy service separation with base URL mapping
- 📊 **Observability**: Built-in logging and metrics collection
- 🎨 **Developer Experience**: Comprehensive JSDoc, helper methods, great error messages
- 🏢 **Enterprise-ready**: Production-grade logging, metrics, and monitoring support

## Installation

```bash
npm install zlient zod
# or
yarn add zlient zod
# or
pnpm add zlient zod
# or
bun add zlient zod
```

## Quick Start

```typescript
import { AuthProvider, BaseEndpoint, ClientOptions, HttpClient, HTTPMethod, RequestOptions } from "zlient";
import z from "zod";

/**
 * Schemas
 */
const todoItem = z.object({
    userId: z.number(),
    id: z.number(),
    title: z.string(),
    completed: z.boolean(),
});

const ListTodosRequest = z.object({});
const ListTodosResponse = z.array(todoItem);

const GetTodoRequest = z.object({
    id: z.number(),
});
const GetTodoResponse = todoItem;


/**
 * Endpoints
 */
class ListTodos extends BaseEndpoint<typeof ListTodosRequest, typeof ListTodosResponse> {
    protected readonly method = HTTPMethod.GET;
    protected readonly path = "/todos";
    constructor(client: HttpClient) { super(client, { requestSchema: ListTodosRequest, responseSchema: ListTodosResponse }); }
}

class GetTodo extends BaseEndpoint<typeof GetTodoRequest, typeof GetTodoResponse> {
    protected readonly method = HTTPMethod.GET;
    protected readonly path = (args: z.infer<typeof GetTodoRequest>) => `/todos/${args.id}`;
    constructor(client: HttpClient) { super(client, { requestSchema: GetTodoRequest, responseSchema: GetTodoResponse }); }
}

/**
 * Service
 */
class TodosService {
    constructor(private client: HttpClient) { }
    list(args: z.infer<typeof ListTodosRequest>, options?: RequestOptions) { return new ListTodos(this.client).call(args, options); }
    get(args: z.infer<typeof GetTodoRequest>, options?: RequestOptions) { return new GetTodo(this.client).call(args, options); }
}

/**
 * SDK class for initialization
 */
export class SDK {
    readonly http: HttpClient;
    readonly todos: TodosService;

    constructor(opts: ClientOptions & { auth?: AuthProvider }) {
        this.http = new HttpClient(opts);
        if (opts.auth) this.http.setAuth(opts.auth);

        // Initialize services
        this.todos = new TodosService(this.http);
    }
}


/**
 * Usage example
 */
const sdk = new SDK({
    baseUrls: {
        default: "https://jsonplaceholder.typicode.com",
    },
    headers: {
        "X-SDK-Name": "example-sdk",
        "X-SDK-Version": "1.0.0",
    },
    retry: { maxRetries: 2, baseDelayMs: 100, jitter: 0.2, retryMethods: ["GET"] },
    timeout: { requestTimeoutMs: 5000 },
});

async function demo() {
    const todos = await sdk.todos.list({});
    console.log(todos);

    const todo = await sdk.todos.get({ id: 1 });
    console.log(todo);
}

demo().catch(console.error);
```

## Core Concepts

### HttpClient

The main HTTP client that handles requests, retries, authentication, and interceptors.

```typescript
import { HttpClient, NoAuth } from 'zlient';

const client = new HttpClient({
  baseUrls: {
    default: 'https://api.example.com',
    v2: 'https://api-v2.example.com',
  },
  headers: {
    'Content-Type': 'application/json',
  },
  retry: {
    maxRetries: 3,
    baseDelayMs: 1000,
    jitter: 0.2,
  },
  timeout: {
    requestTimeoutMs: 30000,
  },
  auth: new NoAuth(),
});
```

### Authentication

#### Bearer Token

```typescript
import { BearerTokenAuth } from 'zlient';

const auth = new BearerTokenAuth(async () => {
  // Fetch token from your auth service
  return await getAccessToken();
});

client.setAuth(auth);
```

#### API Key

```typescript
import { ApiKeyAuth } from 'zlient';

// Header-based
const auth = new ApiKeyAuth({
  header: 'X-API-Key',
  value: 'your-api-key',
});

// Query parameter-based
const auth = new ApiKeyAuth({
  query: 'apiKey',
  value: 'your-api-key',
});
```

#### Custom Auth

```typescript
import { AuthProvider } from 'zlient';

class CustomAuth implements AuthProvider {
  async apply({ init }) {
    init.headers = {
      ...init.headers,
      'X-Custom-Auth': 'custom-value',
    };
  }
}
```

### BaseEndpoint

Create type-safe endpoints with automatic validation:

```typescript
import { BaseEndpoint, HttpClient } from 'zlient';
import { z } from 'zod';

const CreateUserSchema = z.object({
  name: z.string(),
  email: z.string().email(),
});

const UserResponseSchema = z.object({
  id: z.number(),
  name: z.string(),
  email: z.string().email(),
  createdAt: z.string().datetime(),
});

class CreateUserEndpoint extends BaseEndpoint<
  typeof CreateUserSchema,
  typeof UserResponseSchema
> {
  protected method = 'POST' as const;
  protected path = '/users';
  
  constructor(client: HttpClient) {
    super(client, {
      requestSchema: CreateUserSchema,
      responseSchema: UserResponseSchema,
    });
  }
}

// Usage
const endpoint = new CreateUserEndpoint(client);
const user = await endpoint.call({
  name: 'John Doe',
  email: 'john@example.com',
});
```

### Interceptors

Add hooks to inspect or modify requests and responses:

```typescript
const client = new HttpClient({
  baseUrls: { default: 'https://api.example.com' },
  interceptors: {
    beforeRequest: [
      async ({ url, init }) => {
        console.log('Making request to:', url);
      },
    ],
    afterResponse: [
      async ({ request, response, parsed }) => {
        console.log('Response received:', response.status);
      },
    ],
  },
});
```

### Common Schemas

The package includes common reusable schemas:

```typescript
import { Id, Timestamps, Meta, ApiErrorSchema, Envelope } from 'zlient';

// Use in your schemas
const MyEntitySchema = z.object({
  id: Id,
  name: z.string(),
  ...Timestamps.shape,
});

// Wrap responses in an envelope
const MyResponseSchema = Envelope(MyEntitySchema);
```

## Advanced Usage

### Multiple Base URLs

```typescript
const client = new HttpClient({
  baseUrls: {
    default: 'https://api.example.com',
    auth: 'https://auth.example.com',
    cdn: 'https://cdn.example.com',
  },
});

// Use specific base URL for a request
await endpoint.call(data, { baseUrlKey: 'auth' });
```

### Request Options

```typescript
await endpoint.call(data, {
  headers: { 'X-Custom-Header': 'value' },
  baseUrlKey: 'v2',
  signal: abortController.signal,
  query: { filter: 'active', page: 1 },
});
```

### Logging and Metrics

#### Structured Logging

```typescript
import { HttpClient, ConsoleLogger, LogLevel } from 'zlient';

const client = new HttpClient({
  baseUrls: { default: 'https://api.example.com' },
  logger: new ConsoleLogger(LogLevel.INFO),
});

// All requests are automatically logged with duration, status, etc.
```

#### Metrics Collection

```typescript
import { HttpClient, InMemoryMetricsCollector } from 'zlient';

const metrics = new InMemoryMetricsCollector();
const client = new HttpClient({
  baseUrls: { default: 'https://api.example.com' },
  metrics,
});

// View metrics summary
const summary = metrics.getSummary();
console.log(`Success rate: ${(summary.successful / summary.total * 100).toFixed(2)}%`);
console.log(`Avg duration: ${summary.avgDurationMs}ms`);
```

#### Custom Logger/Metrics Integration

```typescript
import { Logger, LogEntry, MetricsCollector, RequestMetrics } from 'zlient';

// Integrate with your logging service (e.g., DataDog, CloudWatch)
class CustomLogger implements Logger {
  log(entry: LogEntry) {
    // Send to your logging service
    myLoggingService.log(entry);
  }
}

class CustomMetrics implements MetricsCollector {
  collect(metrics: RequestMetrics) {
    // Send to your metrics service (e.g., Prometheus, DataDog)
    dogstatsd.histogram('http.request.duration', metrics.durationMs);
  }
}

const client = new HttpClient({
  baseUrls: { default: 'https://api.example.com' },
  logger: new CustomLogger(),
  metrics: new CustomMetrics(),
});
```

### Convenience Methods

```typescript
// Use shortcuts instead of full request() method
const { data: users } = await client.get('/users', { query: { page: 1 } });
const { data: user } = await client.post('/users', { name: 'John' });
const { data: updated } = await client.put('/users/1', { name: 'Jane' });
const { data: patched } = await client.patch('/users/1', { email: 'new@email.com' });
await client.delete('/users/1');
```

### Error Handling

```typescript
import { ApiError } from 'zlient';

try {
  await endpoint.call(data);
} catch (error) {
  if (error instanceof ApiError) {
    console.error('API Error:', error.message);
    console.error('Status:', error.status);
    console.error('Details:', error.details);
    
    // Check error type
    if (error.isValidationError()) {
      console.error('Validation errors:', error.zodError?.issues);
    }
    if (error.isClientError()) {
      console.error('Client error (4xx)');
    }
    if (error.isServerError()) {
      console.error('Server error (5xx)');
    }
    
    // Get full error details
    console.error(JSON.stringify(error.toJSON(), null, 2));
  }
}
```

## Building from Source

```bash
# Clone the repository
git clone <your-repo-url>
cd zlient

# Install dependencies
bun install

# Build the package
bun run build
```

## License

MIT

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.
