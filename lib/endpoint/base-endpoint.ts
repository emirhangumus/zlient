import { z } from 'zod';
import { HttpClient } from '../http/http-client';
import { HTTPMethod } from '../types';
import { parseOrThrow } from '../validation';

/**
 * Request configuration for endpoint calls.
 * Wrapper object containing all request parameters.
 *
 * @template ReqSchema - Zod schema for request validation
 * @template PathParams - Type for path parameters
 * @template QueryParams - Type for query parameters
 */
export type EndpointCallConfig<
  ReqSchema extends z.ZodType,
  PathParams = never,
  QueryParams = never,
> = {
  /** Request body data (for POST, PUT, PATCH, etc.) or request args */
  data?: z.infer<ReqSchema>;
  /** Path parameters for dynamic path construction */
  pathParams?: PathParams;
  /** Query string parameters */
  query?: QueryParams;
  /** Request headers */
  headers?: Record<string, string>;
  /** Override base URL for this call */
  baseUrlKey?: string;
  /** Abort controller signal for cancellation */
  signal?: globalThis.AbortSignal;
};

/**
 * Generic, strongly-typed endpoint with Zod schemas for request and response validation.
 * Extend this class to create type-safe API endpoints.
 *
 * @template ReqSchema - Zod schema for request validation
 * @template ResSchema - Zod schema for response validation
 * @template PathParams - Type for path parameters (optional)
 * @template QueryParams - Type for query parameters (optional)
 *
 * @example
 * ```ts
 * const UserSchema = z.object({ id: z.number(), name: z.string() });
 * const CreateUserSchema = z.object({ name: z.string() });
 *
 * type UserPathParams = { id: string };
 * type UserQueryParams = { include?: string; limit?: number };
 *
 * class GetUser extends BaseEndpoint<
 *   typeof CreateUserSchema,
 *   typeof UserSchema,
 *   UserPathParams,
 *   UserQueryParams
 * > {
 *   protected method = 'GET' as const;
 *   protected path = (params: UserPathParams) => `/users/${params.id}`;
 *
 *   constructor(client: HttpClient) {
 *     super(client, {
 *       requestSchema: CreateUserSchema,
 *       responseSchema: UserSchema
 *     });
 *   }
 * }
 *
 * // Usage:
 * const user = await endpoint.call({
 *   pathParams: { id: '123' },
 *   query: { include: 'posts', limit: 10 }
 * });
 * ```
 */
export abstract class BaseEndpoint<
  ReqSchema extends z.ZodType,
  ResSchema extends z.ZodType,
  PathParams = never,
  QueryParams = never,
> {
  /** HTTP method for this endpoint */
  protected abstract readonly method: keyof typeof HTTPMethod;
  /** URL path (can be a function for dynamic paths) */
  protected abstract readonly path: string | ((params: PathParams) => string);
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
    cfg: {
      requestSchema?: ReqSchema;
      responseSchema: ResSchema;
    }
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
   * const user = await endpoint.call({
   *   pathParams: { id: '123' },
   *   query: { include: 'posts' }
   * });
   * // With additional options:
   * const user = await endpoint.call({
   *   data: { name: 'John' },
   *   pathParams: { id: '123' },
   *   headers: { 'X-Custom': 'value' },
   *   query: { include: 'posts' }
   * });
   * ```
   */
  async call(
    config: EndpointCallConfig<ReqSchema, PathParams, QueryParams> = {} as EndpointCallConfig<
      ReqSchema,
      PathParams,
      QueryParams
    >
  ): Promise<z.infer<ResSchema>> {
    const { data, query, headers, baseUrlKey, signal, pathParams } = config;

    // Validate request body/params before sending (when schema provided)
    if (this.requestSchema && data !== undefined) {
      const parsed = this.requestSchema.safeParse(data);
      if (!parsed.success) throw parsed.error;
    }

    // Build path - use pathParams if provided, otherwise use data for backwards compatibility
    const pathArgs = (pathParams ?? data) as PathParams;
    const path = typeof this.path === 'function' ? this.path(pathArgs) : this.path;

    // For GET/HEAD methods, don't send body
    const shouldHaveBody = this.method !== 'GET' && this.method !== 'HEAD';
    const body = shouldHaveBody ? data : undefined;

    // Convert query params to the format expected by http-client
    const queryForRequest = query as
      | Record<string, string | number | boolean | undefined>
      | URLSearchParams
      | undefined;

    const { data: responseData } = await this.client.request(this.method, path, body, {
      query: queryForRequest,
      headers,
      baseUrlKey: baseUrlKey ?? this.options?.baseUrlKey,
      signal,
    });

    return parseOrThrow<z.infer<ResSchema>>(this.responseSchema, responseData);
  }
}
