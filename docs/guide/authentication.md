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

You can implement the `AuthProvider` interface to build complex auth logic (e.g., signing requests, rotating specialized headers, or appending query-based credentials).

`apply(ctx)` receives an `AuthContext` with two mutable fields: `ctx.init` (the `RequestInit`
being sent — mutate `init.headers` to add headers) and `ctx.url` (the request URL — reassign
it if your auth scheme needs to append query parameters, the way `ApiKeyAuth`'s query mode does).

```typescript
import { AuthProvider, AuthContext } from 'zlient';

class MyCustomAuth implements AuthProvider {
  async apply(ctx: AuthContext) {
    // Header-based signing
    const timestamp = Date.now().toString();
    const signature = await signRequest(ctx.init, timestamp);

    // `init.headers` can be a Headers instance, an array of tuples, or a plain
    // object depending on what the caller passed in — handle all three:
    if (ctx.init.headers instanceof Headers) {
      ctx.init.headers.set('X-Signature', signature);
    } else if (Array.isArray(ctx.init.headers)) {
      ctx.init.headers.push(['X-Signature', signature]);
    } else {
      ctx.init.headers = { ...ctx.init.headers, 'X-Signature': signature };
    }

    // Query-based credentials: mutate ctx.url instead of init
    const url = new URL(ctx.url);
    url.searchParams.set('ts', timestamp);
    ctx.url = url.toString();
  }
}
```

## Refreshing on 401

If your tokens expire, configure `onUnauthenticated` on the client to refresh and retry
automatically instead of handling `401`s at every call site — see
[Handling 401s & Token Refresh](./error-handling#handling-401s-token-refresh).
