# Configuration

Zlient is highly configurable at both the client level and the request level.

## Client Options

Pass these to `new HttpClient(options)`.

| Option | Type | Description |
| :--- | :--- | :--- |
| `baseUrls` | `BaseUrlMap` | **Required.** Map of service names to URLs. Must include `default`. |
| `headers` | `Record<string, string>` | Default headers applied to every request. |
| `auth` | `AuthProvider` | Authentication strategy (see [Auth Guide](./authentication)). |
| `retry` | `RetryStrategy` | Global retry configuration (see [Error Handling](./error-handling)). |
| `timeout` | `{ requestTimeoutMs: number }` | Global timeout for all requests. |
| `interceptors` | `Interceptors` | Hooks for request/response lifecycle. |
| `logger` | `Logger` | Logger implementation. |
| `metrics` | `MetricsCollector` | Metrics collector implementation. |

### BaseUrlMap

Zlient supports multiple services in one client instance.

```typescript
const client = new HttpClient({
  baseUrls: {
    default: 'https://api.example.com',
    auth: 'https://auth.example.com',
    cdn: 'https://cdn.example.com'
  }
});
```

Using a specific service:
```typescript
await getProfile.call({}, { baseUrlKey: 'auth' });
```

## Request Options

Pass these as the second argument to `.call()`.

```typescript
await endpoint.call(params, {
  // Override base URL
  baseUrlKey: 'cdn',
  
  // Merge these headers with default headers
  headers: { 'Cache-Control': 'no-cache' },
  
  // AbortSignal for cancellation
  signal: controller.signal,
  
  // Append query params dynamically
  query: { debug: 'true' }
});
```
