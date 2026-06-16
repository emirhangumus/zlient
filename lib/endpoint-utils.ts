import { ApiError, StandardSchemaV1 } from './types';
import { parseOrThrow } from './validation';

export function validateRequiredHeaders(
  mustHeaderKeys: readonly string[] | undefined,
  headers: Record<string, string> | undefined
): void {
  if (!mustHeaderKeys || mustHeaderKeys.length === 0) return;

  const missingHeaders = mustHeaderKeys.filter((key) => !headers || !(key in headers));
  if (missingHeaders.length > 0) {
    throw new ApiError(`Missing required header(s): ${missingHeaders.join(', ')}`, {
      details: { missingHeaders },
    });
  }
}

export async function parseEndpointValue(
  schema: StandardSchemaV1 | undefined,
  value: unknown,
  skipValidation: boolean,
  label: string
): Promise<unknown> {
  if (skipValidation || !schema || value === undefined) return value;

  return parseOrThrow(schema, value, { label });
}

export function assertRequiredEndpointValue(
  schema: StandardSchemaV1 | undefined,
  value: unknown,
  missingParam: string,
  message: string
): void {
  if (!schema || value !== undefined) return;

  throw new ApiError(message, {
    details: { missingParam },
  });
}

export function resolveEndpointPath<PathParams>(
  path: string | ((params: PathParams) => string),
  rawPathParams: unknown,
  parsedPathParams: PathParams
): string {
  if (typeof path !== 'function') return path;

  if (!rawPathParams) {
    throw new ApiError('Path function requires pathParams', {
      details: { missingParam: 'pathParams' },
    });
  }

  return path(parsedPathParams);
}
