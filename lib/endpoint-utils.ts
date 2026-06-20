import { ApiError, StandardSchemaV1 } from './types';
import { parseOrThrow } from './validation';

export function validateRequiredHeaders(
  mustHeaderKeys: readonly string[] | undefined,
  headers: Record<string, string> | undefined
): void {
  if (!mustHeaderKeys || mustHeaderKeys.length === 0) return;

  const missing = mustHeaderKeys.filter((key) => !headers || !(key in headers));
  if (missing.length > 0) {
    throw new ApiError(`Missing required header(s): ${missing.join(', ')}`, {
      details: { missingHeaders: missing },
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
  throw new ApiError(message, { details: { missingParam } });
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

export type EndpointParamsConfig = {
  request?: StandardSchemaV1;
  query?: StandardSchemaV1;
  pathParams?: StandardSchemaV1;
  path: string | ((params: unknown) => string);
  advanced?: { skipRequestValidation?: boolean };
};

export type RawEndpointParams = {
  data?: unknown;
  query?: unknown;
  pathParams?: unknown;
};

export type ValidatedEndpointParams = {
  parsedData: unknown;
  parsedQuery: unknown;
  parsedPathParams: unknown;
  pathStr: string;
};

/**
 * Shared validation pipeline used by HTTP, SSE, and WebSocket endpoints.
 * Validates request body, query params, and path params; asserts required
 * fields are present; and resolves the final path string.
 */
export async function validateEndpointParams(
  config: EndpointParamsConfig,
  raw: RawEndpointParams,
  labels: { request?: string; query?: string; path?: string } = {}
): Promise<ValidatedEndpointParams> {
  const skip = config.advanced?.skipRequestValidation ?? false;

  const parsedData = await parseEndpointValue(
    config.request,
    raw.data,
    skip,
    labels.request ?? 'Request body'
  );

  const parsedQuery = await parseEndpointValue(
    config.query,
    raw.query,
    skip,
    labels.query ?? 'Query parameters'
  );

  const parsedPathParams = await parseEndpointValue(
    config.pathParams,
    raw.pathParams,
    skip,
    labels.path ?? 'Path parameters'
  );

  assertRequiredEndpointValue(
    config.request,
    raw.data,
    'data',
    'Missing required request body (data)'
  );
  assertRequiredEndpointValue(
    config.pathParams,
    raw.pathParams,
    'pathParams',
    'Missing required path parameters (pathParams)'
  );

  const pathStr = resolveEndpointPath(config.path, raw.pathParams, parsedPathParams);

  return { parsedData, parsedQuery, parsedPathParams, pathStr };
}
