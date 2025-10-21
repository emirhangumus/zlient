# zlient

A type-safe HTTP client framework with Zod validation for building robust API clients.

## Features

- 🔒 **Type-safe**: Full TypeScript support with automatic type inference
- ✅ **Runtime validation**: Zod schemas for request/response validation
- 🔄 **Retry logic**: Built-in configurable retry strategies
- 🎯 **Authentication**: Multiple auth providers (API Key, Bearer Token, Custom)
- 🪝 **Interceptors**: Before request and after response hooks
- ⏱️ **Timeouts**: Configurable request timeouts
- 📦 **Multiple endpoints**: Easy service separation with base URL mapping

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

        // Services can map to distinct base URL keys via per-call options
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
    
    if (error.zodError) {
      console.error('Validation errors:', error.zodError.errors);
    }
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
