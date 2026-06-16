# Error Handling & Retries

Zlient is designed to facilitate robust error handling by providing typed errors and automatic retry strategies.

## ApiError

Any request failure (network, validation, or non-success status code) throws an `ApiError`.

```typescript
import { ApiError } from 'zlient';

try {
  await getUser({ ... });
} catch (err) {
  if (err instanceof ApiError) {
    if (err.isValidationError()) {
      // Validation failed (works with Zod, Valibot, ArkType, etc.)
      console.log(err.validationIssues);
      // [{ message: 'Expected string, received number', path: ['id'] }]
    } else if (err.isClientError()) {
      // 4xx error (e.g. 404, 400)
    } else if (err.isServerError()) {
      // 5xx error
    }

    // Original status code
    console.log(err.status); // e.g. 404
    console.log(err.method); // e.g. "GET"
    console.log(err.url); // e.g. "https://api.example.com/users/123"
    console.log(err.details); // Parsed error response body when available
  }
}
```

For HTTP status errors, the message includes the request method, URL, status code, status text, and a server-provided `message`, `error`, `title`, or `detail` field when present. The parsed response body is available on `err.details`.

## Validation Errors

If your response schema doesn't match what the server returned, Zlient throws immediately. This "Fail Fast" approach prevents corrupted data from flowing into your application logic.

Standard Schema Issues
Validation issues follow the [Standard Schema](https://standardschema.dev) format, regardless of which validation library you use:

```typescript
interface Issue {
  message: string;
  path?: (string | number | symbol)[];
}
```

## Retry Strategy

Zlient automatically retries requests based on the configured strategy using exponential backoff.

### Configuration

```typescript
const client = new HttpClient({
  baseUrls: { default: 'https://api.example.com' },
  retry: {
    maxAttempts: 3, // Total number of attempts (including initial request)
    baseDelayMs: 1000, // Initial delay in milliseconds for exponential backoff
    jitter: 0.2, // Optional: randomize delays to prevent thundering herd (0..1)
    retryMethods: ['GET', 'POST', 'PUT'], // HTTP methods eligible for retry
    retryStatusCodes: [500, 502, 503, 504], // HTTP status codes eligible for retry
    respectRetryAfter: true, // Honor 'Retry-After' header if present
    shouldRetry: (ctx) => {
      // Optional: custom retry logic
      return ctx.error instanceof NetworkError;
    },
  },
});
```

### Exponential Backoff

Delays between retries follow this formula: `baseDelayMs * 2^(attempt - 1)`

- **1st retry**: `baseDelayMs * 2^0` = 1000ms
- **2nd retry**: `baseDelayMs * 2^1` = 2000ms
- **3rd retry**: `baseDelayMs * 2^2` = 4000ms

With jitter enabled, delays are randomized by the specified factor to prevent the "thundering herd" problem.

### Retry-After Support

When `respectRetryAfter` is `true`, Zlient respects the `Retry-After` header from the server:

```typescript
retry: {
  maxAttempts: 3,
  baseDelayMs: 1000,
  retryStatusCodes: [429, 503],
  retryMethods: ['GET'],
  respectRetryAfter: true,  // Will use header value if present
}
```

### Per-Request Control

Skip retry for a specific request:

```typescript
const { data } = await client.get('/critical-check', { skipRetry: true });
```

Skip retry for a specific endpoint:

```typescript
const risky = client.createEndpoint({
  method: 'POST',
  path: '/payment',
  response: z.object({ success: z.boolean() }),
  advanced: { skipRetry: true },
});
```
