# Configuration

Zlient is highly configurable at both the client level and the request level.

## Client Options

Pass these to `new HttpClient(options)`.

| Option             | Type                                            | Description                                                                |
| :----------------- | :----------------------------------------------- | :-------------------------------------------------------------------------- |
| `baseUrls`         | `BaseUrlMap`                                     | **Required.** Map of service names to URLs. Must include `default`.        |
| `fetch`            | `FetchLike`                                      | Custom `fetch` implementation. Defaults to `globalThis.fetch`.             |
| `headers`          | `Record<string, string>`                         | Default headers applied to every request.                                  |
| `auth`             | `AuthProvider`                                    | Authentication strategy (see [Auth Guide](./authentication)).              |
| `retry`            | `RetryPolicy`                                     | Global retry configuration (see [Error Handling](./error-handling)).       |
| `timeout`          | `{ requestTimeoutMs?: number }`                   | Global timeout for all requests.                                            |
| `interceptors`     | `Interceptors`                                    | Hooks for request/response lifecycle.                                      |
| `logger`           | `Logger`                                          | Logger implementation.                                                      |
| `metrics`          | `MetricsCollector`                                | Metrics collector implementation.                                          |
| `onUnauthenticated` | `(response: Response) => Promise<boolean> \| boolean` | Called on a 401 response. Return `true` to retry the request once (e.g. after refreshing a token), or `false` to surface the 401 as-is. See [Auth Guide](./authentication). |

### BaseUrlMap

Zlient supports multiple services in one client instance.

```typescript
const client = new HttpClient({
  baseUrls: {
    default: 'https://api.example.com',
    auth: 'https://auth.example.com',
    cdn: 'https://cdn.example.com',
  },
});
```

Using a specific service:

```typescript
await getProfile({ baseUrlKey: 'auth' });
```

## Request Options

### Untyped requests (`client.get`/`post`/`put`/`patch`/`delete`)

These accept a flat options object as the second argument:

```typescript
await client.get('/profile', {
  baseUrlKey: 'cdn', // Use a different entry from baseUrls
  skipAuth: true, // Skip authentication for this request only
  skipRetry: true, // Skip retry logic for this request only
  headers: { 'Cache-Control': 'no-cache' }, // Merged with default headers
  signal: controller.signal, // AbortSignal for cancellation
  query: { debug: 'true' }, // Appended to the URL
});
```

### Typed endpoints (`createEndpoint`/`createSSE`/`createWebSocket`)

Per-call params only cover request shape — `data`, `query`, `pathParams`, `headers`, and `signal`:

```typescript
await getUser({
  pathParams: { id: '123' },
  query: { includePosts: true },
  headers: { 'Cache-Control': 'no-cache' },
  signal: controller.signal,
});
```

Behavioral flags like `baseUrlKey`, `skipAuth`, `skipRetry`, `skipRequestValidation`, and
`skipResponseValidation` are fixed per-endpoint, set once in the `advanced` block when you
*define* the endpoint (see [Error Handling](./error-handling) for an example), not per call.
