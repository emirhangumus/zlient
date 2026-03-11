# Functional API

Zlient provides a purely functional way to define endpoints. This removes the boilerplate of class inheritance and strict class hierarchies.

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

::: code-group
```typescript [Zod]
import { z } from 'zod';

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
```typescript [Valibot]
import * as v from 'valibot';

const getUser = client.createEndpoint({
  method: 'GET',
  path: (params) => `/users/${params.id}`,
  pathParams: v.object({
    id: v.string()
  })
});
```
```typescript [ArkType]
import { type } from 'arktype';

const getUser = client.createEndpoint({
  method: 'GET',
  path: (params) => `/users/${params.id}`,
  pathParams: type({ id: 'string' })
});
```
:::

## 3. Strict Schemas

You can validate every part of the request lifecycle with **any Standard Schema-compatible library**:

- `request`: The JSON body (for POST/PUT).
- `query`: The URL search parameters.
- `pathParams`: The dynamic path segments.
- `response`: The expected JSON response from the server.

::: code-group
```typescript [Zod]
import { z } from 'zod';

// 1. GET with Query Params & Response Map
const searchUsers = client.createEndpoint({
  method: 'GET',
  path: '/users/search',
  
  query: z.object({
    q: z.string(),
    page: z.number().default(1)
  }),
  
  response: {
    200: z.object({
      results: z.array(z.object({ id: z.string(), name: z.string() })),
      total: z.number()
    })
  }
});

// 2. POST with Request Body
const createUser = client.createEndpoint({
  method: 'POST',
  path: '/users',
  request: z.object({
    name: z.string().min(2),
    email: z.string().email(),
    role: z.enum(['admin', 'user'])
  }),
  response: z.object({
    id: z.string(),
    createdAt: z.string().datetime()
  })
});
```
```typescript [Valibot]
import * as v from 'valibot';

// 1. GET with Query Params & Response Map
const searchUsers = client.createEndpoint({
  method: 'GET',
  path: '/users/search',
  
  query: v.object({
    q: v.string(),
    page: v.optional(v.number(), 1)
  }),
  
  response: {
    200: v.object({
      results: v.array(v.object({ id: v.string(), name: v.string() })),
      total: v.number()
    })
  }
});

// 2. POST with Request Body
const createUser = client.createEndpoint({
  method: 'POST',
  path: '/users',
  request: v.object({
    name: v.pipe(v.string(), v.minLength(2)),
    email: v.pipe(v.string(), v.email()),
    role: v.picklist(['admin', 'user'])
  }),
  response: v.object({
    id: v.string(),
    createdAt: v.pipe(v.string(), v.isoDateTime())
  })
});
```
```typescript [ArkType]
import { type } from 'arktype';

// 1. GET with Query Params & Response Map
const searchUsers = client.createEndpoint({
  method: 'GET',
  path: '/users/search',
  
  query: type({
    q: 'string',
    'page?': 'number'
  }),
  
  response: {
    200: type({
      results: [{ id: 'string', name: 'string' }],
      total: 'number'
    })
  }
});

// 2. POST with Request Body
const createUser = client.createEndpoint({
  method: 'POST',
  path: '/users',
  request: type({
    name: 'string>=2',
    email: 'string.email',
    role: '"admin" | "user"'
  }),
  response: type({
    id: 'string',
    createdAt: 'string'
  })
});
```
:::

## 4. Execution

To execute an endpoint, call it directly as a function.

```typescript
const result = await searchUsers({
  query: { q: 'alice', page: 2 }
});

// result.results is typed!
```

## 5. Abort Signals & timeouts

You can pass standard `fetch` options to the function call by including them in the params object.

```typescript
const controller = new AbortController();

await searchUsers({
  query: { q: 'alice' },
  signal: controller.signal,
  headers: { 'X-Custom': '123' }
});
```
