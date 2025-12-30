import type { RequestOptions as ReqOpts } from './types';

/**
 * Extended RequestInit with URL override capability for query-based auth.
 */
export interface AuthContext {
  url: string;
  init: RequestInit & { __urlOverride?: string };
  options?: ReqOpts;
}

/**
 * Interface for authentication providers.
 * Implement this to create custom authentication strategies.
 *
 * @example
 * ```ts
 * class CustomAuth implements AuthProvider {
 *   async apply({ init }) {
 *     init.headers = { ...init.headers, 'X-Custom-Auth': 'token' };
 *   }
 * }
 * ```
 */
export interface AuthProvider {
  /**
   * Apply authentication to the outgoing request.
   * Called after SDK headers are assembled, but before request is sent.
   *
   * @param req - Request context including URL, init, and options
   */
  apply(req: AuthContext): Promise<void> | void;
}

/**
 * No-op authentication provider (no authentication applied).
 * Use this when you don't need authentication.
 */
export class NoAuth implements AuthProvider {
  async apply() {
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
  apply({ url, init }: AuthContext) {
    const value = this.opts.value;
    if (this.opts.header) {
      if (init.headers instanceof Headers) {
        init.headers.set(this.opts.header, value);
      } else if (Array.isArray(init.headers)) {
        init.headers.push([this.opts.header, value]);
      } else {
        init.headers = { ...init.headers, [this.opts.header]: value };
      }
    } else if (this.opts.query) {
      const u = new URL(url);
      u.searchParams.set(this.opts.query, value);
      init.__urlOverride = u.toString();
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
  async apply({ init }: AuthContext) {
    const token = await this.getToken();
    if (!token) {
      throw new Error('BearerTokenAuth: token is empty or undefined');
    }
    const authHeader = `Bearer ${token}`;
    if (init.headers instanceof Headers) {
      init.headers.set('Authorization', authHeader);
    } else if (Array.isArray(init.headers)) {
      init.headers.push(['Authorization', authHeader]);
    } else {
      init.headers = { ...init.headers, Authorization: authHeader };
    }
  }
}
