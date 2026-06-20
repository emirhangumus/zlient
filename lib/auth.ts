import type { RequestOptions as ReqOpts } from './types';

/**
 * Context passed to authentication providers when applying credentials.
 * The `url` property is mutable — auth providers that need to add query
 * parameters (e.g. API keys) should update it directly instead of modifying
 * the RequestInit.
 */
export interface AuthContext {
  url: string;
  init: RequestInit;
  options?: ReqOpts;
}

/**
 * Interface for authentication providers.
 * Implement this to create custom authentication strategies.
 *
 * @example
 * ```ts
 * class CustomAuth implements AuthProvider {
 *   apply({ init }) {
 *     (init.headers as Record<string, string>)['X-Custom-Auth'] = 'token';
 *   }
 * }
 * ```
 */
export interface AuthProvider {
  /**
   * Apply authentication to the outgoing request.
   * Called after SDK headers are assembled, but before request is sent.
   * May update `ctx.url` to append query-based credentials.
   */
  apply(ctx: AuthContext): Promise<void> | void;
}

/**
 * No-op authentication provider (no authentication applied).
 * Use this when you don't need authentication.
 */
export class NoAuth implements AuthProvider {
  apply(_ctx: AuthContext) {
    /* no-op */
  }
}

/**
 * API Key authentication provider.
 * Supports both header-based and query parameter-based authentication.
 *
 * @example
 * ```ts
 * // Header-based
 * const auth = new ApiKeyAuth({ header: 'X-API-Key', value: 'secret' });
 *
 * // Query parameter-based
 * const auth = new ApiKeyAuth({ query: 'apiKey', value: 'secret' });
 * ```
 */
export class ApiKeyAuth implements AuthProvider {
  constructor(private opts: { header?: string; query?: string; value: string }) {
    if (!opts.header && !opts.query) {
      throw new Error('ApiKeyAuth requires either "header" or "query" option');
    }
    if (opts.header && opts.query) {
      throw new Error('ApiKeyAuth cannot use both "header" and "query" options');
    }
  }

  apply(ctx: AuthContext) {
    const value = this.opts.value;
    if (this.opts.header) {
      if (ctx.init.headers instanceof Headers) {
        ctx.init.headers.set(this.opts.header, value);
      } else if (Array.isArray(ctx.init.headers)) {
        ctx.init.headers.push([this.opts.header, value]);
      } else {
        ctx.init.headers = { ...ctx.init.headers, [this.opts.header]: value };
      }
    } else if (this.opts.query) {
      const u = new URL(ctx.url);
      u.searchParams.set(this.opts.query, value);
      ctx.url = u.toString();
    }
  }
}

/**
 * Bearer token authentication provider.
 * Supports both static tokens and dynamic token fetching (e.g., for OAuth2 refresh).
 *
 * @example
 * ```ts
 * // Static token
 * const auth = new BearerTokenAuth(() => 'my-token');
 *
 * // Dynamic token with refresh
 * const auth = new BearerTokenAuth(async () => {
 *   return await refreshAccessToken();
 * });
 * ```
 */
export class BearerTokenAuth implements AuthProvider {
  constructor(private getToken: () => Promise<string> | string) {}

  async apply(ctx: AuthContext) {
    const token = await this.getToken();
    if (!token) {
      throw new Error('BearerTokenAuth: token is empty or undefined');
    }
    const authHeader = `Bearer ${token}`;
    if (ctx.init.headers instanceof Headers) {
      ctx.init.headers.set('Authorization', authHeader);
    } else if (Array.isArray(ctx.init.headers)) {
      ctx.init.headers.push(['Authorization', authHeader]);
    } else {
      ctx.init.headers = { ...ctx.init.headers, Authorization: authHeader };
    }
  }
}
