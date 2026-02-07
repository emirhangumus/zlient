import { z } from 'zod';
import { HttpClient } from '../http/http-client';
import { HTTPMethod, SchemaDefinitionError } from '../types';
import { parseOrThrow } from '../validation';

export type EndpointConfig<
  ResSchema extends z.ZodType | Record<number, z.ZodType>,
  ReqSchema extends z.ZodType | undefined = undefined,
  QuerySchema extends z.ZodType | undefined = undefined,
  PathSchema extends z.ZodType | undefined = undefined,
  MustHeaderKeys extends readonly string[] = readonly [],
> = {
  method: keyof typeof HTTPMethod;
  path: string | ((params: z.infer<Exclude<PathSchema, undefined>>) => string);
  response: ResSchema;
  request?: ReqSchema;
  query?: QuerySchema;
  pathParams?: PathSchema;
  mustHeaderKeys?: MustHeaderKeys;
  advanced?: {
    baseUrlKey?: string;
    skipAuth?: boolean;
    skipRequestValidation?: boolean;
    skipResponseValidation?: boolean;
    skipRetry?: boolean;
  };
  description?: string;
};

// Helper type to create required headers from mustHeaderKeys
type RequiredHeaders<Keys extends readonly string[]> = Keys extends readonly []
  ? Record<string, string> | undefined
  : { [K in Keys[number]]: string } & Record<string, string>;

export type EndpointCallParams<
  ReqSchema extends z.ZodType | undefined,
  QuerySchema extends z.ZodType | undefined,
  PathSchema extends z.ZodType | undefined,
  MustHeaderKeys extends readonly string[] = readonly [],
> = {
  data?: ReqSchema extends z.ZodType ? z.infer<ReqSchema> : never;
  query?: QuerySchema extends z.ZodType ? z.infer<QuerySchema> : never;
  pathParams?: PathSchema extends z.ZodType ? z.infer<PathSchema> : never;
  signal?: globalThis.AbortSignal;
} & (MustHeaderKeys extends readonly []
  ? { headers?: Record<string, string> }
  : { headers: RequiredHeaders<MustHeaderKeys> });

// Helper to extract the response type from a schema which might be a single ZodType or a status map
type InferResponse<S> = S extends z.ZodType
  ? z.infer<S>
  : S extends Record<number, z.ZodType>
  ? z.infer<S[keyof S]>
  : never;

export type EndpointCall<
  ResSchema extends z.ZodType | Record<number, z.ZodType>,
  ReqSchema extends z.ZodType | undefined,
  QuerySchema extends z.ZodType | undefined,
  PathSchema extends z.ZodType | undefined,
  MustHeaderKeys extends readonly string[] = readonly [],
> = (
  params: EndpointCallParams<ReqSchema, QuerySchema, PathSchema, MustHeaderKeys>
) => Promise<InferResponse<ResSchema>>;

export class EndpointImpl<
  ResSchema extends z.ZodType | Record<number, z.ZodType>,
  ReqSchema extends z.ZodType | undefined,
  QuerySchema extends z.ZodType | undefined,
  PathSchema extends z.ZodType | undefined,
  MustHeaderKeys extends readonly string[] = readonly [],
> {
  constructor(
    private client: HttpClient,
    private config: EndpointConfig<ResSchema, ReqSchema, QuerySchema, PathSchema, MustHeaderKeys>
  ) { }

  async call(
    params: EndpointCallParams<ReqSchema, QuerySchema, PathSchema, MustHeaderKeys>
  ): Promise<InferResponse<ResSchema>> {
    const { data, query, pathParams, signal } = params;
    const headers = 'headers' in params ? params.headers : undefined;

    const skipRequestValidation = this.config.advanced?.skipRequestValidation ?? false;
    const skipResponseValidation = this.config.advanced?.skipResponseValidation ?? false;

    // Validate required headers
    if (this.config.mustHeaderKeys && this.config.mustHeaderKeys.length > 0) {
      const missingHeaders = this.config.mustHeaderKeys.filter(
        (key) => !headers || !(key in headers)
      );
      if (missingHeaders.length > 0) {
        throw new Error(
          `Missing required header(s): ${missingHeaders.join(', ')}`
        );
      }
    }

    // Validate Request Body
    if (!skipRequestValidation && this.config.request && data !== undefined) {
      const parsed = this.config.request.safeParse(data);
      if (!parsed.success) throw parsed.error;
    }

    // Validate Query Params
    if (!skipRequestValidation && this.config.query && query !== undefined) {
      const parsed = this.config.query.safeParse(query);
      if (!parsed.success) throw parsed.error;
    }

    // Validate Path Params
    if (!skipRequestValidation && this.config.pathParams && pathParams !== undefined) {
      const parsed = this.config.pathParams.safeParse(pathParams);
      if (!parsed.success) throw parsed.error;
    }

    // Check for missing required params
    if (this.config.request && data === undefined) {
      throw new Error('Missing required request body (data)');
    }
    if (this.config.pathParams && pathParams === undefined) {
      throw new Error('Missing required path parameters (pathParams)');
    }

    // Resolve Path
    let pathStr: string;
    if (typeof this.config.path === 'function') {
      if (!pathParams) throw new Error('Path function requires pathParams');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      pathStr = this.config.path(pathParams as any);
    } else {
      pathStr = this.config.path;
    }

    const { data: responseData, status } = await this.client.request(
      this.config.method,
      pathStr,
      data,
      {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        query: query as any,
        headers,
        baseUrlKey: this.config.advanced?.baseUrlKey,
        skipAuth: this.config.advanced?.skipAuth,
        skipRetry: this.config.advanced?.skipRetry,
        signal,
      }
    );

    // Handle Response Validation
    const schema = this.config.response;
    if (skipResponseValidation) {
      return responseData as InferResponse<ResSchema>;
    }

    if (schema instanceof z.ZodType) {
      // Single schema for all success codes
      return parseOrThrow(schema, responseData) as InferResponse<ResSchema>;
    }

    // Map of status codes
    const specificSchema = (schema as Record<number, z.ZodType>)[status];
    if (!specificSchema) {
      // Fallback or error? For now, rigorous error.
      throw new SchemaDefinitionError(status);
    }

    return parseOrThrow(specificSchema, responseData) as InferResponse<ResSchema>;
  }
}
