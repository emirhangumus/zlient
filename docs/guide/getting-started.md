# Getting Started

## Installation

```bash
npm install zlient
# or
bun add zlient
```

Then install your preferred validation library:

::: code-group

```bash [Zod]
npm install zod
```

```bash [Valibot]
npm install valibot
```

```bash [ArkType]
npm install arktype
```

:::

::: tip Standard Schema
Zlient supports **any** validation library that implements [Standard Schema](https://standardschema.dev). This includes Zod v4+, Valibot, ArkType, and more!
:::

## Quick Start

### 1. Initialize Client

```typescript
import { HttpClient } from 'zlient';

const client = new HttpClient({
  baseUrls: {
    default: 'https://api.example.com',
  },
});
```

### 2. Define an Endpoint

Use your preferred validation library:

::: code-group

```typescript [Zod]
import { z } from 'zod';

const getUser = client.createEndpoint({
  method: 'GET',
  path: (p) => `/users/${p.id}`,
  pathParams: z.object({ id: z.string() }),
  response: z.object({
    id: z.string(),
    name: z.string(),
  }),
});
```

```typescript [Valibot]
import * as v from 'valibot';

const getUser = client.createEndpoint({
  method: 'GET',
  path: (p) => `/users/${p.id}`,
  pathParams: v.object({ id: v.string() }),
  response: v.object({
    id: v.string(),
    name: v.string(),
  }),
});
```

```typescript [ArkType]
import { type } from 'arktype';

const getUser = client.createEndpoint({
  method: 'GET',
  path: (p) => `/users/${p.id}`,
  pathParams: type({ id: 'string' }),
  response: type({
    id: 'string',
    name: 'string',
  }),
});
```

:::

### 3. Call it

```typescript
const user = await getUser({
  pathParams: { id: '123' },
});
```
