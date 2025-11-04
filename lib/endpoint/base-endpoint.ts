import { z } from 'zod';
import { HttpClient } from '../http/http-client';
import { HTTPMethod } from '../types';
import { parseOrThrow } from '../validation';

/**
 * Request configuration for endpoint calls.
 * Wrapper object containing all request parameters.
 *
 * @template ReqSchema - Zod schema for request validation
 */
export type EndpointCallConfig<ReqSchema extends z.ZodType> = {
  /** Request body data (for POST, PUT, PATCH, etc.) or request args */
  data?: z.infer<ReqSchema>;
  /** Path parameters for dynamic path construction */
  pathParams?: Record<string, string | number>;
  /** Query string parameters */
  query?: Record<string, string | number | boolean | undefined> | URLSearchParams;
  /** Request headers */
  headers?: Record<string, string>;
  /** Override base URL for this call */
  baseUrlKey?: string;
  /** Abort controller signal for cancellation */
  signal?: AbortSignal;
};

/**
 * Generic, strongly-typed endpoint with Zod schemas for request and response validation.
 * Extend this class to create type-safe API endpoints.
 * 
 * @template ReqSchema - Zod schema for request validation
 * @template ResSchema - Zod schema for response validation
 * 
 * @example
 * ```ts
 * const UserSchema = z.object({ id: z.number(), name: z.string() });
 * const CreateUserSchema = z.object({ name: z.string() });
 * 
 * class GetUser extends BaseEndpoint<typeof CreateUserSchema, typeof UserSchema> {
 *   protected method = 'GET' as const;
 *   protected path = (args: z.infer<typeof CreateUserSchema>) => `/users/${args.id}`;
 *   
 *   constructor(client: HttpClient) {
 *     super(client, { 
 *       requestSchema: CreateUserSchema,
 *       responseSchema: UserSchema 
 *     });
 *   }
 * }
 * ```
 */
export abstract class BaseEndpoint<ReqSchema extends z.ZodType, ResSchema extends z.ZodType> {
  /** HTTP method for this endpoint */
  protected abstract readonly method: keyof typeof HTTPMethod;
  /** URL path (can be a function for dynamic paths) */
  protected abstract readonly path: string | ((params: z.infer<ReqSchema>) => string);
  /** Additional options for the request */
  protected readonly options?: {
    /** Override base URL for this call */
    baseUrlKey?: string;
  };
  /** Optional request schema for validation */
  protected readonly requestSchema?: ReqSchema;
  /** Response schema for validation */
  protected readonly responseSchema: ResSchema;

  /**
   * @param client - HttpClient instance
   * @param cfg - Configuration with request and response schemas
   */
  constructor(
    protected client: HttpClient,
    cfg: { requestSchema?: ReqSchema; responseSchema: ResSchema }
  ) {
    this.requestSchema = cfg.requestSchema;
    this.responseSchema = cfg.responseSchema;
  }

  /**
   * Call the endpoint with strong typing derived from schemas.
   * Validates request data before sending and response data after receiving.
   * 
   * @param config - Request configuration object containing all parameters
   * @returns Promise resolving to validated response data (typed by ResSchema)
   * @throws {ZodError} If request validation fails
   * @throws {ApiError} If response validation fails or request fails
   * 
   * @example
   * ```ts
   * const endpoint = new GetUser(client);
   * const user = await endpoint.call({ data: { id: 1 } });
   * // With additional options:
   * const user = await endpoint.call({ 
   *   data: { id: 1 },
   *   headers: { 'X-Custom': 'value' },
   *   query: { include: 'posts' }
   * });
   * ```
   */
  async call(config: EndpointCallConfig<ReqSchema> = {}): Promise<z.infer<ResSchema>> {
    const { data, query, headers, baseUrlKey, signal, pathParams } = config;

    // Validate request body/params before sending (when schema provided)
    if (this.requestSchema && data !== undefined) {
      const parsed = this.requestSchema.safeParse(data);
      if (!parsed.success) throw parsed.error;
    }

    // Build path - use pathParams if provided, otherwise use data
    const pathArgs = pathParams ?? data;
    const path = typeof this.path === 'function' ? this.path(pathArgs as z.infer<ReqSchema>) : this.path;

    // For GET/HEAD methods, don't send body
    const shouldHaveBody = this.method !== 'GET' && this.method !== 'HEAD';
    const body = shouldHaveBody ? data : undefined;

    const { data: responseData } = await this.client.request(this.method, path, body, {
      query,
      headers,
      baseUrlKey: baseUrlKey ?? this.options?.baseUrlKey,
      signal,
    });

    return parseOrThrow<z.infer<ResSchema>>(this.responseSchema, responseData);
  }
}
