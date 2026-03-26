# Authentication

Zlient provides a flexible authentication system that runs **before** the request is sent. Auth providers are automatically applied to standard HTTP requests and **Server-Sent Events (SSE)**.

## Built-in Providers

### Bearer Token

Use `BearerTokenAuth` for standard generic OAuth2/JWT flows. It supports async token retrieval (e.g., refreshing a token from a state manager or cookie).

```typescript
import { BearerTokenAuth } from 'zlient';

const auth = new BearerTokenAuth(async () => {
  // Logic to get your current token
  const session = await getSession();
  return session?.accessToken;
});

client.setAuth(auth);
```

### API Key

Use `ApiKeyAuth` for static keys, either in headers or query params.

```typescript
import { ApiKeyAuth } from 'zlient';

// Header: x-api-key: secret
const headerAuth = new ApiKeyAuth({
  header: 'x-api-key',
  value: 'secret',
});

// Query: ?api_key=secret
const queryAuth = new ApiKeyAuth({
  query: 'api_key',
  value: 'secret',
});
```

> [!TIP]
> Query-based authentication is the recommended way to authenticate **WebSocket** connections, as standard browser WebSockets do not support custom headers.

## Custom Providers

You can implement the `AuthProvider` interface to build complex auth logic (e.g., signing requests, rotating specialized headers).

```typescript
import { AuthProvider, AuthContext } from 'zlient';

class MyCustomAuth implements AuthProvider {
  async apply({ init }: AuthContext) {
    // Modify headers directly
    const timestamp = Date.now().toString();
    const signature = await signRequest(init, timestamp);

    // Zlient guarantees init.headers interacts safely,
    // but for complex logic, you might want to normalize it first.
    if (!init.headers) init.headers = {};

    // cast to record if you know it's safe,
    // OR use the safe handling shown in the migration guide.
    (init.headers as any)['X-Signature'] = signature;
  }
}
```
