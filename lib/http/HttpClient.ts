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
import type { AuthProvider } from '../auth';

export class HttpClient {
  private fetchImpl: FetchLike;
  private baseUrls: ClientOptions['baseUrls'];
  private headers: Record<string, string>;
  private interceptors: Interceptors;
  private retry: RetryStrategy;
  private timeoutMs?: number;
  private auth: AuthProvider;

  constructor(opts: ClientOptions & { auth?: AuthProvider }) {
    this.fetchImpl = opts.fetch ?? (globalThis.fetch?.bind(globalThis) as FetchLike);
    if (!this.fetchImpl)
      throw new Error('No fetch implementation found. Pass one via options.fetch.');
    this.baseUrls = opts.baseUrls;
    this.headers = opts.headers ?? { 'Content-Type': 'application/json' };
    this.interceptors = opts.interceptors ?? {};
    this.retry = opts.retry ?? {
      maxRetries: 2,
      baseDelayMs: 250,
      jitter: 0.2,
      retryMethods: ['GET', 'HEAD'],
    };
    this.timeoutMs = opts.timeout?.requestTimeoutMs;
    this.auth = opts['auth'] ?? new (require('../auth').NoAuth)();
  }

  setAuth(auth: AuthProvider) {
    this.auth = auth;
  }

  private resolveBaseUrl(key?: keyof typeof this.baseUrls) {
    const k: string = (key as string) || 'default';
    const url = this.baseUrls[k];
    if (!url) throw new Error(`Unknown baseUrl key: ${k}`);
    return url.replace(/\/$/, '');
  }

  private sleep(ms: number) {
    return new Promise((res) => setTimeout(res, ms));
  }

  private async withRetry<T>(
    fn: () => Promise<T>,
    canRetry: (ctx: { attempt: number; error?: unknown; response?: Response }) => boolean
  ): Promise<T> {
    let attempt = 0;
    const { maxRetries, baseDelayMs, jitter = 0.2 } = this.retry;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        return await fn();
      } catch (err: any) {
        if (attempt >= maxRetries || !canRetry({ attempt, error: err })) throw err;
        const backoff = baseDelayMs * 2 ** attempt;
        const j = 1 + (Math.random() * 2 - 1) * jitter;
        await this.sleep(backoff * j);
        attempt++;
      }
    }
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

  async request<T = unknown>(
    method: keyof typeof HTTPMethod,
    path: string,
    body?: unknown,
    options?: RequestOptions
  ): Promise<{ data: T; response: Response }> {
    const base = this.resolveBaseUrl(options?.baseUrlKey);
    let url = `${base}${path}${toQueryString(options?.query)}`;

    const headers = { ...this.headers, ...(options?.headers ?? {}) };

    const controller = new AbortController();
    const signal = options?.signal ?? controller.signal;
    const init: RequestInit = {
      method,
      headers,
      body:
        body != null
          ? headers['Content-Type']?.includes('json')
            ? JSON.stringify(body)
            : (body as any)
          : undefined,
      signal,
    };

    await this.auth.apply({ url, init, options });
    if ((init as any).__urlOverride) url = (init as any).__urlOverride;
    await this.runBeforeHooks(url, init);

    const doFetch = async () => {
      // Apply timeout if configured
      let timeoutId: any;
      if (this.timeoutMs && !options?.signal) {
        timeoutId = setTimeout(
          () => controller.abort(new ApiError('Request timeout', { status: 0 })),
          this.timeoutMs
        );
      }

      try {
        const req = new Request(url, init);
        console.log('HTTP Request:', req.method, req.url, req);

        const res = await this.fetchImpl(req);
        if (!res.ok) {
          // Read response safely
          let text = '';
          try {
            text = await res.text();
          } catch { }
          throw new ApiError(`HTTP ${res.status}: ${res.statusText}`, {
            status: res.status,
            details: text,
          });
        }
        const contentType = res.headers.get('content-type') || '';
        const data = contentType.includes('json') ? await res.json() : ((await res.text()) as any);
        await this.runAfterHooks(new Request(url, init), res, data);
        return { data: data as T, response: res };
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
      }
    };

    const canRetry = ({
      response,
      error,
    }: {
      response?: Response;
      error?: any;
      attempt: number;
    }) => {
      // Retry on network errors or 5xx
      if (error instanceof ApiError && error.status && error.status >= 500) return true;
      if (error?.name === 'AbortError') return false;
      if (!error?.status && !response) return true; // network error
      return false;
    };

    if (!this.retry.retryMethods?.includes(method)) {
      return doFetch();
    }
    return this.withRetry(doFetch, canRetry);
  }
}
