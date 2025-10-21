import { z, ZodError } from 'zod';

export type Dictionary<T = unknown> = Record<string, T>;

export type FetchLike = (input: string | Request | URL, init?: RequestInit) => Promise<Response>;

export type BaseUrlMap = {
  default: string;
  [service: string]: string;
};

export type RetryStrategy = {
  maxRetries: number;
  /** milliseconds */
  baseDelayMs: number;
  /** Jitter factor 0..1 */
  jitter?: number;
  /** HTTP methods eligible for retry */
  retryMethods?: (keyof typeof HTTPMethod)[];
  /** Which status codes are retriable */
  shouldRetry?: (ctx: { attempt: number; error?: unknown; response?: Response }) => boolean;
};

export const HTTPMethod = {
  GET: 'GET',
  POST: 'POST',
  PUT: 'PUT',
  PATCH: 'PATCH',
  DELETE: 'DELETE',
  HEAD: 'HEAD',
  OPTIONS: 'OPTIONS',
} as const;

export type HttpMethod = keyof typeof HTTPMethod;

export type AfterResponseHook = (ctx: {
  request: Request;
  response: Response;
  parsed?: unknown;
}) => Promise<void> | void;

export type BeforeRequestHook = (ctx: { url: string; init: RequestInit }) => Promise<void> | void;

export interface Interceptors {
  beforeRequest?: BeforeRequestHook[];
  afterResponse?: AfterResponseHook[];
}

export interface TimeoutOptions {
  /** ms */
  requestTimeoutMs?: number;
}

export interface ClientOptions {
  baseUrls: BaseUrlMap;
  fetch?: FetchLike;
  headers?: Record<string, string>;
  retry?: RetryStrategy;
  interceptors?: Interceptors;
  timeout?: TimeoutOptions;
}

export type SafeParseResult<T> = { success: true; data: T } | { success: false; error: ZodError };

export class ApiError extends Error {
  public status?: number;
  public details?: unknown;
  public zodError?: ZodError;

  constructor(
    message: string,
    options?: { status?: number; cause?: unknown; details?: unknown; zodError?: ZodError }
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = options?.status;
    this.details = options?.details;
    this.cause = options?.cause as any;
    this.zodError = options?.zodError;
  }
}

export type Paginated<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};

export const PaginationSchema = z.object({
  items: z.array(z.unknown()),
  total: z.number().int().nonnegative(),
  page: z.number().int().nonnegative(),
  pageSize: z.number().int().positive(),
});

export type RequestOptions = {
  /** Override base URL for a single call */
  baseUrlKey?: keyof BaseUrlMap;
  /** Additional headers for this call only */
  headers?: Record<string, string>;
  /** Abort controller */
  signal?: AbortSignal;
  /** Custom query params */
  query?: URLSearchParams | Record<string, string | number | boolean | undefined>;
};

// Utility to build query strings
export function toQueryString(q?: RequestOptions['query']): string {
  if (!q) return '';
  if (q instanceof URLSearchParams) {
    const s = q.toString();
    return s ? `?${s}` : '';
  }
  const params = new URLSearchParams();
  Object.entries(q).forEach(([k, v]) => {
    if (v !== undefined) {
      params.append(k, String(v));
    }
  });
  const s = params.toString();
  return s ? `?${s}` : '';
}
