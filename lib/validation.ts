import { ApiError, SafeParseResult, StandardSchemaV1 } from './types';

/**
 * Safely parse/validate data with any Standard Schema-compatible library (Zod, Valibot, ArkType, etc.).
 * Returns a result object with success status and data or issues.
 *
 * @param schema - A Standard Schema-compatible validator
 * @param data - Data to validate
 * @returns Result object with success flag and data/issues
 *
 * @example
 * ```ts
 * // Works with Zod
 * import { z } from 'zod';
 * const result = await safeParse(z.object({ name: z.string() }), userData);
 *
 * // Works with Valibot
 * import * as v from 'valibot';
 * const result = await safeParse(v.object({ name: v.string() }), userData);
 *
 * // Works with ArkType
 * import { type } from 'arktype';
 * const result = await safeParse(type({ name: 'string' }), userData);
 *
 * if (result.success) {
 *   console.log(result.data);
 * } else {
 *   console.error(result.issues);
 * }
 * ```
 */
export async function safeParse<T extends StandardSchemaV1>(
  schema: T,
  data: unknown
): Promise<SafeParseResult<StandardSchemaV1.InferOutput<T>>> {
  const result = await schema['~standard'].validate(data);

  if (result.issues) {
    return { success: false, issues: result.issues };
  }

  return { success: true, data: result.value as StandardSchemaV1.InferOutput<T> };
}

/**
 * Parse/validate data with any Standard Schema-compatible library, throwing an ApiError on failure.
 * Use this when you want to fail fast on invalid data.
 *
 * @param schema - A Standard Schema-compatible validator
 * @param data - Data to validate
 * @returns Validated and typed data
 * @throws {ApiError} If validation fails (with validationIssues property)
 *
 * @example
 * ```ts
 * // Works with any Standard Schema-compatible library
 * try {
 *   const user = await parseOrThrow(UserSchema, userData);
 *   console.log(user);
 * } catch (error) {
 *   if (error instanceof ApiError && error.isValidationError()) {
 *     console.error('Validation failed:', error.validationIssues);
 *   }
 * }
 * ```
 */
export async function parseOrThrow<T extends StandardSchemaV1>(
  schema: T,
  data: unknown
): Promise<StandardSchemaV1.InferOutput<T>> {
  const result = await schema['~standard'].validate(data);

  if (result.issues) {
    const messages = result.issues.map((issue) => issue.message).join(', ');
    throw new ApiError(`Validation failed: ${messages}`, {
      validationIssues: result.issues,
    });
  }

  return result.value as StandardSchemaV1.InferOutput<T>;
}

/**
 * Type guard to check if a value is a Standard Schema-compatible validator.
 * Handles both object-based schemas (Zod, Valibot) and function-based schemas (ArkType).
 *
 * @param value - Value to check
 * @returns True if the value implements Standard Schema v1
 */
export function isStandardSchema(value: unknown): value is StandardSchemaV1 {
  if (value === null || value === undefined) return false;

  // Standard Schema can be implemented on objects or functions (ArkType uses functions)
  if (typeof value !== 'object' && typeof value !== 'function') return false;

  const schema = value as StandardSchemaV1;
  return (
    '~standard' in schema &&
    typeof schema['~standard'] === 'object' &&
    schema['~standard'] !== null &&
    schema['~standard'].version === 1 &&
    typeof schema['~standard'].validate === 'function'
  );
}
