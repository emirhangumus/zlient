# Error Handling & Retries

Zlient is designed to facilitate robust error handling by providing typed errors and automatic retry strategies.

## ApiError

Any request failure (network, validation, or non-success status code) throws an `ApiError`.

```typescript
import { ApiError } from 'zlient';

try {
  await getUser.call({ ... });
} catch (err) {
  if (err instanceof ApiError) {
    if (err.isValidationError()) {
      // Zod validation failed on request or response
      console.log(err.zodError.issues);
    } else if (err.isClientError()) {
      // 4xx error (e.g. 404, 400)
    } else if (err.isServerError()) {
      // 5xx error
    }
    
    // Original status code
    console.log(err.status); // e.g. 404
  }
}
```

## Validation Errors

If your response schema doesn't match what the server returned, Zlient throws immediately. This "Fail Fast" approach prevents corrupted data from flowing into your application logic.

## Retry Strategy

Zlient automatically retries requests based on the configured strategy.

### Default Behavior
- **Max Retries**: 2
- **Methods**: `GET`, `HEAD`
- **Status Codes**: `>= 500`
- **Network Errors**: Always retried

### Custom Configuration

```typescript
const client = new HttpClient({
  // ...
  retry: {
    maxRetries: 5,
    baseDelayMs: 500, // Exponential backoff starts here
    jitter: 0.3,      // Randomize delay to prevent Thundering Herd
    
    // Also retry on 429 Too Many Requests
    retryStatusCodes: ['INTERNAL_SERVER_ERROR', 'TOO_MANY_REQUESTS'],
    
    // Also retry POST requests
    retryMethods: ['GET', 'POST']
  }
});
```
