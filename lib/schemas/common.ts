import { z } from 'zod';

export const Id = z.union([
  z.string().min(1),
  z.number(),
  z.uuid({
    version: 'v4',
  }),
]);
export type Id = z.infer<typeof Id>;

export const Timestamps = z.object({
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const Meta = z.object({
  requestId: z.string().optional(),
  timestamp: z.iso.datetime().optional(),
  traceId: z.string().optional(),
});

export const ErrorDetail = z.object({
  path: z.string().optional(),
  message: z.string(),
});

export const ApiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.array(ErrorDetail).optional(),
});

export const Envelope = <T extends z.ZodTypeAny>(inner: T) =>
  z.object({
    success: z.boolean(),
    data: inner.optional(),
    error: ApiErrorSchema.optional(),
    meta: Meta.optional(),
  });
