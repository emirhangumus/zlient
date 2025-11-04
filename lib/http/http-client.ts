import type { AuthProvider } from '../auth';
import { NoAuth } from '../auth';
import { LoggerUtil, NoOpLogger } from '../logger';
import { MetricsCollector, NoOpMetricsCollector } from '../metrics';
import {
  ApiError,
  ClientOptions,
  FetchLike,
  HTTPMethod,
  Interceptors,
  RequestOptions,
  RetryStrategy,
  toQueryString,
} from '../types';

/**
 * HTTP client with built-in retry logic, authentication, and interceptors.
 * Supports multiple base URLs, type-safe requests, and comprehensive error handling.
 * 
 * @example
 * ```ts
 * const client = new HttpClient({
 *   baseUrls: { default: 'https://api.example.com' },
 *   headers: { 'Content-Type': 'application/json' },
 *   retry: { maxRetries: 3, baseDelayMs: 1000 },
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
  private retry: RetryStrategy;
  private timeoutMs?: number;
  private auth: AuthProvider;
  private logger: LoggerUtil;
  private metrics: MetricsCollector;

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
    this.retry = opts.retry ?? {
      maxRetries: 2,
      baseDelayMs: 250,
      jitter: 0.2,
      retryMethods: ['GET', 'HEAD'],
    };

    // Validate retry configuration
    if (this.retry.maxRetries < 0) {
      throw new Error('retry.maxRetries must be non-negative');
    }
    if (this.retry.baseDelayMs < 0) {
      throw new Error('retry.baseDelayMs must be non-negative');
    }
    if (this.retry.jitter !== undefined && (this.retry.jitter < 0 || this.retry.jitter > 1)) {
      throw new Error('retry.jitter must be between 0 and 1');
    }

    this.timeoutMs = opts.timeout?.requestTimeoutMs;
    if (this.timeoutMs !== undefined && this.timeoutMs < 0) {
      throw new Error('timeout.requestTimeoutMs must be non-negative');
    }

    this.auth = opts['auth'] ?? new NoAuth();
    this.logger = new LoggerUtil(opts.logger ?? new NoOpLogger());
    this.metrics = opts.metrics ?? new NoOpMetricsCollector();
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
   * Sleep for a specified duration (used for retry backoff).
   * @private
   */
  private sleep(ms: number) {
    return new Promise((res) => setTimeout(res, ms));
  }

  /**
   * Execute a function with retry logic and exponential backoff.
   * @private
   */
  private async withRetry<T>(
    fn: () => Promise<T>,
    canRetry: (ctx: { attempt: number; error?: unknown; response?: Response }) => boolean
  ): Promise<T> {
    let attempt = 0;
    const { maxRetries, baseDelayMs, jitter = 0.2 } = this.retry;
    while (true) {
      try {
        return await fn();
      } catch (err: unknown) {
        if (attempt >= maxRetries || !canRetry({ attempt, error: err })) throw err;
        const backoff = baseDelayMs * 2 ** attempt;
        const j = 1 + (Math.random() * 2 - 1) * jitter;
        await this.sleep(backoff * j);
        attempt++;
      }
    }
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
  ): Promise<{ data: T; response: Response }> {
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
    const init: RequestInit & { __urlOverride?: string } = {
      method,
      headers,
      body:
        body != null
          ? headers['Content-Type']?.includes('json')
            ? JSON.stringify(body)
            : String(body)
          : undefined,
      signal,
    };

    await this.auth.apply({ url, init, options });
    if (init.__urlOverride) url = init.__urlOverride;
    await this.runBeforeHooks(url, init);

    const doFetch = async () => {
      // Apply timeout if configured
      let timeoutId: NodeJS.Timeout | number | undefined;
      if (this.timeoutMs && !options?.signal) {
        timeoutId = setTimeout(() => {
          const timeoutError = new Error('Request timeout');
          timeoutError.name = 'TimeoutError';
          controller.abort(timeoutError);
        }, this.timeoutMs);
      }

      try {
        const req = new Request(url, init);

        const res = await this.fetchImpl(req);
        if (!res.ok) {
          // Read response safely
          let text = '';
          try {
            text = await res.text();
          } catch (readError) {
            text = `Failed to read response: ${readError instanceof Error ? readError.message : String(readError)}`;
          }
          throw new ApiError(`HTTP ${res.status}: ${res.statusText}`, {
            status: res.status,
            details: text,
          });
        }
        const contentType = res.headers.get('content-type') || '';
        const data = contentType.includes('json') ? await res.json() : await res.text();
        await this.runAfterHooks(new Request(url, init), res, data);

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

        return { data: data as T, response: res };
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
    };

    const canRetry = ({
      response,
      error,
    }: {
      response?: Response;
      error?: unknown;
      attempt: number;
    }) => {
      // Don't retry timeouts or aborts
      if (error && typeof error === 'object' && 'name' in error) {
        const errorName = (error as { name?: string }).name;
        if (errorName === 'AbortError' || errorName === 'TimeoutError') return false;
      }
      // Retry on network errors or 5xx
      if (error instanceof ApiError && error.status && error.status >= 500) return true;
      if (error && !response) return true; // network error
      return false;
    };

    if (!this.retry.retryMethods?.includes(method)) {
      return doFetch();
    }
    return this.withRetry(doFetch, canRetry);
  }

  /**
   * Convenience method for GET requests.
   * 
   * @example
   * ```ts
   * const { data } = await client.get('/users', { query: { page: 1 } });
   * ```
   */
  async get<T = unknown>(path: string, options?: RequestOptions): Promise<{ data: T; response: Response }> {
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
  async post<T = unknown>(path: string, body?: unknown, options?: RequestOptions): Promise<{ data: T; response: Response }> {
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
  async put<T = unknown>(path: string, body?: unknown, options?: RequestOptions): Promise<{ data: T; response: Response }> {
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
  async patch<T = unknown>(path: string, body?: unknown, options?: RequestOptions): Promise<{ data: T; response: Response }> {
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
  async delete<T = unknown>(path: string, options?: RequestOptions): Promise<{ data: T; response: Response }> {
    return this.request<T>('DELETE', path, undefined, options);
  }
}
