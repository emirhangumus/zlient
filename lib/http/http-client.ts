import type { AuthProvider } from '../auth';
import { NoAuth } from '../auth';
import { LoggerUtil, NoOpLogger } from '../logger';
import { MetricsCollector, NoOpMetricsCollector } from '../metrics';
import { SSEEndpointImpl } from '../sse/sse-endpoint';
import {
  ApiError,
  ClientOptions,
  FetchLike,
  HTTPMethod,
  HTTPStatusCodeNumber,
  Interceptors,
  RequestOptions,
  ResponseSchema,
  RetryPolicy,
  SSEEndpointCall,
  SSEEndpointConfig,
  SSEResponseSchema,
  StandardSchemaV1,
  toQueryString,
  WSEndpointCall,
  WSEndpointConfig,
} from '../types';
import { WSEndpointImpl } from '../ws/ws-endpoint';
import { EndpointCall, EndpointConfig, EndpointImpl } from './http-endpoint';

/**
 * HTTP client with built-in authentication, and interceptors.
 * Supports multiple base URLs, type-safe requests, and comprehensive error handling.
 *
 * @example
 * ```ts
 * const client = new HttpClient({
 *   baseUrls: { default: 'https://api.example.com' },
 *   headers: { 'Content-Type': 'application/json' },
 *   timeout: { requestTimeoutMs: 30000 }
 * });
 *
 * const { data } = await client.request('GET', '/users', undefined, { query: { page: 1 } });
 * ```
 */
export class HttpClient {
  private fetchImpl: FetchLike;
  private baseUrls: ClientOptions['baseUrls'];
  private headers: Record<string, string>;
  private interceptors: Interceptors;
  private retryPolicy: RetryPolicy;
  private timeoutMs?: number;
  private auth: AuthProvider;
  private logger: LoggerUtil;
  private metrics: MetricsCollector;
  private onUnauthenticated?: (response: Response) => Promise<boolean> | boolean;

  /**
   * Creates a new HTTP client instance.
   *
   * @param opts - Client configuration options
   * @throws {Error} If no fetch implementation is available
   */
  constructor(opts: ClientOptions) {
    this.fetchImpl = opts.fetch ?? (globalThis.fetch?.bind(globalThis) as FetchLike);
    if (!this.fetchImpl)
      throw new Error('No fetch implementation found. Pass one via options.fetch.');

    // Validate baseUrls configuration
    if (!opts.baseUrls || typeof opts.baseUrls !== 'object') {
      throw new Error('baseUrls must be provided and must be an object');
    }
    if (!opts.baseUrls.default) {
      throw new Error('baseUrls must include a "default" key');
    }

    this.baseUrls = opts.baseUrls;
    this.headers = opts.headers ?? { 'Content-Type': 'application/json' };
    this.interceptors = opts.interceptors ?? {};

    this.retryPolicy = opts.retry ?? { maxAttempts: 0, baseDelayMs: 1000 };

    // Validate retry policy
    if (!Number.isFinite(this.retryPolicy.maxAttempts) || this.retryPolicy.maxAttempts < 0) {
      throw new Error('retry.maxAttempts must be a non-negative finite number');
    }
    if (this.retryPolicy.baseDelayMs < 0) {
      throw new Error('retry.baseDelayMs must be non-negative');
    }

    this.timeoutMs = opts.timeout?.requestTimeoutMs;
    if (this.timeoutMs !== undefined && this.timeoutMs < 0) {
      throw new Error('timeout.requestTimeoutMs must be non-negative');
    }

    this.auth = opts['auth'] ?? new NoAuth();
    this.logger = new LoggerUtil(opts.logger ?? new NoOpLogger());
    this.metrics = opts.metrics ?? new NoOpMetricsCollector();
    this.onUnauthenticated = opts.onUnauthenticated;
  }

  /**
   * Set or update the authentication provider.
   *
   * @param auth - Authentication provider instance
   * @example
   * ```ts
   * client.setAuth(new BearerTokenAuth(() => getToken()));
   * ```
   */
  setAuth(auth: AuthProvider) {
    this.auth = auth;
  }

  private resolveBaseUrl(key?: keyof typeof this.baseUrls) {
    const k: string = (key as string) || 'default';
    const url = this.baseUrls[k];
    if (!url) {
      const availableKeys = Object.keys(this.baseUrls).join(', ');
      throw new Error(`Unknown baseUrl key: "${k}". Available keys: ${availableKeys}`);
    }
    return url.replace(/\/$/, '');
  }

  /**
   * Run all registered before-request hooks.
   * @private
   */
  private async runBeforeHooks(url: string, init: RequestInit & { __urlOverride?: string }) {
    for (const h of this.interceptors.beforeRequest ?? []) {
      await h({ url, init });
    }
  }

  /**
   * Run all registered after-response hooks.
   * @private
   */
  private async runAfterHooks(req: Request, res: Response, parsed?: unknown) {
    for (const h of this.interceptors.afterResponse ?? []) {
      await h({ request: req, response: res, parsed });
    }
  }

  private getResponseMessage(details: unknown): string | undefined {
    if (typeof details === 'string') return details.trim() || undefined;
    if (!details || typeof details !== 'object') return undefined;

    const record = details as Record<string, unknown>;
    for (const key of ['message', 'error', 'title', 'detail']) {
      const value = record[key];
      if (typeof value === 'string' && value.trim()) return value;
    }

    return undefined;
  }

  private async parseResponseData(
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

      if (
        contentType.includes('application/octet-stream') ||
        contentType.includes('application/pdf') ||
        contentType.includes('image/') ||
        contentType.includes('video/') ||
        contentType.includes('audio/') ||
        contentType.startsWith('application/zip') ||
        contentType.startsWith('application/x-')
      ) {
        // Return binary data as Blob for file downloads
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

  private createStatusError(
    method: keyof typeof HTTPMethod,
    url: string,
    res: Response,
    details: unknown
  ) {
    const statusText = res.statusText ? ` ${res.statusText}` : '';
    const responseMessage = this.getResponseMessage(details);
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

  private createNetworkError(method: keyof typeof HTTPMethod, url: string, error: unknown) {
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

  /**
   * Get all configured base URLs.
   *
   * @returns Object mapping base URL keys to their resolved URLs
   */
  public getBaseUrls() {
    return this.baseUrls;
  }

  /**
   * Get the resolved base URL for a given key.
   *
   * @param key - Base URL key (defaults to 'default' if not provided)
   * @returns Resolved base URL string
   */
  public getBaseUrl(key: string) {
    return this.resolveBaseUrl(key);
  }

  /** @internal */
  public getAuth() {
    return this.auth;
  }

  /** @internal */
  public getHeaders() {
    return this.headers;
  }

  /** @internal */
  public getLogger() {
    return this.logger;
  }

  /**
   * Make an HTTP request with automatic retry, authentication, and validation.
   *
   * @param method - HTTP method (GET, POST, PUT, etc.)
   * @param path - Request path (will be appended to base URL)
   * @param body - Request body (will be JSON.stringify'd if Content-Type is json)
   * @param options - Additional request options (headers, query params, etc.)
   * @returns Promise resolving to response data and Response object
   * @throws {ApiError} If request fails or response validation fails
   *
   * @example
   * ```ts
   * const { data, response } = await client.request('GET', '/users', undefined, {
   *   query: { page: 1, limit: 10 },
   *   headers: { 'X-Custom': 'value' }
   * });
   * ```
   */
  async request<T = unknown>(
    method: keyof typeof HTTPMethod,
    path: string,
    body?: unknown,
    options?: RequestOptions
  ): Promise<{ data: T; status: HTTPStatusCodeNumber }> {
    const startTime = Date.now();
    const base = this.resolveBaseUrl(options?.baseUrlKey);
    let url = `${base}${path}${toQueryString(options?.query)}`;

    this.logger.debug('HTTP request initiated', {
      method,
      path,
      baseUrlKey: options?.baseUrlKey,
      hasBody: body !== undefined,
    });

    const headers = { ...this.headers, ...(options?.headers ?? {}) };

    const controller = new AbortController();
    const signal = options?.signal ?? controller.signal;

    // Handle FormData, Blob, ArrayBuffer: pass through without stringifying
    let requestBody: BodyInit | undefined;
    if (body != null) {
      if (body instanceof FormData) {
        requestBody = body;
        // Remove Content-Type header so browser can set it with proper boundary
        delete headers['Content-Type'];
      } else if (body instanceof Blob || body instanceof ArrayBuffer) {
        requestBody = body;
      } else if (headers['Content-Type']?.includes('json')) {
        requestBody = JSON.stringify(body);
      } else {
        requestBody = String(body);
      }
    }

    const init: RequestInit & { __urlOverride?: string } = {
      method,
      headers,
      body: requestBody,
      signal,
    };

    if (!options?.skipAuth) {
      await this.auth.apply({ url, init, options });
    }
    if (init.__urlOverride) url = init.__urlOverride;
    await this.runBeforeHooks(url, init);
    // Track refresh attempts to prevent infinite loops
    let refreshAttempted = false;
    let retryAttempt = 0;

    const doFetch = async () => {
      // Loop for potential token refresh retry
      while (true) {
        // Apply timeout if configured
        let timeoutId: number | undefined;
        if (this.timeoutMs && !options?.signal) {
          timeoutId = setTimeout(() => {
            const timeoutError = new Error('Request timeout');
            timeoutError.name = 'TimeoutError';
            controller.abort(timeoutError);
          }, this.timeoutMs);
        }

        try {
          // Re-apply auth headers if this is a retry (unless skipAuth is set)
          if (refreshAttempted && !options?.skipAuth) {
            const freshInit = {
              ...init,
              headers:
                typeof init.headers === 'object' &&
                !(init.headers instanceof Headers) &&
                !Array.isArray(init.headers)
                  ? { ...(init.headers as Record<string, string>) }
                  : init.headers,
            };
            // We need to re-run apply to get new token
            await this.auth.apply({ url, init: freshInit, options });
            // Update headers with potentially new token
            init.headers = freshInit.headers;
          }

          const req = new Request(url, init);

          let res: Response;
          try {
            res = await this.fetchImpl(req);
          } catch (error) {
            throw this.createNetworkError(method, url, error);
          }

          if (res.status === 401 && this.onUnauthenticated && !refreshAttempted) {
            const shouldRetry = await this.onUnauthenticated(res.clone() as unknown as Response);
            if (shouldRetry) {
              refreshAttempted = true;
              // Clear timeout before retrying
              if (timeoutId) clearTimeout(timeoutId);
              continue;
            }
          }

          const status = res.status as HTTPStatusCodeNumber;

          // Check for errors first
          if (!res.ok) {
            if (
              !options?.skipRetry &&
              this.retryPolicy.maxAttempts > 0 &&
              retryAttempt < this.retryPolicy.maxAttempts &&
              this.retryPolicy.retryStatusCodes?.includes(status) &&
              this.retryPolicy.retryMethods?.includes(method)
            ) {
              let shouldRetry = true;
              if (this.retryPolicy.shouldRetry) {
                shouldRetry = await this.retryPolicy.shouldRetry({
                  url,
                  method,
                  status,
                  attempt: retryAttempt,
                  response: res.clone() as unknown as Response,
                });
              }
              if (shouldRetry) {
                retryAttempt++;
                let delay = this.retryPolicy.baseDelayMs * 2 ** (retryAttempt - 1);
                if (this.retryPolicy.respectRetryAfter) {
                  const retryAfter =
                    res.headers.get('Retry-After') || res.headers.get('retry-after');
                  if (retryAfter) {
                    delay = parseInt(retryAfter, 10) * 1000;
                    this.logger.warn(
                      `Request failed with status ${status}. Retrying after ${delay}ms due to Retry-After header...`,
                      { method, url, status, retryAttempt: retryAttempt + 1 }
                    );
                  }
                } else {
                  this.logger.warn(
                    `Request failed with status ${status}. Retrying attempt ${retryAttempt} after ${delay}ms...`,
                    { method, url, status, retryAttempt }
                  );
                }
                await new Promise((resolve) => setTimeout(resolve, delay));
                continue;
              }
            }
          }

          // Handle different response types appropriately
          const data = await this.parseResponseData(res, method, url);

          await this.runAfterHooks(new Request(url, init), res, data);

          if (!res.ok) {
            throw this.createStatusError(method, url, res, data);
          }

          const duration = Date.now() - startTime;
          this.logger.info('HTTP request successful', {
            method,
            url,
            status: res.status,
            durationMs: duration,
          });

          this.metrics.collect({
            method,
            path,
            status: res.status,
            durationMs: duration,
            timestamp: new Date().toISOString(),
            success: true,
          });

          return { data: data as T, status: status };
        } catch (error) {
          const duration = Date.now() - startTime;
          this.logger.error('HTTP request failed', error as Error, {
            method,
            url,
            durationMs: duration,
          });

          this.metrics.collect({
            method,
            path,
            status: error instanceof ApiError ? error.status : undefined,
            durationMs: duration,
            timestamp: new Date().toISOString(),
            success: false,
            error: error instanceof Error ? error.message : String(error),
          });

          throw error;
        } finally {
          if (timeoutId) clearTimeout(timeoutId);
        }
      }
    };

    return doFetch();
  }

  /**
   * Convenience method for GET requests.
   *
   * @example
   * ```ts
   * const { data } = await client.get('/users', { query: { page: 1 } });
   * ```
   */
  async get<T = unknown>(
    path: string,
    options?: RequestOptions
  ): Promise<{ data: T; status: HTTPStatusCodeNumber }> {
    return this.request<T>('GET', path, undefined, options);
  }

  /**
   * Convenience method for POST requests.
   *
   * @example
   * ```ts
   * const { data } = await client.post('/users', { name: 'John' });
   * ```
   */
  async post<T = unknown>(
    path: string,
    body?: unknown,
    options?: RequestOptions
  ): Promise<{ data: T; status: HTTPStatusCodeNumber }> {
    return this.request<T>('POST', path, body, options);
  }

  /**
   * Convenience method for PUT requests.
   *
   * @example
   * ```ts
   * const { data } = await client.put('/users/1', { name: 'John Updated' });
   * ```
   */
  async put<T = unknown>(
    path: string,
    body?: unknown,
    options?: RequestOptions
  ): Promise<{ data: T; status: HTTPStatusCodeNumber }> {
    return this.request<T>('PUT', path, body, options);
  }

  /**
   * Convenience method for PATCH requests.
   *
   * @example
   * ```ts
   * const { data } = await client.patch('/users/1', { name: 'John' });
   * ```
   */
  async patch<T = unknown>(
    path: string,
    body?: unknown,
    options?: RequestOptions
  ): Promise<{ data: T; status: HTTPStatusCodeNumber }> {
    return this.request<T>('PATCH', path, body, options);
  }

  /**
   * Convenience method for DELETE requests.
   *
   * @example
   * ```ts
   * const { data } = await client.delete('/users/1');
   * ```
   */
  async delete<T = unknown>(
    path: string,
    options?: RequestOptions
  ): Promise<{ data: T; status: HTTPStatusCodeNumber }> {
    return this.request<T>('DELETE', path, undefined, options);
  }

  /**
   * Create a strongly-typed endpoint builder.
   * Works with any Standard Schema-compatible library (Zod, Valibot, ArkType, etc.)
   *
   * @param config - Endpoint configuration with schemas
   * @returns Endpoint call function
   *
   * @example
   * ```ts
   * // With Zod
   * import { z } from 'zod';
   * const getUser = client.createEndpoint({
   *   method: 'GET',
   *   path: '/users/:id',
   *   response: z.object({ id: z.string(), name: z.string() }),
   *   pathParams: z.object({ id: z.string() }),
   * });
   *
   * // With Valibot
   * import * as v from 'valibot';
   * const getUser = client.createEndpoint({
   *   method: 'GET',
   *   path: '/users/:id',
   *   response: v.object({ id: v.string(), name: v.string() }),
   *   pathParams: v.object({ id: v.string() }),
   * });
   * ```
   */
  createEndpoint<
    ResSchema extends ResponseSchema,
    ReqSchema extends StandardSchemaV1 | undefined = undefined,
    QuerySchema extends StandardSchemaV1 | undefined = undefined,
    PathSchema extends StandardSchemaV1 | undefined = undefined,
    MustHeaderKeys extends readonly string[] = readonly [],
  >(
    config: EndpointConfig<ResSchema, ReqSchema, QuerySchema, PathSchema, MustHeaderKeys>
  ): EndpointCall<ResSchema, ReqSchema, QuerySchema, PathSchema, MustHeaderKeys> {
    const endpoint = new EndpointImpl(this, config);
    return (params) => endpoint.call(params);
  }

  /**
   * Create a strongly-typed WebSocket endpoint builder.
   *
   * @param config - WebSocket endpoint configuration
   * @returns WebSocket endpoint call function
   */
  createWebSocket<
    SendSchema extends StandardSchemaV1 | undefined = undefined,
    ReceiveSchema extends StandardSchemaV1 | undefined = undefined,
    QuerySchema extends StandardSchemaV1 | undefined = undefined,
    PathSchema extends StandardSchemaV1 | undefined = undefined,
  >(
    config: WSEndpointConfig<SendSchema, ReceiveSchema, QuerySchema, PathSchema>
  ): WSEndpointCall<SendSchema, ReceiveSchema, QuerySchema, PathSchema> {
    const endpoint = new WSEndpointImpl(this, config);
    return endpoint.createCall();
  }

  /**
   * Create a strongly-typed Server-Sent Events (SSE) endpoint builder.
   *
   * @param config - SSE endpoint configuration
   * @returns SSE endpoint call function
   */
  createSSE<
    ResSchema extends SSEResponseSchema | undefined = undefined,
    ReqSchema extends StandardSchemaV1 | undefined = undefined,
    QuerySchema extends StandardSchemaV1 | undefined = undefined,
    PathSchema extends StandardSchemaV1 | undefined = undefined,
  >(
    config: SSEEndpointConfig<ResSchema, ReqSchema, QuerySchema, PathSchema>
  ): SSEEndpointCall<ResSchema, ReqSchema, QuerySchema, PathSchema> {
    const endpoint = new SSEEndpointImpl(this, config);
    return endpoint.createCall();
  }
}
