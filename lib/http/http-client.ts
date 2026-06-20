import type { AuthContext, AuthProvider } from '../auth';
import { NoAuth } from '../auth';
import { LoggerUtil, NoOpLogger } from '../logger';
import { MetricsCollector, NoOpMetricsCollector } from '../metrics';
import { SSEEndpointImpl } from '../sse/sse-endpoint';
import {
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
import {
  createNetworkError,
  createStatusError,
  getRetryDelay,
  isRetryableResponse,
  parseResponseData,
  reapplyAuth,
  recordFailedRequest,
  recordSuccessfulRequest,
  serializeRequestBody,
  startRequestTimeout,
} from './request-utils';

/**
 * HTTP client with built-in authentication, retry, and interceptors.
 * Supports multiple base URLs, type-safe requests, and comprehensive error handling.
 *
 * @example
 * ```ts
 * const client = new HttpClient({
 *   baseUrls: { default: 'https://api.example.com' },
 *   headers: { 'Content-Type': 'application/json' },
 *   timeout: { requestTimeoutMs: 30000 }
 * });
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

  constructor(opts: ClientOptions) {
    this.fetchImpl = opts.fetch ?? (globalThis.fetch?.bind(globalThis) as FetchLike);
    if (!this.fetchImpl)
      throw new Error('No fetch implementation found. Pass one via options.fetch.');

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

    this.auth = opts.auth ?? new NoAuth();
    this.logger = new LoggerUtil(opts.logger ?? new NoOpLogger());
    this.metrics = opts.metrics ?? new NoOpMetricsCollector();
    this.onUnauthenticated = opts.onUnauthenticated;
  }

  /** Set or update the authentication provider at runtime. */
  setAuth(auth: AuthProvider) {
    this.auth = auth;
  }

  private resolveBaseUrl(key?: string) {
    const k = key || 'default';
    const url = this.baseUrls[k];
    if (!url) {
      const availableKeys = Object.keys(this.baseUrls).join(', ');
      throw new Error(`Unknown baseUrl key: "${k}". Available keys: ${availableKeys}`);
    }
    return url.replace(/\/$/, '');
  }

  private async runBeforeHooks(url: string, init: RequestInit) {
    for (const h of this.interceptors.beforeRequest ?? []) {
      await h({ url, init });
    }
  }

  private async runAfterHooks(req: Request, res: Response, parsed?: unknown) {
    for (const h of this.interceptors.afterResponse ?? []) {
      await h({ request: req, response: res, parsed });
    }
  }

  // ── Retry helpers ──────────────────────────────────────────────────────────

  /**
   * Returns retry info if the response should be retried, or null if not.
   */
  private async getRetryInfo(
    res: Response,
    url: string,
    method: keyof typeof HTTPMethod,
    status: HTTPStatusCodeNumber,
    attempt: number,
    skipRetry: boolean | undefined
  ): Promise<{ delay: number; usedRetryAfter: boolean } | null> {
    if (!isRetryableResponse(this.retryPolicy, method, status, attempt, skipRetry)) {
      return null;
    }
    if (this.retryPolicy.shouldRetry) {
      const ok = await this.retryPolicy.shouldRetry({
        url,
        method,
        status,
        attempt,
        response: res.clone(),
      });
      if (!ok) return null;
    }
    return getRetryDelay(this.retryPolicy, attempt + 1, res);
  }

  private logRetry(
    method: keyof typeof HTTPMethod,
    url: string,
    status: HTTPStatusCodeNumber,
    attempt: number,
    info: { delay: number; usedRetryAfter: boolean }
  ) {
    const suffix = info.usedRetryAfter ? 'due to Retry-After header' : `attempt ${attempt}`;
    this.logger.warn(
      `Request failed with status ${status}. Retrying ${suffix} after ${info.delay}ms...`,
      { method, url, status, retryAttempt: attempt }
    );
  }

  /**
   * Checks whether the 401 response should trigger a token refresh + retry.
   */
  private async shouldRefresh(res: Response, refreshAttempted: boolean): Promise<boolean> {
    if (res.status !== 401 || !this.onUnauthenticated || refreshAttempted) {
      return false;
    }
    return this.onUnauthenticated(res.clone());
  }

  // ── Public accessors (used by endpoint implementations) ────────────────────

  public getBaseUrls() {
    return this.baseUrls;
  }

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

  /** @internal */
  public getFetch() {
    return this.fetchImpl;
  }

  // ── Core request method ────────────────────────────────────────────────────

  /**
   * Make an HTTP request with automatic retry, authentication, and validation.
   *
   * @example
   * ```ts
   * const { data } = await client.request('GET', '/users', undefined, {
   *   query: { page: 1 },
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
    const headers = { ...this.headers, ...(options?.headers ?? {}) };
    const controller = new AbortController();
    const signal = options?.signal ?? controller.signal;

    this.logger.debug('HTTP request initiated', {
      method,
      path,
      baseUrlKey: options?.baseUrlKey,
      hasBody: body !== undefined,
    });

    const init: RequestInit = {
      method,
      headers,
      body: serializeRequestBody(body, headers),
      signal,
    };

    const authCtx: AuthContext = {
      url: `${base}${path}${toQueryString(options?.query)}`,
      init,
      options,
    };

    if (!options?.skipAuth) {
      await this.auth.apply(authCtx);
    }

    await this.runBeforeHooks(authCtx.url, authCtx.init);

    let refreshAttempted = false;
    let retryAttempt = 0;

    while (true) {
      const timeoutId = startRequestTimeout(this.timeoutMs, !!options?.signal, controller);

      try {
        if (refreshAttempted && !options?.skipAuth) {
          await reapplyAuth(this.auth, authCtx);
        }

        const req = new Request(authCtx.url, authCtx.init);

        let res: Response;
        try {
          res = await this.fetchImpl(req);
        } catch (err) {
          throw createNetworkError(method, authCtx.url, err);
        }

        if (await this.shouldRefresh(res, refreshAttempted)) {
          refreshAttempted = true;
          if (timeoutId) clearTimeout(timeoutId);
          continue;
        }

        const status = res.status as HTTPStatusCodeNumber;

        if (!res.ok) {
          const retryInfo = await this.getRetryInfo(
            res,
            authCtx.url,
            method,
            status,
            retryAttempt,
            options?.skipRetry
          );
          if (retryInfo) {
            retryAttempt++;
            this.logRetry(method, authCtx.url, status, retryAttempt, retryInfo);
            await new Promise((resolve) => setTimeout(resolve, retryInfo.delay));
            continue;
          }
        }

        const data = await parseResponseData(res, method, authCtx.url);
        await this.runAfterHooks(new Request(authCtx.url, authCtx.init), res, data);

        if (!res.ok) {
          throw createStatusError(method, authCtx.url, res, data);
        }

        recordSuccessfulRequest(
          this.logger,
          this.metrics,
          method,
          path,
          authCtx.url,
          res.status,
          Date.now() - startTime
        );

        return { data: data as T, status };
      } catch (error) {
        recordFailedRequest(
          this.logger,
          this.metrics,
          method,
          path,
          authCtx.url,
          Date.now() - startTime,
          error
        );
        throw error;
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
      }
    }
  }

  // ── Convenience methods ────────────────────────────────────────────────────

  async get<T = unknown>(path: string, options?: RequestOptions) {
    return this.request<T>('GET', path, undefined, options);
  }

  async post<T = unknown>(path: string, body?: unknown, options?: RequestOptions) {
    return this.request<T>('POST', path, body, options);
  }

  async put<T = unknown>(path: string, body?: unknown, options?: RequestOptions) {
    return this.request<T>('PUT', path, body, options);
  }

  async patch<T = unknown>(path: string, body?: unknown, options?: RequestOptions) {
    return this.request<T>('PATCH', path, body, options);
  }

  async delete<T = unknown>(path: string, options?: RequestOptions) {
    return this.request<T>('DELETE', path, undefined, options);
  }

  // ── Endpoint factories ─────────────────────────────────────────────────────

  /**
   * Create a strongly-typed HTTP endpoint.
   * Works with any Standard Schema-compatible library (Zod, Valibot, ArkType, etc.)
   *
   * @example
   * ```ts
   * const getUser = client.createEndpoint({
   *   method: 'GET',
   *   path: '/users/:id',
   *   response: z.object({ id: z.string(), name: z.string() }),
   *   pathParams: z.object({ id: z.string() }),
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
   * Create a strongly-typed WebSocket endpoint.
   *
   * @example
   * ```ts
   * const chat = client.createWebSocket({
   *   path: '/ws/chat',
   *   send: z.object({ text: z.string() }),
   *   receive: z.object({ text: z.string(), user: z.string() }),
   * });
   * const conn = await chat();
   * ```
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
   * Create a strongly-typed Server-Sent Events endpoint.
   *
   * @example
   * ```ts
   * const stream = client.createSSE({
   *   method: 'GET',
   *   path: '/events',
   *   response: z.object({ message: z.string() }),
   * });
   * const conn = await stream();
   * conn.on('message', (data) => console.log(data));
   * ```
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
