# Functional API

Zlient v2 introduces a purely functional way to define endpoints. This removes the boilerplate of class inheritance and strict class hierarchies.

## 1. The `createEndpoint` Method

The entry point is `client.createEndpoint(config)`.

```typescript
const endpoint = client.createEndpoint({
  method: 'GET',
  path: '/users',
  // ... schemas
});
```

## 2. Dynamic Paths

You can define dynamic paths using a function. The function receives the inferred type of your `pathParams` schema.

```typescript
const getUser = client.createEndpoint({
  method: 'GET',
  // `params` is fully typed as { id: string }
  path: (params) => `/users/${params.id}`,
  
  // This schema drives the type of `params` above
  pathParams: z.object({
    id: z.string()
  })
});
```

## 3. Strict Schemas

You can validate every part of the request lifecycle:

- `request`: The JSON body (for POST/PUT).
- `query`: The URL search parameters.
- `pathParams`: The dynamic path segments.
- `response`: The expected JSON response from the server.

```typescript
const searchUsers = client.createEndpoint({
  method: 'GET',
  path: '/users/search',
  
  query: z.object({
    q: z.string(),
    page: z.number().default(1)
  }),
  
  response: z.object({
    results: z.array(z.object({ id: z.string(), name: z.string() })),
    total: z.number()
  })
});
```

## 4. Execution

To execute an endpoint, call `.call()` on it.

```typescript
const result = await searchUsers.call({
  query: { q: 'alice', page: 2 }
});

// result.results is typed!
```

## 5. Abort Signals & timeouts

You can pass standard `fetch` options to the `.call()` method as the second argument.

```typescript
const controller = new AbortController();

await searchUsers.call(
  { query: { q: 'alice' } },
  { 
    signal: controller.signal,
    headers: { 'X-Custom': '123' } 
  }
);
```
