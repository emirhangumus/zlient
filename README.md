# zlient

**The Type-Safe HTTP Client for Perfectionists.**

![NPM Version](https://img.shields.io/npm/v/zlient?style=flat-square)
![License](https://img.shields.io/npm/l/zlient?style=flat-square)
![Downloads](https://img.shields.io/npm/dm/zlient?style=flat-square)

Build robust, type-safe API clients with automatic Zod validation, retry logic, and zero boilerplate.

## Features

-   **Functional API**: Define endpoints with pure functions and automatic type inference.
-   **Type-Safe**: Full TypeScript support. Arguments and responses are strictly typed.
-   **Zod Validation**: Runtime validation for requests, responses, query params, and path params.
-   **Resilience**: Built-in exponential backoff retries and timeouts.
-   **Auth**: Logic-safe authentication providers (Bearer, API Key, Custom) that handle edge cases.
-   **Observability**: Hooks for structured logging and metrics.

---

## Installation

```bash
npm install zlient zod
# or
bun add zlient zod
```

> **Note**: `zod` is a peer dependency. You must install it alongside `zlient`.

---

## Quick Start

### 1. Initialize Client

```typescript
import { HttpClient } from 'zlient';

const client = new HttpClient({
  baseUrls: {
    default: 'https://api.example.com',
  },
  retry: { maxRetries: 3 },
});
```

### 2. Define Endpoint

Use `createEndpoint` to build a type-safe definition. No classes required.

```typescript
import { z } from 'zod';

const getUser = client.createEndpoint({
  method: 'GET',
  path: (params) => `/users/${params.id}`,
  // Strict schemas for all inputs
  pathParams: z.object({ id: z.string() }),
  response: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string().email(),
  }),
});
```

### 3. Call It

TypeScript will enforce inputs and infer the response type automatically.

```typescript
const user = await getUser({
  pathParams: { id: '123' },
});

// `user` is typed as { id: string; name: string; email: string }
console.log(user.name);
```

---

## Advanced Usage

### Authentication

Zlient provides built-in auth providers that safely handle headers.

```typescript
import { BearerTokenAuth, ApiKeyAuth } from 'zlient';

// Bearer Token (Dynamic)
client.setAuth(new BearerTokenAuth(async () => {
  return await getLatestToken(); // Auto-refresh logic supported
}));

// API Key (Header or Query)
client.setAuth(new ApiKeyAuth({ header: 'X-API-KEY', value: 'secret' }));
```

### Multiple Status Codes

Handle different responses for different status codes.

```typescript
const createPost = client.createEndpoint({
  method: 'POST',
  path: '/posts',
  request: z.object({ title: z.string() }),
  response: {
    201: z.object({ id: z.string(), status: z.literal('created') }),
    400: z.object({ error: z.string(), code: z.literal('validation_error') }),
  },
});

const result = await createPost({ data: { title: 'Hello' } });
// `result` type is the union of the 201 and 400 schemas
```

### Metrics & Logging

Integrate with any monitoring stack (Datadog, Prometheus, etc.).

```typescript
import { InMemoryMetricsCollector, ConsoleLogger } from 'zlient';

const client = new HttpClient({
  baseUrls: { default: '...' },
  logger: new ConsoleLogger(),
  metrics: new InMemoryMetricsCollector(),
});
```

---

## License

MIT © [Emirhan Gumus](https://github.com/emirhangumus)
