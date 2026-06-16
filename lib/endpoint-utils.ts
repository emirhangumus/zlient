import { ApiError, StandardSchemaV1 } from './types';
import { formatValidationIssues, parseOrThrow } from './validation';

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

export function parseEndpointValueSync(
  schema: StandardSchemaV1 | undefined,
  value: unknown,
  skipValidation: boolean,
  label: string
): unknown {
  if (skipValidation || !schema || value === undefined) return value;

  const result = schema['~standard'].validate(value);
  if (result instanceof Promise) {
    void result.catch(() => undefined);
    return value;
  }

  if (result.issues) {
    const messages = formatValidationIssues(result.issues);
    const issueCount = result.issues.length > 3 ? ` (${result.issues.length} issues total)` : '';
    throw new ApiError(`${label} validation failed: ${messages}${issueCount}`, {
      validationIssues: result.issues,
    });
  }

  return result.value;
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
