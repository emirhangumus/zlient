# Interceptors

Interceptors allows you to hook into the request/response lifecycle. This is useful for logging, appending global headers (like auth tokens), or handling global errors (like 401 redirects).

## `beforeRequest`

This hook runs **before** the request is sent to the network, but **after** validation and authentication.

```typescript
const client = new HttpClient({
  baseUrls: { default: '...' },
  interceptors: {
    beforeRequest: [
      ({ url, init }) => {
        console.log(`[HTTP] ${init.method} ${url}`);
        
        // You can modify the request init object
        // e.g., append a custom tracking header
        const headers = init.headers as Record<string, string>;
        headers['X-Request-ID'] = crypto.randomUUID();
      }
    ]
  }
});
```

## `afterResponse`

This hook runs **after** the response is received and parsed.

```typescript
const client = new HttpClient({
  baseUrls: { default: '...' },
  interceptors: {
    afterResponse: [
      ({ request, response, parsed }) => {
        console.log(`[HTTP] ${response.status} ${request.url}`);
        
        if (response.status === 401) {
          // Handle unauthorized globally
          window.location.href = '/login';
        }
      }
    ]
  }
});
```
