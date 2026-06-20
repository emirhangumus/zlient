import type { AuthContext, AuthProvider } from '../auth';
import type { LoggerUtil } from '../logger';
import type { MetricsCollector } from '../metrics';
import { ApiError, HTTPMethod } from '../types';
import type { HTTPStatusCodeNumber, RetryPolicy } from '../types';

export function serializeRequestBody(
  body: unknown,
  headers: Record<string, string>
): BodyInit | undefined {
  if (body == null) return undefined;

  if (body instanceof FormData) {
    // Remove Content-Type so the browser sets it with the correct multipart boundary.
    delete headers['Content-Type'];
    return body;
  }

  if (body instanceof Blob || body instanceof ArrayBuffer) {
    return body;
  }

  if (headers['Content-Type']?.includes('json')) {
    return JSON.stringify(body);
  }

  return String(body);
}

function isBinaryContentType(contentType: string): boolean {
  return (
    contentType.includes('application/octet-stream') ||
    contentType.includes('application/pdf') ||
    contentType.includes('image/') ||
    contentType.includes('video/') ||
    contentType.includes('audio/') ||
    contentType.startsWith('application/zip') ||
    contentType.startsWith('application/x-')
  );
}

export async function parseResponseData(
  res: Response,
  method: keyof typeof HTTPMethod,
  url: string
): Promise<unknown> {
  if (res.status === 204 || res.status === 205) return undefined;

  const contentType = res.headers.get('content-type') || '';

  try {
    if (contentType.includes('json')) {
      const text = await res.text();
      return text ? JSON.parse(text) : undefined;
    }

    if (isBinaryContentType(contentType)) {
      return await res.blob();
    }

    return await res.text();
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new ApiError(
      `Failed to parse response body from ${method} ${url} (status ${res.status}): ${reason}`,
      {
        status: res.status,
        method,
        url,
        cause: error,
        details: { contentType },
      }
    );
  }
}

function getResponseMessage(details: unknown): string | undefined {
  if (typeof details === 'string') return details.trim() || undefined;
  if (!details || typeof details !== 'object') return undefined;

  const record = details as Record<string, unknown>;
  for (const key of ['message', 'error', 'title', 'detail']) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value;
  }

  return undefined;
}

export function createStatusError(
  method: keyof typeof HTTPMethod,
  url: string,
  res: Response,
  details: unknown
): ApiError {
  const statusText = res.statusText ? ` ${res.statusText}` : '';
  const responseMessage = getResponseMessage(details);
  const suffix = responseMessage ? `: ${responseMessage}` : '';

  return new ApiError(
    `Request failed: ${method} ${url} returned ${res.status}${statusText}${suffix}`,
    {
      status: res.status,
      method,
      url,
      details,
    }
  );
}

export function createNetworkError(
  method: keyof typeof HTTPMethod,
  url: string,
  error: unknown
): ApiError {
  if (error instanceof ApiError) return error;

  const reason = error instanceof Error ? error.message : String(error);
  const name = error instanceof Error ? error.name : 'Error';
  const isAbort = name === 'AbortError' || name === 'TimeoutError';

  return new ApiError(
    `${isAbort ? 'Request aborted' : 'Network request failed'}: ${method} ${url}: ${reason}`,
    {
      method,
      url,
      cause: error,
      details: error && typeof error === 'object' ? { name } : undefined,
    }
  );
}

export function isRetryableResponse(
  retryPolicy: RetryPolicy,
  method: keyof typeof HTTPMethod,
  status: HTTPStatusCodeNumber,
  retryAttempt: number,
  skipRetry: boolean | undefined
): boolean {
  return (
    !skipRetry &&
    retryPolicy.maxAttempts > 0 &&
    retryAttempt < retryPolicy.maxAttempts &&
    !!retryPolicy.retryStatusCodes?.includes(status) &&
    !!retryPolicy.retryMethods?.includes(method)
  );
}

export function getRetryDelay(
  retryPolicy: RetryPolicy,
  retryAttempt: number,
  response: Response
): { delay: number; usedRetryAfter: boolean } {
  const exponentialDelay = retryPolicy.baseDelayMs * 2 ** (retryAttempt - 1);

  if (!retryPolicy.respectRetryAfter) {
    return { delay: exponentialDelay, usedRetryAfter: false };
  }

  const retryAfterHeader =
    response.headers.get('Retry-After') || response.headers.get('retry-after');
  if (retryAfterHeader) {
    const parsed = parseInt(retryAfterHeader, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return { delay: parsed * 1000, usedRetryAfter: true };
    }
  }

  return { delay: exponentialDelay, usedRetryAfter: false };
}

export function recordSuccessfulRequest(
  logger: LoggerUtil,
  metrics: MetricsCollector,
  method: keyof typeof HTTPMethod,
  path: string,
  url: string,
  status: number,
  durationMs: number
): void {
  logger.info('HTTP request successful', { method, url, status, durationMs });

  metrics.collect({
    method,
    path,
    status,
    durationMs,
    timestamp: new Date().toISOString(),
    success: true,
  });
}

export function recordFailedRequest(
  logger: LoggerUtil,
  metrics: MetricsCollector,
  method: keyof typeof HTTPMethod,
  path: string,
  url: string,
  durationMs: number,
  error: unknown
): void {
  logger.error('HTTP request failed', error as Error, { method, url, durationMs });

  metrics.collect({
    method,
    path,
    status: error instanceof ApiError ? error.status : undefined,
    durationMs,
    timestamp: new Date().toISOString(),
    success: false,
    error: error instanceof Error ? error.message : String(error),
  });
}

/**
 * Re-applies auth to an existing AuthContext, cloning headers first so that
 * a fresh token overwrites the stale one from the previous attempt.
 */
export async function reapplyAuth(auth: AuthProvider, ctx: AuthContext): Promise<void> {
  const originalHeaders = ctx.init.headers;
  const clonedHeaders =
    typeof originalHeaders === 'object' &&
    !(originalHeaders instanceof Headers) &&
    !Array.isArray(originalHeaders)
      ? { ...(originalHeaders as Record<string, string>) }
      : originalHeaders;

  ctx.init = { ...ctx.init, headers: clonedHeaders };
  await auth.apply(ctx);
}

export function startRequestTimeout(
  timeoutMs: number | undefined,
  hasExternalSignal: boolean,
  controller: AbortController
): ReturnType<typeof setTimeout> | undefined {
  if (!timeoutMs || hasExternalSignal) return undefined;

  return setTimeout(() => {
    const timeoutError = new Error('Request timeout');
    timeoutError.name = 'TimeoutError';
    controller.abort(timeoutError);
  }, timeoutMs);
}
