/**
 * Validation Utilities Tests
 *
 * Tests for safeParse, parseOrThrow, and isStandardSchema functions
 * with all major Standard Schema-compatible libraries.
 */

import { describe, expect, it } from 'bun:test';

// Import all major schema libraries
import { type } from 'arktype';
import * as v from 'valibot';
import { z } from 'zod';

import { ApiError } from '../lib/types';
import { isStandardSchema, parseOrThrow, safeParse } from '../lib/validation';

// =============================================================================
// isStandardSchema Tests
// =============================================================================

describe('isStandardSchema', () => {
  describe('should return true for valid Standard Schema implementations', () => {
    it('detects Zod schemas', () => {
      expect(isStandardSchema(z.string())).toBe(true);
      expect(isStandardSchema(z.number())).toBe(true);
      expect(isStandardSchema(z.object({ name: z.string() }))).toBe(true);
      expect(isStandardSchema(z.array(z.string()))).toBe(true);
      expect(isStandardSchema(z.union([z.string(), z.number()]))).toBe(true);
    });

    it('detects Valibot schemas', () => {
      expect(isStandardSchema(v.string())).toBe(true);
      expect(isStandardSchema(v.number())).toBe(true);
      expect(isStandardSchema(v.object({ name: v.string() }))).toBe(true);
      expect(isStandardSchema(v.array(v.string()))).toBe(true);
      expect(isStandardSchema(v.union([v.string(), v.number()]))).toBe(true);
    });

    it('detects ArkType schemas', () => {
      expect(isStandardSchema(type('string'))).toBe(true);
      expect(isStandardSchema(type('number'))).toBe(true);
      expect(isStandardSchema(type({ name: 'string' }))).toBe(true);
      expect(isStandardSchema(type('string[]'))).toBe(true);
      expect(isStandardSchema(type('string | number'))).toBe(true);
    });
  });

  describe('should return false for non-Standard Schema values', () => {
    it('rejects null and undefined', () => {
      expect(isStandardSchema(null)).toBe(false);
      expect(isStandardSchema(undefined)).toBe(false);
    });

    it('rejects primitives', () => {
      expect(isStandardSchema('string')).toBe(false);
      expect(isStandardSchema(123)).toBe(false);
      expect(isStandardSchema(true)).toBe(false);
      expect(isStandardSchema(Symbol('test'))).toBe(false);
    });

    it('rejects plain objects', () => {
      expect(isStandardSchema({})).toBe(false);
      expect(isStandardSchema({ name: 'test' })).toBe(false);
      expect(isStandardSchema({ '~standard': null })).toBe(false);
      expect(isStandardSchema({ '~standard': { version: 2 } })).toBe(false);
    });

    it('rejects arrays', () => {
      expect(isStandardSchema([])).toBe(false);
      expect(isStandardSchema([1, 2, 3])).toBe(false);
    });

    it('rejects regular functions', () => {
      expect(isStandardSchema(() => {})).toBe(false);
      expect(isStandardSchema(function test() {})).toBe(false);
    });

    it('rejects class instances without Standard Schema', () => {
      class MyClass {
        name = 'test';
      }
      expect(isStandardSchema(new MyClass())).toBe(false);
    });
  });
});

// =============================================================================
// safeParse Tests
// =============================================================================

describe('safeParse', () => {
  describe('with Zod', () => {
    it('returns success with valid data', async () => {
      const schema = z.object({ name: z.string(), age: z.number() });
      const result = await safeParse(schema, { name: 'John', age: 30 });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({ name: 'John', age: 30 });
      }
    });

    it('returns failure with invalid data', async () => {
      const schema = z.object({ name: z.string(), age: z.number() });
      const result = await safeParse(schema, { name: 123, age: 'invalid' });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.issues.length).toBeGreaterThan(0);
        expect(result.issues[0].message).toBeDefined();
      }
    });

    it('handles optional fields', async () => {
      const schema = z.object({
        name: z.string(),
        nickname: z.string().optional(),
      });

      const result = await safeParse(schema, { name: 'John' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('John');
        expect(result.data.nickname).toBeUndefined();
      }
    });

    it('handles default values', async () => {
      const schema = z.object({
        name: z.string(),
        role: z.string().default('user'),
      });

      const result = await safeParse(schema, { name: 'John' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.role).toBe('user');
      }
    });

    it('handles array validation', async () => {
      const schema = z.array(z.number().positive());

      const validResult = await safeParse(schema, [1, 2, 3]);
      expect(validResult.success).toBe(true);

      const invalidResult = await safeParse(schema, [1, -2, 3]);
      expect(invalidResult.success).toBe(false);
    });

    it('handles union types', async () => {
      const schema = z.union([z.string(), z.number()]);

      const stringResult = await safeParse(schema, 'hello');
      expect(stringResult.success).toBe(true);

      const numberResult = await safeParse(schema, 42);
      expect(numberResult.success).toBe(true);

      const invalidResult = await safeParse(schema, { not: 'valid' });
      expect(invalidResult.success).toBe(false);
    });

    it('handles nested objects', async () => {
      const schema = z.object({
        user: z.object({
          profile: z.object({
            name: z.string(),
            avatar: z.string().url().optional(),
          }),
        }),
      });

      const result = await safeParse(schema, {
        user: {
          profile: {
            name: 'John',
            avatar: 'https://example.com/avatar.png',
          },
        },
      });

      expect(result.success).toBe(true);
    });
  });

  describe('with Valibot', () => {
    it('returns success with valid data', async () => {
      const schema = v.object({ name: v.string(), age: v.number() });
      const result = await safeParse(schema, { name: 'Jane', age: 25 });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({ name: 'Jane', age: 25 });
      }
    });

    it('returns failure with invalid data', async () => {
      const schema = v.object({ name: v.string(), age: v.number() });
      const result = await safeParse(schema, { name: null, age: 'not-a-number' });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.issues.length).toBeGreaterThan(0);
      }
    });

    it('handles optional fields', async () => {
      const schema = v.object({
        name: v.string(),
        bio: v.optional(v.string()),
      });

      const result = await safeParse(schema, { name: 'Jane' });
      expect(result.success).toBe(true);
    });

    it('handles array validation', async () => {
      const schema = v.array(v.pipe(v.string(), v.minLength(1)));

      const validResult = await safeParse(schema, ['a', 'bb', 'ccc']);
      expect(validResult.success).toBe(true);

      const invalidResult = await safeParse(schema, ['a', '', 'c']);
      expect(invalidResult.success).toBe(false);
    });

    it('handles union types', async () => {
      const schema = v.union([v.string(), v.boolean()]);

      expect((await safeParse(schema, 'hello')).success).toBe(true);
      expect((await safeParse(schema, true)).success).toBe(true);
      expect((await safeParse(schema, 123)).success).toBe(false);
    });

    it('handles tuple validation', async () => {
      const schema = v.tuple([v.string(), v.number(), v.boolean()]);

      const validResult = await safeParse(schema, ['name', 42, true]);
      expect(validResult.success).toBe(true);

      const invalidResult = await safeParse(schema, ['name', 'not-number', true]);
      expect(invalidResult.success).toBe(false);
    });
  });

  describe('with ArkType', () => {
    it('returns success with valid data', async () => {
      const schema = type({ name: 'string', age: 'number' });
      const result = await safeParse(schema, { name: 'Bob', age: 35 });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({ name: 'Bob', age: 35 });
      }
    });

    it('returns failure with invalid data', async () => {
      const schema = type({ name: 'string', age: 'number' });
      const result = await safeParse(schema, { name: 100, age: 'wrong' });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.issues.length).toBeGreaterThan(0);
      }
    });

    it('handles optional fields', async () => {
      const schema = type({ name: 'string', bio: 'string?' });

      const result = await safeParse(schema, { name: 'Bob' });
      expect(result.success).toBe(true);
    });

    it('handles array validation', async () => {
      const schema = type('number[]');

      expect((await safeParse(schema, [1, 2, 3])).success).toBe(true);
      expect((await safeParse(schema, [1, 'two', 3])).success).toBe(false);
    });

    it('handles union types', async () => {
      const schema = type('string | number | boolean');

      expect((await safeParse(schema, 'hello')).success).toBe(true);
      expect((await safeParse(schema, 42)).success).toBe(true);
      expect((await safeParse(schema, false)).success).toBe(true);
      expect((await safeParse(schema, null)).success).toBe(false);
    });

    it('handles constrained types', async () => {
      const schema = type('string >= 3');

      expect((await safeParse(schema, 'abc')).success).toBe(true);
      expect((await safeParse(schema, 'ab')).success).toBe(false);
    });
  });
});

// =============================================================================
// parseOrThrow Tests
// =============================================================================

describe('parseOrThrow', () => {
  describe('with Zod', () => {
    it('returns data on success', async () => {
      const schema = z.object({ id: z.number(), email: z.string().email() });
      const data = await parseOrThrow(schema, { id: 1, email: 'test@example.com' });

      expect(data).toEqual({ id: 1, email: 'test@example.com' });
    });

    it('throws ApiError on failure', async () => {
      const schema = z.object({ id: z.number(), email: z.string().email() });

      try {
        await parseOrThrow(schema, { id: 'not-number', email: 'invalid-email' });
        expect(true).toBe(false); // Should not reach
      } catch (e) {
        expect(e).toBeInstanceOf(ApiError);
        const error = e as ApiError;
        expect(error.isValidationError()).toBe(true);
        expect(error.validationIssues).toBeDefined();
        expect(error.validationIssues!.length).toBeGreaterThan(0);
        expect(error.message).toContain('Validation failed');
      }
    });

    it('includes all validation issues in error', async () => {
      const schema = z.object({
        name: z.string().min(1),
        age: z.number().positive(),
        email: z.string().email(),
      });

      try {
        await parseOrThrow(schema, { name: '', age: -5, email: 'bad' });
        expect(true).toBe(false);
      } catch (e) {
        const error = e as ApiError;
        // Should have multiple issues
        expect(error.validationIssues!.length).toBeGreaterThanOrEqual(2);
      }
    });
  });

  describe('with Valibot', () => {
    it('returns data on success', async () => {
      const schema = v.object({ id: v.number(), active: v.boolean() });
      const data = await parseOrThrow(schema, { id: 42, active: true });

      expect(data).toEqual({ id: 42, active: true });
    });

    it('throws ApiError on failure', async () => {
      const schema = v.object({ id: v.number() });

      try {
        await parseOrThrow(schema, { id: 'wrong' });
        expect(true).toBe(false);
      } catch (e) {
        expect(e).toBeInstanceOf(ApiError);
        expect((e as ApiError).isValidationError()).toBe(true);
      }
    });
  });

  describe('with ArkType', () => {
    it('returns data on success', async () => {
      const schema = type({ status: '"active" | "inactive"', count: 'number' });
      const data = await parseOrThrow(schema, { status: 'active', count: 10 });

      expect(data).toEqual({ status: 'active', count: 10 });
    });

    it('throws ApiError on failure', async () => {
      const schema = type({ status: '"active" | "inactive"' });

      try {
        await parseOrThrow(schema, { status: 'invalid' });
        expect(true).toBe(false);
      } catch (e) {
        expect(e).toBeInstanceOf(ApiError);
        expect((e as ApiError).isValidationError()).toBe(true);
      }
    });
  });
});

// =============================================================================
// Edge Cases and Error Handling
// =============================================================================

describe('Edge Cases', () => {
  it('handles empty objects', async () => {
    const zodSchema = z.object({});
    const valibotSchema = v.object({});
    const arkSchema = type({});

    expect((await safeParse(zodSchema, {})).success).toBe(true);
    expect((await safeParse(valibotSchema, {})).success).toBe(true);
    expect((await safeParse(arkSchema, {})).success).toBe(true);
  });

  it('handles null values appropriately', async () => {
    const nullableZod = z.string().nullable();
    const nullableValibot = v.nullable(v.string());
    const nullableArk = type('string | null');

    expect((await safeParse(nullableZod, null)).success).toBe(true);
    expect((await safeParse(nullableValibot, null)).success).toBe(true);
    expect((await safeParse(nullableArk, null)).success).toBe(true);

    // Non-nullable should fail
    const nonNullZod = z.string();
    expect((await safeParse(nonNullZod, null)).success).toBe(false);
  });

  it('handles deeply nested validation errors', async () => {
    const schema = z.object({
      level1: z.object({
        level2: z.object({
          level3: z.object({
            value: z.number(),
          }),
        }),
      }),
    });

    const result = await safeParse(schema, {
      level1: {
        level2: {
          level3: {
            value: 'not-a-number',
          },
        },
      },
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      // Should have path information
      const issue = result.issues[0];
      expect(issue.path).toBeDefined();
    }
  });

  it('handles recursive/circular type references', async () => {
    // Zod lazy for recursive types
    interface TreeNode {
      value: string;
      children?: TreeNode[];
    }

    const TreeSchema: z.ZodType<TreeNode> = z.lazy(() =>
      z.object({
        value: z.string(),
        children: z.array(TreeSchema).optional(),
      })
    );

    const result = await safeParse(TreeSchema, {
      value: 'root',
      children: [{ value: 'child1' }, { value: 'child2', children: [{ value: 'grandchild' }] }],
    });

    expect(result.success).toBe(true);
  });

  it('handles large arrays efficiently', async () => {
    const schema = z.array(z.number());
    const largeArray = Array.from({ length: 10000 }, (_, i) => i);

    const start = Date.now();
    const result = await safeParse(schema, largeArray);
    const duration = Date.now() - start;

    expect(result.success).toBe(true);
    expect(duration).toBeLessThan(1000); // Should complete in under 1 second
  });

  it('handles special string formats', async () => {
    const schema = z.object({
      email: z.string().email(),
      url: z.string().url(),
      uuid: z.string().uuid(),
    });

    const validResult = await safeParse(schema, {
      email: 'user@example.com',
      url: 'https://example.com/path?query=1',
      uuid: '550e8400-e29b-41d4-a716-446655440000',
    });

    expect(validResult.success).toBe(true);

    const invalidResult = await safeParse(schema, {
      email: 'not-an-email',
      url: 'not-a-url',
      uuid: 'not-a-uuid',
    });

    expect(invalidResult.success).toBe(false);
  });

  it('handles numeric constraints', async () => {
    const schema = z.object({
      positive: z.number().positive(),
      negative: z.number().negative(),
      integer: z.number().int(),
      between: z.number().min(0).max(100),
    });

    const validResult = await safeParse(schema, {
      positive: 5,
      negative: -3,
      integer: 42,
      between: 50,
    });

    expect(validResult.success).toBe(true);

    const invalidResult = await safeParse(schema, {
      positive: -1,
      negative: 1,
      integer: 3.14,
      between: 150,
    });

    expect(invalidResult.success).toBe(false);
  });

  it('handles date validation', async () => {
    const schema = z.object({
      createdAt: z.coerce.date(),
    });

    const result = await safeParse(schema, {
      createdAt: '2024-01-15T10:30:00Z',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.createdAt).toBeInstanceOf(Date);
    }
  });
});

// =============================================================================
// ApiError Tests
// =============================================================================

describe('ApiError', () => {
  it('isValidationError returns true when validationIssues exist', () => {
    const error = new ApiError('Test error', {
      validationIssues: [{ message: 'Invalid field' }],
    });

    expect(error.isValidationError()).toBe(true);
  });

  it('isValidationError returns false when no validationIssues', () => {
    const error = new ApiError('Test error', { status: 500 });

    expect(error.isValidationError()).toBe(false);
  });

  it('isClientError returns true for 4xx status', () => {
    const error = new ApiError('Not found', { status: 404 });
    expect(error.isClientError()).toBe(true);

    const error400 = new ApiError('Bad request', { status: 400 });
    expect(error400.isClientError()).toBe(true);
  });

  it('isServerError returns true for 5xx status', () => {
    const error = new ApiError('Internal error', { status: 500 });
    expect(error.isServerError()).toBe(true);

    const error503 = new ApiError('Service unavailable', { status: 503 });
    expect(error503.isServerError()).toBe(true);
  });

  it('toJSON includes all error details', () => {
    const issues = [{ message: 'Field is required', path: ['name'] }];
    const error = new ApiError('Validation failed', {
      status: 400,
      details: { field: 'name' },
      validationIssues: issues,
    });

    const json = error.toJSON();

    expect(json.name).toBe('ApiError');
    expect(json.message).toBe('Validation failed');
    expect(json.status).toBe(400);
    expect(json.details).toEqual({ field: 'name' });
    expect(json.validationIssues).toEqual(issues);
  });
});

// =============================================================================
// Transform/Coercion Tests
// =============================================================================

describe('Transforms and Coercion', () => {
  it('handles Zod transforms', async () => {
    const schema = z.object({
      name: z.string().transform((s) => s.toUpperCase()),
      count: z.string().transform((s) => parseInt(s, 10)),
    });

    const result = await safeParse(schema, { name: 'hello', count: '42' });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('HELLO');
      expect(result.data.count).toBe(42);
    }
  });

  it('handles Zod coerce', async () => {
    const schema = z.object({
      number: z.coerce.number(),
      boolean: z.coerce.boolean(),
      string: z.coerce.string(),
    });

    const result = await safeParse(schema, {
      number: '123',
      boolean: 1,
      string: 456,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.number).toBe(123);
      expect(result.data.boolean).toBe(true);
      expect(result.data.string).toBe('456');
    }
  });

  it('handles Valibot transforms', async () => {
    const schema = v.pipe(
      v.object({
        value: v.string(),
      }),
      v.transform((obj) => ({ ...obj, transformed: true }))
    );

    const result = await safeParse(schema, { value: 'test' });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.transformed).toBe(true);
    }
  });
});
