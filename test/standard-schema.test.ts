/**
 * Standard Schema Compatibility Tests
 *
 * This file tests that zlient works with ALL major Standard Schema-compatible
 * validation libraries: Zod, Valibot, and ArkType.
 *
 * This proves that users can bring their own schema library!
 */

import { beforeEach, describe, expect, it, mock } from 'bun:test';

// Import all major schema libraries
import { type } from 'arktype';
import * as v from 'valibot';
import { z } from 'zod';

import { HttpClient } from '../lib/http/http-client';
import { ApiError, HTTPStatusCode } from '../lib/types';

// =============================================================================
// SHARED TEST SETUP
// =============================================================================

const createMockFetch = (responseData: unknown, status = 200) => {
  return mock(() =>
    Promise.resolve(
      new Response(JSON.stringify(responseData), {
        status,
        headers: { 'Content-Type': 'application/json' },
      })
    )
  );
};

// =============================================================================
// ZOD TESTS
// =============================================================================

describe('Standard Schema: Zod', () => {
  let client: HttpClient;
  let mockFetch: ReturnType<typeof createMockFetch>;

  beforeEach(() => {
    mockFetch = createMockFetch({ id: 1, name: 'Test User', email: 'test@example.com' });
    client = new HttpClient({
      baseUrls: { default: 'https://api.example.com' },
      fetch: mockFetch as any,
    });
  });

  it('should validate response with Zod schema', async () => {
    const UserSchema = z.object({
      id: z.number(),
      name: z.string(),
      email: z.string().email(),
    });

    const getUser = client.createEndpoint({
      method: 'GET',
      path: '/users/1',
      response: UserSchema,
    });

    const user = await getUser({});

    expect(user).toEqual({ id: 1, name: 'Test User', email: 'test@example.com' });
  });

  it('should validate request body with Zod schema', async () => {
    const CreateUserSchema = z.object({
      name: z.string().min(1),
      email: z.string().email(),
    });
    const ResponseSchema = z.object({ id: z.number() });

    const createUser = client.createEndpoint({
      method: 'POST',
      path: '/users',
      request: CreateUserSchema,
      response: ResponseSchema,
    });

    // Valid request
    mockFetch = createMockFetch({ id: 123 });
    client = new HttpClient({
      baseUrls: { default: 'https://api.example.com' },
      fetch: mockFetch as any,
    });

    const newEndpoint = client.createEndpoint({
      method: 'POST',
      path: '/users',
      request: CreateUserSchema,
      response: ResponseSchema,
    });

    await newEndpoint({ data: { name: 'John', email: 'john@example.com' } });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('should throw ApiError on Zod validation failure', async () => {
    const UserSchema = z.object({
      id: z.number(),
      name: z.string(),
    });

    // Response doesn't match schema
    mockFetch = createMockFetch({ id: 'not-a-number', name: 123 });
    client = new HttpClient({
      baseUrls: { default: 'https://api.example.com' },
      fetch: mockFetch as any,
    });

    const getUser = client.createEndpoint({
      method: 'GET',
      path: '/users/1',
      response: UserSchema,
    });

    try {
      await getUser({});
      expect(true).toBe(false); // Should not reach here
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      expect((e as ApiError).isValidationError()).toBe(true);
      expect((e as ApiError).validationIssues!.length).toBeGreaterThan(0);
    }
  });

  it('should handle Zod path parameters', async () => {
    const UserSchema = z.object({ id: z.number(), name: z.string() });
    const PathSchema = z.object({ userId: z.string() });

    mockFetch = createMockFetch({ id: 42, name: 'User 42' });
    client = new HttpClient({
      baseUrls: { default: 'https://api.example.com' },
      fetch: mockFetch as any,
    });

    const getUser = client.createEndpoint({
      method: 'GET',
      path: (params) => `/users/${params.userId}`,
      pathParams: PathSchema,
      response: UserSchema,
    });

    const user = await getUser({ pathParams: { userId: '42' } });

    expect(user).toEqual({ id: 42, name: 'User 42' });
    const req = (mockFetch.mock.calls as unknown as Request[][])[0][0];
    expect(req.url).toBe('https://api.example.com/users/42');
  });

  it('should handle Zod query parameters', async () => {
    const UserSchema = z.object({ id: z.number(), name: z.string() });
    const QuerySchema = z.object({
      page: z.number(),
      limit: z.number(),
    });

    const listUsers = client.createEndpoint({
      method: 'GET',
      path: '/users',
      query: QuerySchema,
      response: UserSchema,
    });

    await listUsers({ query: { page: 1, limit: 10 } });

    const req = (mockFetch.mock.calls as unknown as Request[][])[0][0];
    expect(req.url).toBe('https://api.example.com/users?page=1&limit=10');
  });

  it('should handle Zod status code mapping', async () => {
    mockFetch = createMockFetch({ id: 999 }, 201);
    client = new HttpClient({
      baseUrls: { default: 'https://api.example.com' },
      fetch: mockFetch as any,
    });

    const createItem = client.createEndpoint({
      method: 'POST',
      path: '/items',
      response: {
        [HTTPStatusCode.CREATED]: z.object({ id: z.number() }),
        [HTTPStatusCode.BAD_REQUEST]: z.object({ error: z.string() }),
      },
    });

    const result = await createItem({});
    expect(result).toEqual({ id: 999 });
  });
});

// =============================================================================
// VALIBOT TESTS
// =============================================================================

describe('Standard Schema: Valibot', () => {
  let client: HttpClient;
  let mockFetch: ReturnType<typeof createMockFetch>;

  beforeEach(() => {
    mockFetch = createMockFetch({ id: 1, name: 'Test User', email: 'test@example.com' });
    client = new HttpClient({
      baseUrls: { default: 'https://api.example.com' },
      fetch: mockFetch as any,
    });
  });

  it('should validate response with Valibot schema', async () => {
    const UserSchema = v.object({
      id: v.number(),
      name: v.string(),
      email: v.pipe(v.string(), v.email()),
    });

    const getUser = client.createEndpoint({
      method: 'GET',
      path: '/users/1',
      response: UserSchema,
    });

    const user = await getUser({});

    expect(user).toEqual({ id: 1, name: 'Test User', email: 'test@example.com' });
  });

  it('should validate request body with Valibot schema', async () => {
    const CreateUserSchema = v.object({
      name: v.pipe(v.string(), v.minLength(1)),
      email: v.pipe(v.string(), v.email()),
    });
    const ResponseSchema = v.object({ id: v.number() });

    mockFetch = createMockFetch({ id: 456 });
    client = new HttpClient({
      baseUrls: { default: 'https://api.example.com' },
      fetch: mockFetch as any,
    });

    const createUser = client.createEndpoint({
      method: 'POST',
      path: '/users',
      request: CreateUserSchema,
      response: ResponseSchema,
    });

    await createUser({ data: { name: 'Jane', email: 'jane@example.com' } });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('should throw ApiError on Valibot validation failure', async () => {
    const UserSchema = v.object({
      id: v.number(),
      name: v.string(),
    });

    // Response doesn't match schema
    mockFetch = createMockFetch({ id: 'invalid', name: 456 });
    client = new HttpClient({
      baseUrls: { default: 'https://api.example.com' },
      fetch: mockFetch as any,
    });

    const getUser = client.createEndpoint({
      method: 'GET',
      path: '/users/1',
      response: UserSchema,
    });

    try {
      await getUser({});
      expect(true).toBe(false); // Should not reach here
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      expect((e as ApiError).isValidationError()).toBe(true);
      expect((e as ApiError).validationIssues!.length).toBeGreaterThan(0);
    }
  });

  it('should handle Valibot path parameters', async () => {
    const UserSchema = v.object({ id: v.number(), name: v.string() });
    const PathSchema = v.object({ userId: v.string() });

    mockFetch = createMockFetch({ id: 100, name: 'User 100' });
    client = new HttpClient({
      baseUrls: { default: 'https://api.example.com' },
      fetch: mockFetch as any,
    });

    const getUser = client.createEndpoint({
      method: 'GET',
      path: (params) => `/users/${params.userId}`,
      pathParams: PathSchema,
      response: UserSchema,
    });

    const user = await getUser({ pathParams: { userId: '100' } });

    expect(user).toEqual({ id: 100, name: 'User 100' });
    const req = (mockFetch.mock.calls as unknown as Request[][])[0][0];
    expect(req.url).toBe('https://api.example.com/users/100');
  });

  it('should handle Valibot query parameters', async () => {
    const UserSchema = v.object({ id: v.number(), name: v.string() });
    const QuerySchema = v.object({
      page: v.number(),
      limit: v.number(),
    });

    const listUsers = client.createEndpoint({
      method: 'GET',
      path: '/users',
      query: QuerySchema,
      response: UserSchema,
    });

    await listUsers({ query: { page: 2, limit: 25 } });

    const req = (mockFetch.mock.calls as unknown as Request[][])[0][0];
    expect(req.url).toBe('https://api.example.com/users?page=2&limit=25');
  });

  it('should handle Valibot status code mapping', async () => {
    mockFetch = createMockFetch({ id: 777 }, 201);
    client = new HttpClient({
      baseUrls: { default: 'https://api.example.com' },
      fetch: mockFetch as any,
    });

    const createItem = client.createEndpoint({
      method: 'POST',
      path: '/items',
      response: {
        [HTTPStatusCode.CREATED]: v.object({ id: v.number() }),
        [HTTPStatusCode.BAD_REQUEST]: v.object({ error: v.string() }),
      },
    });

    const result = await createItem({});
    expect(result).toEqual({ id: 777 });
  });

  it('should validate complex nested Valibot schemas', async () => {
    const AddressSchema = v.object({
      street: v.string(),
      city: v.string(),
      country: v.string(),
    });

    const UserSchema = v.object({
      id: v.number(),
      name: v.string(),
      address: AddressSchema,
      tags: v.array(v.string()),
    });

    mockFetch = createMockFetch({
      id: 1,
      name: 'John',
      address: { street: '123 Main St', city: 'NYC', country: 'USA' },
      tags: ['admin', 'user'],
    });
    client = new HttpClient({
      baseUrls: { default: 'https://api.example.com' },
      fetch: mockFetch as any,
    });

    const getUser = client.createEndpoint({
      method: 'GET',
      path: '/users/1',
      response: UserSchema,
    });

    const user = await getUser({});

    expect(user.address.city).toBe('NYC');
    expect(user.tags).toContain('admin');
  });
});

// =============================================================================
// ARKTYPE TESTS
// =============================================================================

describe('Standard Schema: ArkType', () => {
  let client: HttpClient;
  let mockFetch: ReturnType<typeof createMockFetch>;

  beforeEach(() => {
    mockFetch = createMockFetch({ id: 1, name: 'Test User', email: 'test@example.com' });
    client = new HttpClient({
      baseUrls: { default: 'https://api.example.com' },
      fetch: mockFetch as any,
    });
  });

  it('should validate response with ArkType schema', async () => {
    const UserSchema = type({
      id: 'number',
      name: 'string',
      email: 'string',
    });

    const getUser = client.createEndpoint({
      method: 'GET',
      path: '/users/1',
      response: UserSchema,
    });

    const user = await getUser({});

    expect(user).toEqual({ id: 1, name: 'Test User', email: 'test@example.com' });
  });

  it('should validate request body with ArkType schema', async () => {
    const CreateUserSchema = type({
      name: 'string',
      email: 'string',
    });
    const ResponseSchema = type({ id: 'number' });

    mockFetch = createMockFetch({ id: 789 });
    client = new HttpClient({
      baseUrls: { default: 'https://api.example.com' },
      fetch: mockFetch as any,
    });

    const createUser = client.createEndpoint({
      method: 'POST',
      path: '/users',
      request: CreateUserSchema,
      response: ResponseSchema,
    });

    await createUser({ data: { name: 'Bob', email: 'bob@example.com' } });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('should throw ApiError on ArkType validation failure', async () => {
    const UserSchema = type({
      id: 'number',
      name: 'string',
    });

    // Response doesn't match schema
    mockFetch = createMockFetch({ id: 'wrong-type', name: true });
    client = new HttpClient({
      baseUrls: { default: 'https://api.example.com' },
      fetch: mockFetch as any,
    });

    const getUser = client.createEndpoint({
      method: 'GET',
      path: '/users/1',
      response: UserSchema,
    });

    try {
      await getUser({});
      expect(true).toBe(false); // Should not reach here
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      expect((e as ApiError).isValidationError()).toBe(true);
      expect((e as ApiError).validationIssues!.length).toBeGreaterThan(0);
    }
  });

  it('should handle ArkType path parameters', async () => {
    const UserSchema = type({ id: 'number', name: 'string' });
    const PathSchema = type({ userId: 'string' });

    mockFetch = createMockFetch({ id: 200, name: 'User 200' });
    client = new HttpClient({
      baseUrls: { default: 'https://api.example.com' },
      fetch: mockFetch as any,
    });

    const getUser = client.createEndpoint({
      method: 'GET',
      path: (params) => `/users/${params.userId}`,
      pathParams: PathSchema,
      response: UserSchema,
    });

    const user = await getUser({ pathParams: { userId: '200' } });

    expect(user).toEqual({ id: 200, name: 'User 200' });
    const req = (mockFetch.mock.calls as unknown as Request[][])[0][0];
    expect(req.url).toBe('https://api.example.com/users/200');
  });

  it('should handle ArkType query parameters', async () => {
    const UserSchema = type({ id: 'number', name: 'string' });
    const QuerySchema = type({
      page: 'number',
      limit: 'number',
    });

    const listUsers = client.createEndpoint({
      method: 'GET',
      path: '/users',
      query: QuerySchema,
      response: UserSchema,
    });

    await listUsers({ query: { page: 3, limit: 50 } });

    const req = (mockFetch.mock.calls as unknown as Request[][])[0][0];
    expect(req.url).toBe('https://api.example.com/users?page=3&limit=50');
  });

  it('should handle ArkType status code mapping', async () => {
    mockFetch = createMockFetch({ id: 555 }, 201);
    client = new HttpClient({
      baseUrls: { default: 'https://api.example.com' },
      fetch: mockFetch as any,
    });

    const createItem = client.createEndpoint({
      method: 'POST',
      path: '/items',
      response: {
        [HTTPStatusCode.CREATED]: type({ id: 'number' }),
        [HTTPStatusCode.BAD_REQUEST]: type({ error: 'string' }),
      },
    });

    const result = await createItem({});
    expect(result).toEqual({ id: 555 });
  });

  it('should validate complex nested ArkType schemas', async () => {
    const UserSchema = type({
      id: 'number',
      name: 'string',
      address: {
        street: 'string',
        city: 'string',
        country: 'string',
      },
      tags: 'string[]',
    });

    mockFetch = createMockFetch({
      id: 1,
      name: 'Alice',
      address: { street: '456 Oak Ave', city: 'LA', country: 'USA' },
      tags: ['developer', 'tester'],
    });
    client = new HttpClient({
      baseUrls: { default: 'https://api.example.com' },
      fetch: mockFetch as any,
    });

    const getUser = client.createEndpoint({
      method: 'GET',
      path: '/users/1',
      response: UserSchema,
    });

    const user = await getUser({});

    expect(user.address.city).toBe('LA');
    expect(user.tags).toContain('developer');
  });
});

// =============================================================================
// CROSS-LIBRARY INTEROPERABILITY TESTS
// =============================================================================

describe('Standard Schema: Cross-Library Interoperability', () => {
  it('should use different schema libraries for request vs response', async () => {
    // Use Valibot for request validation, Zod for response validation
    const mockFetch = createMockFetch({ id: 1, name: 'Created User' });
    const client = new HttpClient({
      baseUrls: { default: 'https://api.example.com' },
      fetch: mockFetch as any,
    });

    const createUser = client.createEndpoint({
      method: 'POST',
      path: '/users',
      request: v.object({ name: v.string(), email: v.string() }), // Valibot
      response: z.object({ id: z.number(), name: z.string() }), // Zod
    });

    const user = await createUser({
      data: { name: 'Mixed', email: 'mixed@example.com' },
    });

    expect(user.id).toBe(1);
    expect(user.name).toBe('Created User');
  });

  it('should use ArkType for path, Valibot for query, Zod for response', async () => {
    const mockFetch = createMockFetch({ id: 42, name: 'Multi-Schema User' });
    const client = new HttpClient({
      baseUrls: { default: 'https://api.example.com' },
      fetch: mockFetch as any,
    });

    const getUser = client.createEndpoint({
      method: 'GET',
      path: (params) => `/users/${params.userId}`,
      pathParams: type({ userId: 'string' }), // ArkType
      query: v.object({ include: v.string() }), // Valibot
      response: z.object({ id: z.number(), name: z.string() }), // Zod
    });

    const user = await getUser({
      pathParams: { userId: '42' },
      query: { include: 'profile' },
    });

    expect(user.id).toBe(42);
    expect(user.name).toBe('Multi-Schema User');

    const req = (mockFetch.mock.calls as unknown as Request[][])[0][0];
    expect(req.url).toBe('https://api.example.com/users/42?include=profile');
  });

  it('should mix schema libraries in status code mapping', async () => {
    const mockFetch = createMockFetch({ error: 'Bad request' }, 400);
    const client = new HttpClient({
      baseUrls: { default: 'https://api.example.com' },
      fetch: mockFetch as any,
    });

    const createItem = client.createEndpoint({
      method: 'POST',
      path: '/items',
      response: {
        [HTTPStatusCode.CREATED]: z.object({ id: z.number() }), // Zod
        [HTTPStatusCode.BAD_REQUEST]: v.object({ error: v.string() }), // Valibot
        [HTTPStatusCode.INTERNAL_SERVER_ERROR]: type({ message: 'string' }), // ArkType
      },
    });

    const result = await createItem({});
    expect(result).toEqual({ error: 'Bad request' });
  });
});
