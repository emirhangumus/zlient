# Usage Example

This file demonstrates how to use the `zlient` package in your own codebase.

## Installation

First, install the package:

```bash
npm install zlient zod
```

## Example Usage

```typescript
// example-usage.ts
import { 
  HttpClient, 
  BaseEndpoint, 
  BearerTokenAuth,
  ApiError 
} from 'zlient';
import { z } from 'zod';

// 1. Define your API schemas
const UserSchema = z.object({
  id: z.number(),
  name: z.string(),
  email: z.string().email(),
  createdAt: z.string(),
});

const CreateUserRequestSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
});

const UsersListSchema = z.object({
  users: z.array(UserSchema),
  total: z.number(),
});

// 2. Create HTTP client
const client = new HttpClient({
  baseUrls: {
    default: 'https://jsonplaceholder.typicode.com',
  },
  headers: {
    'Content-Type': 'application/json',
  },
  retry: {
    maxRetries: 2,
    baseDelayMs: 500,
  },
});

// 3. Define endpoints
class GetUserEndpoint extends BaseEndpoint<
  z.infer<typeof z.object({ id: z.number() })>,
  typeof UserSchema
> {
  protected method = 'GET' as const;
  protected path = (params: { id: number }) => `/users/${params.id}`;

  constructor(client: HttpClient) {
    super(client, { responseSchema: UserSchema });
  }
}

class CreateUserEndpoint extends BaseEndpoint<
  typeof CreateUserRequestSchema,
  typeof UserSchema
> {
  protected method = 'POST' as const;
  protected path = '/users';

  constructor(client: HttpClient) {
    super(client, {
      requestSchema: CreateUserRequestSchema,
      responseSchema: UserSchema,
    });
  }
}

// 4. Use the endpoints
async function main() {
  const getUserEndpoint = new GetUserEndpoint(client);
  const createUserEndpoint = new CreateUserEndpoint(client);

  try {
    // Get a user
    console.log('Fetching user...');
    const user = await getUserEndpoint.call({ id: 1 });
    console.log('User:', user);

    // Create a user
    console.log('\nCreating user...');
    const newUser = await createUserEndpoint.call({
      name: 'John Doe',
      email: 'john@example.com',
    });
    console.log('Created user:', newUser);
  } catch (error) {
    if (error instanceof ApiError) {
      console.error('API Error:', error.message);
      console.error('Status:', error.status);
      
      if (error.zodError) {
        console.error('Validation errors:', error.zodError.errors);
      }
    } else {
      console.error('Unexpected error:', error);
    }
  }
}

main();
```

## Project Structure

When using `zlient` in your project, organize it like this:

```
your-project/
├── src/
│   ├── api/
│   │   ├── client.ts          # Initialize HttpClient
│   │   ├── schemas.ts         # Define your Zod schemas
│   │   └── endpoints/
│   │       ├── users.ts       # User-related endpoints
│   │       └── posts.ts       # Post-related endpoints
│   └── index.ts
├── package.json
└── tsconfig.json
```

### client.ts

```typescript
import { HttpClient, BearerTokenAuth } from 'zlient';

export const apiClient = new HttpClient({
  baseUrls: {
    default: process.env.API_URL || 'https://api.example.com',
  },
  auth: new BearerTokenAuth(async () => {
    // Your token logic here
    return process.env.API_TOKEN || '';
  }),
  retry: {
    maxRetries: 3,
    baseDelayMs: 1000,
  },
});
```

### schemas.ts

```typescript
import { z } from 'zod';
import { Id, Timestamps } from 'zlient';

export const UserSchema = z.object({
  id: Id,
  name: z.string(),
  email: z.string().email(),
  ...Timestamps.shape,
});

export type User = z.infer<typeof UserSchema>;
```

### endpoints/users.ts

```typescript
import { BaseEndpoint } from 'zlient';
import { apiClient } from '../client';
import { UserSchema } from '../schemas';
import { z } from 'zod';

class GetUsersEndpoint extends BaseEndpoint<
  typeof z.undefined,
  z.ZodArray<typeof UserSchema>
> {
  protected method = 'GET' as const;
  protected path = '/users';

  constructor() {
    super(apiClient, { responseSchema: z.array(UserSchema) });
  }
}

export const getUsers = new GetUsersEndpoint();
```

### index.ts

```typescript
import { getUsers } from './api/endpoints/users';

async function main() {
  const users = await getUsers.call(undefined);
  console.log('Users:', users);
}

main();
```

## Publishing Your Package

To publish to npm:

```bash
# Build the package
npm run build

# Test the build
npm pack --dry-run

# Publish
npm publish
```

## Notes

- The `src/api` folder contains the core package code (what gets published)
- The `src/sdk.ts` and `src/services` folders are examples of how users would consume the package
- Only the `dist` folder gets published to npm
