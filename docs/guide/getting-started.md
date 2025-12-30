# Getting Started

## Installation

```bash
npm install zlient zod
# or
bun add zlient zod
```

::: warning
`zod` is a **peer dependency**. You must install it alongside `zlient`.
:::

## Quick Start

### 1. Initialize Client
```typescript
import { HttpClient } from 'zlient';

const client = new HttpClient({
  baseUrls: { 
    default: 'https://api.example.com' 
  }
});
```

### 2. Define an Endpoint
```typescript
import { z } from 'zod';

const getUser = client.createEndpoint({
  method: 'GET',
  path: (p) => `/users/${p.id}`,
  pathParams: z.object({ id: z.string() }),
  response: z.object({
    id: z.string(),
    name: z.string()
  })
});
```

### 3. Call it
```typescript
const user = await getUser({
  pathParams: { id: '123' }
});
```
