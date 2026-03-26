# zlient

**The Type-Safe HTTP Client for Perfectionists.**

![NPM Version](https://img.shields.io/npm/v/zlient?style=flat-square)
![License](https://img.shields.io/npm/l/zlient?style=flat-square)
![Downloads](https://img.shields.io/npm/dm/zlient?style=flat-square)

Build robust, type-safe API clients with runtime validation, retry logic, and zero boilerplate. Use **any** [Standard Schema](https://standardschema.dev) library — Zod, Valibot, ArkType, and more.

## Features

- **Standard Schema**: Use Zod, Valibot, ArkType, or any compatible validator. No lock-in.
- **Functional API**: Define endpoints with pure functions and automatic type inference.
- **Type-Safe**: Full TypeScript support. Arguments and responses are strictly typed.
- **Runtime Validation**: Validate requests, responses, query params, and path params.
- **Resilience**: Built-in exponential backoff retries and timeouts.
- **Auth**: Logic-safe authentication providers (Bearer, API Key, Custom).
- **Real-Time**: Type-safe WebSockets and Server-Sent Events (SSE).
- **Observability**: Hooks for structured logging and metrics.

---

## Installation

```bash
npm install zlient
# or
bun add zlient
```

Then install your preferred validation library:

```bash
# Pick one (or more!)
npm install zod       # Zod
npm install valibot   # Valibot  
npm install arktype   # ArkType
```

---

## Quick Start

### 1. Initialize Client

```typescript
import { HttpClient } from 'zlient';

const client = new HttpClient({
  baseUrls: {
    default: 'https://api.example.com',
  },
  retry: { maxAttempts: 3, baseDelayMs: 1000 },
});
```

### 2. Define Endpoint

Use `createEndpoint` with your favorite schema library:

<!-- tabs:start -->
#### **Zod**
```typescript
import { z } from 'zod';

const getUser = client.createEndpoint({
  method: 'GET',
  path: (params) => `/users/${params.id}`,
  pathParams: z.object({ id: z.string() }),
  response: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string().email(),
  }),
});
```

#### **Valibot**
```typescript
import * as v from 'valibot';

const getUser = client.createEndpoint({
  method: 'GET',
  path: (params) => `/users/${params.id}`,
  pathParams: v.object({ id: v.string() }),
  response: v.object({
    id: v.string(),
    name: v.string(),
    email: v.pipe(v.string(), v.email()),
  }),
});
```

#### **ArkType**
```typescript
import { type } from 'arktype';

const getUser = client.createEndpoint({
  method: 'GET',
  path: (params) => `/users/${params.id}`,
  pathParams: type({ id: 'string' }),
  response: type({
    id: 'string',
    name: 'string',
    email: 'string.email',
  }),
});
```
<!-- tabs:end -->

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

### Retry Configuration

Zlient automatically retries failed requests with exponential backoff. Customize the retry behavior:

```typescript
const client = new HttpClient({
  baseUrls: { default: 'https://api.example.com' },
  retry: {
    maxAttempts: 3,           // Total attempts (including initial request)
    baseDelayMs: 1000,        // Base delay for exponential backoff
    retryMethods: ['GET', 'POST', 'PUT'],     // Methods to retry
    retryStatusCodes: [500, 502, 503, 504],   // Status codes to retry
    respectRetryAfter: true,  // Honor Retry-After header
  },
});
```

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
import { z } from 'zod';

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

### Error Handling

Validation errors are thrown as `ApiError` with detailed issues:

```typescript
import { ApiError } from 'zlient';

try {
  await getUser({ pathParams: { id: '123' } });
} catch (error) {
  if (error instanceof ApiError && error.validationIssues) {
    // Handle validation error
    console.log(error.validationIssues);
    // [{ message: 'Expected string, got number', path: ['id'] }]
  }
}
```

### FormData Support

Upload files and send multipart form data seamlessly.

```typescript
import { z } from 'zod';

const uploadFile = client.createEndpoint({
  method: 'POST',
  path: '/upload',
  response: z.object({ fileId: z.string(), url: z.string() }),
  advanced: {
    skipRequestValidation: true, // FormData can't be validated
  },
});

const formData = new FormData();
formData.append('file', fileBlob, 'document.pdf');

const result = await uploadFile({ data: formData });
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

### Real-Time (WebSockets & SSE)

Zlient makes real-time communication as simple as HTTP requests.

#### **WebSockets**
```typescript
const chatWs = client.createWebSocket({
  path: '/chat',
  send: z.object({ text: z.string() }),
  receive: z.object({ user: z.string(), text: z.string() }),
});

const socket = chatWs();
socket.on('message', (data) => console.log(data.text));
socket.send({ text: 'Hello!' });
```

#### **SSE**

Zlient's SSE implementation supports custom HTTP methods, request bodies, and **automatic authentication**.

```typescript
const stream = client.createSSE({
  path: '/events',
  response: {
    message: z.object({ type: z.literal('connected') }),
    time: z.string(),
  },
  advanced: {
    method: 'POST', // Support GET (default), POST, etc.
  }
});

const sse = await stream({
  data: { filter: 'active' }, // Support request body for POST/PUT
  headers: { 'X-Custom-ID': '123' }, // Custom headers
});

sse.on('message', (data) => console.log(data.type)); // Typed as { type: 'connected' }
sse.on('time', (data) => console.log(data)); // Typed as string
```

---

## Migration from v2

v3 introduces Standard Schema support. Key changes:

```diff
- import { z } from 'zod'; // Required peer dependency
+ // Use any Standard Schema library (Zod, Valibot, ArkType)

- catch (e) { if (e instanceof ZodError) { ... } }
+ catch (e) { if (e instanceof ApiError && e.validationIssues) { ... } }
```

---

## Documentation

📖 [Full Documentation](https://emirhangumus.github.io/zlient/)

---

## License

MIT © [Emirhan Gumus](https://github.com/emirhangumus)
