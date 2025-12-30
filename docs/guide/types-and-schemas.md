# Types & Schemas

Zlient exports several helper types and Zod schemas to speed up development.

## Common Schemas

Import these from `zlient`.

### `Id`
Accepts `string`, `number`, or `uuid`. Useful for flexible ID fields.
```typescript
import { Id } from 'zlient';
const User = z.object({ id: Id });
```

### `Timestamps`
Standard `createdAt` and `updatedAt` ISO strings.
```typescript
import { Timestamps } from 'zlient';
const Post = z.object({ 
  title: z.string(),
  ...Timestamps.shape 
});
```

### `Envelope`
Standard wrapper for `{ success, data, error, meta }` responses.
```typescript
import { Envelope } from 'zlient';
// Creates specific schema: { success: boolean, data: User, ... }
const UserResponse = Envelope(UserSchema);
```

### `PaginationSchema`
Standard schema for `{ items: T[], total, page, pageSize }`.

## Helper Types

- `ClientOptions`: Configuration object type.
- `RequestOptions`: Options passed to `.call()`.
- `HttpError`: The error class thrown by the client.
- `Paginated<T>`: TypeScript interface matching `PaginationSchema`.
