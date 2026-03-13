# Types & Schemas

Zlient exports helper types and utilities for working with Standard Schema-compatible validators.

## Standard Schema Support

Zlient v3 supports **any** validation library that implements [Standard Schema](https://standardschema.dev):

- **Zod** (v4+)
- **Valibot**
- **ArkType**
- Any future Standard Schema-compatible library

## Core Types

Import these from `zlient`:

### `StandardSchemaV1`

The Standard Schema interface type. Use this for generic schema handling.

```typescript
import { StandardSchemaV1 } from 'zlient';

function validate<T extends StandardSchemaV1>(schema: T, data: unknown) {
  return schema['~standard'].validate(data);
}
```

### `InferInput<T>` / `InferOutput<T>`

Infer input/output types from any Standard Schema.

```typescript
import { InferOutput } from 'zlient';
import { z } from 'zod';

const UserSchema = z.object({ id: z.string(), name: z.string() });
type User = InferOutput<typeof UserSchema>;
// { id: string; name: string }
```

## Validation Utilities

### `safeParse(schema, data)`

Validate data without throwing. Returns `{ success, data }` or `{ success, issues }`.

```typescript
import { safeParse } from 'zlient';

const result = await safeParse(UserSchema, userData);
if (result.success) {
  console.log(result.data);
} else {
  console.error(result.issues);
}
```

### `parseOrThrow(schema, data)`

Validate data, throwing `ApiError` on failure.

```typescript
import { parseOrThrow } from 'zlient';

const user = await parseOrThrow(UserSchema, userData);
```

### `isStandardSchema(value)`

Type guard to check if a value is a Standard Schema validator.

```typescript
import { isStandardSchema } from 'zlient';

if (isStandardSchema(maybeSchema)) {
  // maybeSchema is StandardSchemaV1
}
```

## Helper Types

- `ClientOptions`: Configuration object type.
- `RequestOptions`: Options passed to the endpoint.
- `ApiError`: The error class thrown by the client.
- `Paginated<T>`: TypeScript interface for paginated responses.
- `SafeParseResult<T>`: Result type from `safeParse`.

## Mix and Match

You can use different schema libraries for different parts of your endpoint:

```typescript
import { z } from 'zod';
import * as v from 'valibot';
import { type } from 'arktype';

const mixedEndpoint = client.createEndpoint({
  method: 'POST',
  path: (p) => `/users/${p.id}`,
  pathParams: type({ id: 'string' }), // ArkType
  request: v.object({ name: v.string() }), // Valibot
  response: z.object({ id: z.string() }), // Zod
});
```
