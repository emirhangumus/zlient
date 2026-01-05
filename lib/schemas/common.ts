import { z } from 'zod';

/**
 * Common ID type that supports strings, numbers, or UUIDs.
 * Use this for entity identifiers in your schemas.
 *
 * @example
 * ```ts
 * const UserSchema = z.object({ id: Id, name: z.string() });
 * ```
 */
export const Id = z.union([
  z.string().min(1),
  z.number(),
  z.uuid({
    version: 'v4',
  }),
]);
export type IdType = z.infer<typeof Id>;

/**
 * Common timestamp fields for entities.
 * Use this for database models with creation/update tracking.
 *
 * @example
 * ```ts
 * const UserSchema = z.object({
 *   id: Id,
 *   name: z.string(),
 *   ...Timestamps.shape
 * });
 * ```
 */
export const Timestamps = z.object({
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

/**
 * Metadata information typically included in API responses.
 * Contains request tracking and debugging information.
 */
export const Meta = z.object({
  timestamp: z.iso.datetime().optional(),
});

/**
 * Detailed error information for a specific field or path.
 */
export const ErrorDetail = z.object({
  path: z.string().optional(),
  message: z.string(),
});

/**
 * Standard API error response schema.
 * Use this for consistent error handling across your API.
 */
export const ApiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.array(ErrorDetail).optional(),
});

/**
 * Generic envelope wrapper for API responses.
 * Provides consistent structure with success flag, data, error, and metadata.
 *
 * @param inner - Zod schema for the response data
 * @returns Envelope schema wrapping the inner schema
 *
 * @example
 * ```ts
 * const UserResponseSchema = Envelope(z.object({ id: Id, name: z.string() }));
 *
 * // Response structure:
 * // {
 * //   success: true,
 * //   data: { id: 1, name: 'John' },
 * //   meta: { timestamp: '...' }
 * // }
 * ```
 */
export const Envelope = <T extends z.ZodType, M extends z.ZodType = z.ZodOptional<typeof Meta>>(
  inner: T,
  meta?: M
) => {
  return z.object({
    success: z.boolean(),
    data: inner.optional().nullable(),
    error: ApiErrorSchema.optional(),
    meta: (meta !== undefined ? meta : Meta.optional()) as M extends undefined ? z.ZodOptional<typeof Meta> : M,
  });
}
