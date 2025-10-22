import { z } from 'zod';
import { HttpClient } from '../http/HttpClient';
import { HTTPMethod, RequestOptions } from '../types';
import { parseOrThrow } from '../validation';

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
export abstract class BaseEndpoint<ReqSchema extends z.ZodTypeAny, ResSchema extends z.ZodTypeAny> {
  /** HTTP method for this endpoint */
  protected abstract readonly method: keyof typeof HTTPMethod;
  /** URL path (can be a function for dynamic paths) */
  protected abstract readonly path: string | ((params: z.infer<ReqSchema>) => string);
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
   * @param args - Request arguments (typed by ReqSchema)
   * @param options - Additional request options
   * @returns Promise resolving to validated response data (typed by ResSchema)
   * @throws {ZodError} If request validation fails
   * @throws {ApiError} If response validation fails or request fails
   * 
   * @example
   * ```ts
   * const endpoint = new GetUser(client);
   * const user = await endpoint.call({ id: 1 });
   * ```
   */
  async call(args: z.infer<ReqSchema>, options?: RequestOptions): Promise<z.infer<ResSchema>> {
    // Validate request body/params before sending (when schema provided)
    if (this.requestSchema) {
      const parsed = this.requestSchema.safeParse(args);
      if (!parsed.success) throw parsed.error;
    }

    const path = typeof this.path === 'function' ? this.path(args) : this.path;

    // For GET/HEAD methods, don't send body. Allow query params from args.query or options.query
    const shouldHaveBody = this.method !== 'GET' && this.method !== 'HEAD';
    const body = shouldHaveBody ? args : undefined;

    // Merge query params: args.query takes precedence over options.query
    const argsAsRecord = args as Record<string, unknown>;
    const queryFromArgs = argsAsRecord?.query;

    let mergedQuery: Record<string, string | number | boolean | undefined> | undefined;
    if (options?.query || queryFromArgs) {
      mergedQuery = {
        ...(typeof options?.query === 'object' && !(options?.query instanceof URLSearchParams) ? options.query : {}),
        ...(typeof queryFromArgs === 'object' && queryFromArgs !== null ? queryFromArgs as Record<string, string | number | boolean | undefined> : {}),
      };
    }

    const { data } = await this.client.request(this.method, path, body, {
      ...options,
      query: mergedQuery && Object.keys(mergedQuery).length > 0 ? mergedQuery : options?.query,
    });

    return parseOrThrow<z.infer<ResSchema>>(this.responseSchema, data);
  }
}
