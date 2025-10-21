import { z } from 'zod';
import { HttpClient } from '../http/HttpClient';
import { HTTPMethod, RequestOptions } from '../types';
import { parseOrThrow } from '../validation';

/**
 * Generic, strongly-typed endpoint with Zod schemas for request and response.
 */
export abstract class BaseEndpoint<ReqSchema extends z.ZodTypeAny, ResSchema extends z.ZodTypeAny> {
  protected abstract readonly method: keyof typeof HTTPMethod;
  protected abstract readonly path: string | ((params: any) => string);
  protected readonly requestSchema?: ReqSchema;
  protected readonly responseSchema: ResSchema;

  constructor(
    protected client: HttpClient,
    cfg: { requestSchema?: ReqSchema; responseSchema: ResSchema }
  ) {
    this.requestSchema = cfg.requestSchema;
    this.responseSchema = cfg.responseSchema;
  }

  /**
   * Call the endpoint with strong typing derived from schemas.
   */
  async call(args: z.infer<ReqSchema>, options?: RequestOptions): Promise<z.infer<ResSchema>> {
    // Validate request body/params before sending (when schema provided)
    if (this.requestSchema) {
      const parsed = this.requestSchema.safeParse(args);
      if (!parsed.success) throw parsed.error;
    }

    const path = typeof this.path === 'function' ? this.path(args) : this.path;
    const body = this.method === 'GET' || this.method === 'HEAD' ? undefined : args;

    const { data } = await this.client.request(this.method, path, body, {
      ...options,
      // For GET with query params, allow request schema to include { query: {...} }
      query: (this.method === 'GET' ? (args as any)?.query : undefined) ?? options?.query,
    });

    return parseOrThrow<z.infer<ResSchema>>(this.responseSchema, data);
  }
}
