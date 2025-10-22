import { z } from 'zod';
import { ApiError, SafeParseResult } from './types';

/**
 * Safely parse data with a Zod schema without throwing.
 * Returns a result object with success status and data or error.
 * 
 * @param schema - Zod schema to validate against
 * @param data - Data to validate
 * @returns Result object with success flag and data/error
 * 
 * @example
 * ```ts
 * const result = safeParse(UserSchema, userData);
 * if (result.success) {
 *   console.log(result.data);
 * } else {
 *   console.error(result.error);
 * }
 * ```
 */
export function safeParse<T>(schema: z.ZodTypeAny, data: unknown): SafeParseResult<T> {
  const res = schema.safeParse(data);
  if (res.success) return { success: true, data: res.data as T };
  return { success: false, error: res.error };
}

/**
 * Parse data with a Zod schema, throwing an ApiError on validation failure.
 * Use this when you want to fail fast on invalid data.
 * 
 * @param schema - Zod schema to validate against
 * @param data - Data to validate
 * @returns Validated and typed data
 * @throws {ApiError} If validation fails
 * 
 * @example
 * ```ts
 * try {
 *   const user = parseOrThrow(UserSchema, userData);
 *   console.log(user);
 * } catch (error) {
 *   if (error instanceof ApiError && error.zodError) {
 *     console.error('Validation failed:', error.zodError.issues);
 *   }
 * }
 * ```
 */
export function parseOrThrow<T>(schema: z.ZodTypeAny, data: unknown): T {
  const res = schema.safeParse(data);
  if (!res.success) {
    throw new ApiError('Response validation failed', { zodError: res.error });
  }
  return res.data as T;
}
