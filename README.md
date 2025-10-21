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
import { HttpClient, BaseEndpoint, BearerTokenAuth } from 'zlient';
import { z } from 'zod';

// Define your schemas
const UserSchema = z.object({
  id: z.number(),
  name: z.string(),
  email: z.string().email(),
});

// Create a client
const client = new HttpClient({
  baseUrls: {
    default: 'https://api.example.com',
  },
  auth: new BearerTokenAuth(() => 'your-token'),
});

// Define an endpoint
class GetUserEndpoint extends BaseEndpoint<typeof z.undefined, typeof UserSchema> {
  protected method = 'GET' as const;
  protected path = (params: { id: number }) => `/users/${params.id}`;
  
  constructor(client: HttpClient) {
    super(client, { responseSchema: UserSchema });
  }
}

// Use the endpoint
const getUserEndpoint = new GetUserEndpoint(client);
const user = await getUserEndpoint.call({ id: 1 });
console.log(user); // Fully typed!
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
