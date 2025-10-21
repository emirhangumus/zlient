import type { RequestOptions as ReqOpts } from './types';

export interface AuthProvider {
  /**
   * Apply authentication to the outgoing request.
   * Called after SDK headers are assembled, but before request is sent.
   */
  apply(req: { url: string; init: RequestInit; options?: ReqOpts }): Promise<void> | void;
}

export class NoAuth implements AuthProvider {
  async apply() {
    /* no-op */
  }
}

export class ApiKeyAuth implements AuthProvider {
  constructor(private opts: { header?: string; query?: string; value: string }) {}
  apply({ url, init }: { url: string; init: RequestInit }) {
    if (this.opts.header) {
      init.headers = { ...(init.headers as any), [this.opts.header]: this.opts.value };
    } else if (this.opts.query) {
      const u = new URL(url);
      u.searchParams.set(this.opts.query, this.opts.value);
      (init as any).__urlOverride = u.toString();
    }
  }
}

export class BearerTokenAuth implements AuthProvider {
  constructor(private getToken: () => Promise<string> | string) {}
  async apply({ init }: { url: string; init: RequestInit }) {
    const token = await this.getToken();
    init.headers = { ...(init.headers as any), Authorization: `Bearer ${token}` };
  }
}
