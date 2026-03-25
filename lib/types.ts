import { AuthProvider } from './auth';
import { Logger } from './logger';
import { MetricsCollector } from './metrics';

// ========================
// Standard Schema v1 Types
// ========================

/** The Standard Schema interface for validation libraries (Zod, Valibot, ArkType, etc.) */
export interface StandardSchemaV1<Input = unknown, Output = Input> {
  readonly '~standard': StandardSchemaV1.Props<Input, Output>;
}

export declare namespace StandardSchemaV1 {
  /** The Standard Schema properties interface. */
  export interface Props<Input = unknown, Output = Input> {
    readonly version: 1;
    readonly vendor: string;
    readonly validate: (value: unknown) => Result<Output> | Promise<Result<Output>>;
    readonly types?: Types<Input, Output> | undefined;
  }

  /** The result interface of the validate function. */
  export type Result<Output> = SuccessResult<Output> | FailureResult;

  /** The result interface if validation succeeds. */
  export interface SuccessResult<Output> {
    readonly value: Output;
    readonly issues?: undefined;
  }

  /** The result interface if validation fails. */
  export interface FailureResult {
    readonly issues: ReadonlyArray<Issue>;
  }

  /** The issue interface of the failure output. */
  export interface Issue {
    readonly message: string;
    readonly path?: ReadonlyArray<PropertyKey | PathSegment> | undefined;
  }

  /** The path segment interface of the issue. */
  export interface PathSegment {
    readonly key: PropertyKey;
  }

  /** The Standard types interface. */
  export interface Types<Input = unknown, Output = Input> {
    readonly input: Input;
    readonly output: Output;
  }

  /** Infers the input type of a Standard Schema. */
  export type InferInput<Schema extends StandardSchemaV1> = NonNullable<
    Schema['~standard']['types']
  >['input'];

  /** Infers the output type of a Standard Schema. */
  export type InferOutput<Schema extends StandardSchemaV1> = NonNullable<
    Schema['~standard']['types']
  >['output'];
}

/** Infers the input type of a Standard Schema. */
export type InferInput<Schema extends StandardSchemaV1> = StandardSchemaV1.InferInput<Schema>;

/** Infers the output type of a Standard Schema. */
export type InferOutput<Schema extends StandardSchemaV1> = StandardSchemaV1.InferOutput<Schema>;

/** A schema map where keys are HTTP status codes and values are Standard Schema validators. */
export type SchemaMap = Record<number, StandardSchemaV1>;

/** A Standard Schema or a map of status codes to schemas. */
export type ResponseSchema = StandardSchemaV1 | SchemaMap;

export type Dictionary<T> = Record<string, T>;

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
} & Record<string, string>;

/**
 * Configuration for retry behavior on failed requests.
 * Implements exponential backoff with optional jitter.
 *
 * @example
 * ```ts
 * {
 *   maxAttempts: 3,
 *   baseDelayMs: 1000,
 *   jitter: 0.2,
 *   retryMethods: ['GET', 'HEAD', 'PUT'],
 *   retryStatusCodes: [500, 502, 503, 504],
 *   retryNetworkErrors: true,
 *   respectRetryAfter: true,
 * }
 * ```
 */
export type RetryPolicy = {
  /** Maximum number of retry attempts */
  maxAttempts: number;
  /** Base delay in milliseconds (will be exponentially increased) */
  baseDelayMs: number;
  /** Jitter factor 0..1 to randomize delays and prevent thundering herd */
  jitter?: number;
  /** HTTP methods eligible for retry */
  retryMethods?: (keyof typeof HTTPMethod)[];
  /** HTTP status codes eligible for retry */
  retryStatusCodes?: HTTPStatusCodeNumber[];
  /** Whether to respect 'Retry-After' header if present in the response */
  respectRetryAfter?: boolean;
  /** Custom function to determine if a request should be retried */
  shouldRetry?: (ctx: {
    url: string;
    method: HttpMethod;
    status: HTTPStatusCodeNumber;
    attempt: number;
    response?: Response;
  }) => Promise<boolean> | boolean;
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

export const HTTPStatusCode = {
  // 1xx — Informational
  CONTINUE: 100,
  SWITCHING_PROTOCOLS: 101,
  PROCESSING: 102,
  EARLY_HINTS: 103,

  // 2xx — Success
  OK: 200,
  CREATED: 201,
  ACCEPTED: 202,
  NON_AUTHORITATIVE_INFORMATION: 203,
  NO_CONTENT: 204,
  RESET_CONTENT: 205,
  PARTIAL_CONTENT: 206,
  MULTI_STATUS: 207,
  ALREADY_REPORTED: 208,
  IM_USED: 226,

  // 3xx — Redirection
  MULTIPLE_CHOICES: 300,
  MOVED_PERMANENTLY: 301,
  FOUND: 302,
  SEE_OTHER: 303,
  NOT_MODIFIED: 304,
  USE_PROXY: 305,
  TEMPORARY_REDIRECT: 307,
  PERMANENT_REDIRECT: 308,

  // 4xx — Client Errors
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  PAYMENT_REQUIRED: 402,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  NOT_ACCEPTABLE: 406,
  PROXY_AUTHENTICATION_REQUIRED: 407,
  REQUEST_TIMEOUT: 408,
  CONFLICT: 409,
  GONE: 410,
  LENGTH_REQUIRED: 411,
  PRECONDITION_FAILED: 412,
  PAYLOAD_TOO_LARGE: 413,
  URI_TOO_LONG: 414,
  UNSUPPORTED_MEDIA_TYPE: 415,
  RANGE_NOT_SATISFIABLE: 416,
  EXPECTATION_FAILED: 417,
  IM_A_TEAPOT: 418,
  MISDIRECTED_REQUEST: 421,
  UNPROCESSABLE_ENTITY: 422,
  LOCKED: 423,
  FAILED_DEPENDENCY: 424,
  TOO_EARLY: 425,
  UPGRADE_REQUIRED: 426,
  PRECONDITION_REQUIRED: 428,
  TOO_MANY_REQUESTS: 429,
  REQUEST_HEADER_FIELDS_TOO_LARGE: 431,
  UNAVAILABLE_FOR_LEGAL_REASONS: 451,

  // 5xx — Server Errors
  INTERNAL_SERVER_ERROR: 500,
  NOT_IMPLEMENTED: 501,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504,
  HTTP_VERSION_NOT_SUPPORTED: 505,
  VARIANT_ALSO_NEGOTIATES: 506,
  INSUFFICIENT_STORAGE: 507,
  LOOP_DETECTED: 508,
  NOT_EXTENDED: 510,
  NETWORK_AUTHENTICATION_REQUIRED: 511,
} as const;

export type HTTPStatusCodeKey = keyof typeof HTTPStatusCode;
export type HTTPStatusCodeNumber = (typeof HTTPStatusCode)[HTTPStatusCodeKey];

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
 *   retry: { maxAttempts: 3, baseDelayMs: 1000 },
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
  retry?: RetryPolicy;
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
  /**
   * Callback to handle 401 Unauthorized responses.
   * Return true to retry the request (e.g. after refreshing tokens),
   * or false to return the 401 response as is.
   */
  onUnauthenticated?: (response: Response) => Promise<boolean> | boolean;
}

/** Result of a safe parse operation using Standard Schema. */
export type SafeParseResult<T> =
  | { success: true; data: T }
  | { success: false; issues: ReadonlyArray<StandardSchemaV1.Issue> };

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
  /** Validation issues from Standard Schema-compatible libraries (Zod, Valibot, ArkType, etc.) */
  public validationIssues?: ReadonlyArray<StandardSchemaV1.Issue>;

  constructor(
    message: string,
    options?: {
      status?: number;
      cause?: unknown;
      details?: unknown;
      validationIssues?: ReadonlyArray<StandardSchemaV1.Issue>;
    }
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = options?.status;
    this.details = options?.details;
    this.cause = options?.cause;
    this.validationIssues = options?.validationIssues;

    // Maintains proper stack trace for where error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ApiError);
    }
  }

  /**
   * Check if this is a validation error (has validationIssues)
   */
  isValidationError(): boolean {
    return !!this.validationIssues && this.validationIssues.length > 0;
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
      validationIssues: this.validationIssues,
      stack: this.stack,
    };
  }
}

/**
 * Error thrown when an endpoint receives a response with a status code
 * that has no defined schema in the endpoint configuration.
 */
export class SchemaDefinitionError extends Error {
  constructor(public status: number) {
    super(`No schema defined for status code ${status}`);
    this.name = 'SchemaDefinitionError';

    // Maintains proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, SchemaDefinitionError);
    }
  }
}

/** Generic paginated response type. */
export type Paginated<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};

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
  /** Skip authentication for this request */
  skipAuth?: boolean;
  /** Skip retry logic for this request */
  skipRetry?: boolean;
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

/**
 * Configuration for WebSocket endpoints.
 */
export type WSEndpointConfig<
  SendSchema extends StandardSchemaV1 | undefined = undefined,
  ReceiveSchema extends StandardSchemaV1 | undefined = undefined,
  QuerySchema extends StandardSchemaV1 | undefined = undefined,
  PathSchema extends StandardSchemaV1 | undefined = undefined,
> = {
  path: string | ((params: StandardSchemaV1.InferOutput<Exclude<PathSchema, undefined>>) => string);
  send?: SendSchema;
  receive?: ReceiveSchema;
  query?: QuerySchema;
  pathParams?: PathSchema;
  advanced?: {
    baseUrlKey?: string;
    skipAuth?: boolean;
    skipRequestValidation?: boolean;
    skipResponseValidation?: boolean;
  };
};

/**
 * Parameters for calling a WebSocket endpoint.
 */
export type WSEndpointCallParams<
  QuerySchema extends StandardSchemaV1 | undefined,
  PathSchema extends StandardSchemaV1 | undefined,
> = {
  query?: QuerySchema extends StandardSchemaV1 ? StandardSchemaV1.InferInput<QuerySchema> : never;
  pathParams?: PathSchema extends StandardSchemaV1
    ? StandardSchemaV1.InferInput<PathSchema>
    : never;
  headers?: Record<string, string>;
  protocols?: string | string[];
};

/**
 * Interface for a WebSocket connection with typed messages.
 */
export interface WSConnection<
  SendSchema extends StandardSchemaV1 | undefined,
  ReceiveSchema extends StandardSchemaV1 | undefined,
> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  send(
    data: SendSchema extends StandardSchemaV1 ? StandardSchemaV1.InferInput<SendSchema> : any
  ): void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(
    event: 'message',
    handler: (
      data: ReceiveSchema extends StandardSchemaV1
        ? StandardSchemaV1.InferOutput<ReceiveSchema>
        : any
    ) => void
  ): void;
  on(event: 'open', handler: () => void): void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(event: 'close', handler: (event: any) => void): void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(event: 'error', handler: (event: any) => void): void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(event: string, handler: (data: any) => void): void;
  off(event: string, handler: Function): void;
  close(code?: number, reason?: string): void;
  readonly readyState: number;
}

export type WSEndpointCall<
  SendSchema extends StandardSchemaV1 | undefined,
  ReceiveSchema extends StandardSchemaV1 | undefined,
  QuerySchema extends StandardSchemaV1 | undefined,
  PathSchema extends StandardSchemaV1 | undefined,
> = (
  params?: WSEndpointCallParams<QuerySchema, PathSchema>
) => WSConnection<SendSchema, ReceiveSchema>;

/**
 * Configuration for SSE endpoints.
 */
export type SSEEndpointConfig<
  ResSchema extends StandardSchemaV1 | undefined = undefined,
  QuerySchema extends StandardSchemaV1 | undefined = undefined,
  PathSchema extends StandardSchemaV1 | undefined = undefined,
> = {
  path: string | ((params: StandardSchemaV1.InferOutput<Exclude<PathSchema, undefined>>) => string);
  response?: ResSchema;
  query?: QuerySchema;
  pathParams?: PathSchema;
  advanced?: {
    baseUrlKey?: string;
    skipAuth?: boolean;
    skipResponseValidation?: boolean;
    withCredentials?: boolean;
  };
};

/**
 * Parameters for calling an SSE endpoint.
 */
export type SSEEndpointCallParams<
  QuerySchema extends StandardSchemaV1 | undefined,
  PathSchema extends StandardSchemaV1 | undefined,
> = {
  query?: QuerySchema extends StandardSchemaV1 ? StandardSchemaV1.InferInput<QuerySchema> : never;
  pathParams?: PathSchema extends StandardSchemaV1
    ? StandardSchemaV1.InferInput<PathSchema>
    : never;
};

/**
 * Interface for an SSE connection with typed messages.
 */
export interface SSEConnection<ResSchema extends StandardSchemaV1 | undefined> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(
    event: 'message',
    handler: (
      data: ResSchema extends StandardSchemaV1 ? StandardSchemaV1.InferOutput<ResSchema> : any
    ) => void
  ): void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(event: 'open', handler: (event: any) => void): void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(event: 'error', handler: (event: any) => void): void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(event: string, handler: (data: any) => void): void;
  off(event: string, handler: Function): void;
  close(): void;
  readonly readyState: number;
}

export type SSEEndpointCall<
  ResSchema extends StandardSchemaV1 | undefined,
  QuerySchema extends StandardSchemaV1 | undefined,
  PathSchema extends StandardSchemaV1 | undefined,
> = (params?: SSEEndpointCallParams<QuerySchema, PathSchema>) => SSEConnection<ResSchema>;
