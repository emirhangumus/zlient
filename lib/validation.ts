import { z } from 'zod';
import { ApiError, SafeParseResult } from './types';

export function safeParse<T>(schema: z.ZodTypeAny, data: unknown): SafeParseResult<T> {
  const res = schema.safeParse(data);
  if (res.success) return { success: true, data: res.data as T };
  return { success: false, error: res.error };
}

export function parseOrThrow<T>(schema: z.ZodTypeAny, data: unknown): T {
  const res = schema.safeParse(data);
  if (!res.success) {
    throw new ApiError('Response validation failed', { zodError: res.error });
  }
  return res.data as T;
}
