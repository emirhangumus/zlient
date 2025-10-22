import { z, ZodError } from 'zod';
import { AuthProvider } from './auth';
import { Logger } from './logger';
import { MetricsCollector } from './metrics';

export type Dictionary<T = unknown> = Record<string, T>;

export type FetchLike = (input: string | Request | URL, init?: RequestInit) => Promise<Response>;

/**
 * Map of base URLs for different services.
 * The 'default' key is required and used when no specific key is provided.
 * 
 * @example
 * ```ts
 * {
 *   default: 'https://api.example.com',
 *   auth: 'https://auth.example.com',
 *   cdn: 'https://cdn.example.com'
 * }
 * ```
 */
export type BaseUrlMap = {
  default: string;
  [service: string]: string;
};

/**
 * Configuration for retry behavior on failed requests.
 * Implements exponential backoff with optional jitter.
 * 
 * @example
 * ```ts
 * {
 *   maxRetries: 3,
 *   baseDelayMs: 1000,
 *   jitter: 0.2,
 *   retryMethods: ['GET', 'HEAD', 'PUT']
 * }
 * ```
 */
export type RetryStrategy = {
  /** Maximum number of retry attempts */
  maxRetries: number;
  /** Base delay in milliseconds (will be exponentially increased) */
  baseDelayMs: number;
  /** Jitter factor 0..1 to randomize delays and prevent thundering herd */
  jitter?: number;
  /** HTTP methods eligible for retry */
  retryMethods?: (keyof typeof HTTPMethod)[];
  /** Custom function to determine if a request should be retried */
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

/**
 * Hook called after a response is received and parsed.
 * Useful for logging, metrics, or global error handling.
 */
export type AfterResponseHook = (ctx: {
  request: Request;
  response: Response;
  parsed?: unknown;
}) => Promise<void> | void;

/**
 * Hook called before a request is sent.
 * Useful for logging, adding headers, or modifying the request.
 */
export type BeforeRequestHook = (ctx: { url: string; init: RequestInit }) => Promise<void> | void;

export interface Interceptors {
  /** Hooks executed before each request is sent */
  beforeRequest?: BeforeRequestHook[];
  /** Hooks executed after each response is received */
  afterResponse?: AfterResponseHook[];
}

export interface TimeoutOptions {
  /** Request timeout in milliseconds */
  requestTimeoutMs?: number;
}

/**
 * Configuration options for the HTTP client.
 * 
 * @example
 * ```ts
 * const options: ClientOptions = {
 *   baseUrls: { default: 'https://api.example.com' },
 *   headers: { 'X-API-Version': '1.0' },
 *   retry: { maxRetries: 3, baseDelayMs: 1000 },
 *   timeout: { requestTimeoutMs: 30000 }
 * }
 * ```
 */
export interface ClientOptions {
  /** Map of base URLs for different services */
  baseUrls: BaseUrlMap;
  /** Custom fetch implementation (defaults to globalThis.fetch) */
  fetch?: FetchLike;
  /** Default headers applied to all requests */
  headers?: Record<string, string>;
  /** Retry strategy configuration */
  retry?: RetryStrategy;
  /** Request/response interceptors */
  interceptors?: Interceptors;
  /** Timeout configuration */
  timeout?: TimeoutOptions;
  /** Authentication provider */
  auth?: AuthProvider;
  /** Logger instance */
  logger?: Logger;
  /** Metrics collector */
  metrics?: MetricsCollector;
}

export type SafeParseResult<T> = { success: true; data: T } | { success: false; error: ZodError };

/**
 * Custom error class for API-related errors.
 * Includes HTTP status codes, response details, and validation errors.
 * 
 * @example
 * ```ts
 * throw new ApiError('Invalid request', {
 *   status: 400,
 *   details: { field: 'email', message: 'Invalid format' }
 * });
 * ```
 */
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

    // Maintains proper stack trace for where error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ApiError);
    }
  }

  /**
   * Check if this is a validation error (has zodError)
   */
  isValidationError(): boolean {
    return !!this.zodError;
  }

  /**
   * Check if this is a client error (4xx status)
   */
  isClientError(): boolean {
    return !!this.status && this.status >= 400 && this.status < 500;
  }

  /**
   * Check if this is a server error (5xx status)
   */
  isServerError(): boolean {
    return !!this.status && this.status >= 500;
  }

  /**
   * Get a formatted error message with all available details
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      status: this.status,
      details: this.details,
      zodError: this.zodError?.issues,
      stack: this.stack,
    };
  }
}

export type Paginated<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};

/**
 * Schema for paginated responses
 */
export const PaginationSchema = z.object({
  items: z.array(z.unknown()),
  total: z.number().int().nonnegative(),
  page: z.number().int().nonnegative(),
  pageSize: z.number().int().positive(),
});

/**
 * Options that can be passed to individual requests to override defaults.
 * 
 * @example
 * ```ts
 * await endpoint.call(data, {
 *   baseUrlKey: 'v2',
 *   headers: { 'X-Custom': 'value' },
 *   query: { filter: 'active' }
 * });
 * ```
 */
export type RequestOptions = {
  /** Override base URL for a single call */
  baseUrlKey?: keyof BaseUrlMap;
  /** Additional headers for this call only */
  headers?: Record<string, string>;
  /** Abort controller signal for cancellation */
  signal?: AbortSignal;
  /** Custom query params */
  query?: URLSearchParams | Record<string, string | number | boolean | undefined>;
};

/**
 * Converts query parameters to a URL query string.
 * Filters out undefined values automatically.
 * 
 * @param q - Query parameters as URLSearchParams or object
 * @returns Query string with leading '?' or empty string
 * 
 * @example
 * ```ts
 * toQueryString({ page: 1, filter: 'active' }) // "?page=1&filter=active"
 * toQueryString({ optional: undefined }) // ""
 * ```
 */
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
