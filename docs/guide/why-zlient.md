# Why Zlient?

You might be wondering: *"Why do I need another HTTP client? What's wrong with `fetch` or `axios`?"*

## The Problem

### 1. `fetch` is too low-level
`fetch` is great, but it requires boilerplate for everything:
-   Checking `res.ok`.
-   Parsing JSON manually.
-   Handling timeouts.
-   Constructing query strings.

### 2. `axios` is huge and loosely typed
Axios is the industry standard, but:
-   It adds significant bundle size.
-   Its types are often `any` or require manual generic passing (e.g., `axios.get<User>(...)`).
-   **It trusts the server blindly.** If the server returns data that doesn't match your TypeScript interface, your app crashes at runtime with cryptic errors.

## The Zlient Solution

Zlient takes a different approach: **Runtime Validation is not optional.**

By forcing you to define a [Zod](https://zod.dev) schema for every endpoint, Zlient guarantees that **if your code runs, your data is correct.**

### Comparison

#### Traditional (`axios`)
```typescript
interface User { id: string; name: string; }

// ⚠️ Runtime Risk: API might return { id: 123 } (number)
// TypeScript won't catch this. Use defaults to "any" internally.
const { data } = await axios.get<User>('/users/1');

// 💥 Crash: data.id.toLowerCase() is not a function
console.log(data.id.toLowerCase());
```

#### Zlient Way
```typescript
const getUser = client.createEndpoint({
  method: 'GET',
  path: '/users/1',
  // ✅ Runtime Safety: Zod validates the response before you see it
  response: z.object({ 
    id: z.string(), // Must be a string
    name: z.string() 
  })
});

// data is strictly typed as { id: string; name: string }
const data = await getUser.call({});

// ✅ Safe: We know id is a string
console.log(data.id.toLowerCase());
```

## Key Benefits

1.  **Fail Fast**: If the API changes, Zlient throws a clear validation error immediately. No more debugging "undefined is not a function" deep in your UI components.
2.  **Zero Boilerplate**: No more `if (!res.ok) throw new Error(...)`.
3.  **Standardized**: Built-in logic for Retries, Timeouts, and Auth means every network call in your app behaves consistently.
4.  **Small**: Built on top of `fetch`, so it's lightweight.
