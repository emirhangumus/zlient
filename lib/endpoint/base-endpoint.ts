import { z } from 'zod';
import { HttpClient } from '../http/http-client';
import { HTTPMethod, SchemaDefinitionError } from '../types';
import { parseOrThrow } from '../validation';

export type EndpointConfig<
  ResSchema extends z.ZodType | Record<number, z.ZodType>,
  ReqSchema extends z.ZodType | undefined = undefined,
  QuerySchema extends z.ZodType | undefined = undefined,
  PathSchema extends z.ZodType | undefined = undefined,
> = {
  method: keyof typeof HTTPMethod;
  path: string | ((params: z.infer<Exclude<PathSchema, undefined>>) => string);
  response: ResSchema;
  request?: ReqSchema;
  query?: QuerySchema;
  pathParams?: PathSchema;
  baseUrlKey?: string;
  description?: string;
};

export type EndpointCallParams<
  ReqSchema extends z.ZodType | undefined,
  QuerySchema extends z.ZodType | undefined,
  PathSchema extends z.ZodType | undefined,
> = {
  data?: ReqSchema extends z.ZodType ? z.infer<ReqSchema> : never;
  query?: QuerySchema extends z.ZodType ? z.infer<QuerySchema> : never;
  pathParams?: PathSchema extends z.ZodType ? z.infer<PathSchema> : never;
  headers?: Record<string, string>;
  signal?: AbortSignal;
};

// Helper to extract the response type from a schema which might be a single ZodType or a status map
type InferResponse<S> = S extends z.ZodType
  ? z.infer<S>
  : S extends Record<number, z.ZodType>
  ? z.infer<S[keyof S]>
  : never;

export class Endpoint<
  ResSchema extends z.ZodType | Record<number, z.ZodType>,
  ReqSchema extends z.ZodType | undefined,
  QuerySchema extends z.ZodType | undefined,
  PathSchema extends z.ZodType | undefined,
> {
  constructor(
    private client: HttpClient,
    private config: EndpointConfig<ResSchema, ReqSchema, QuerySchema, PathSchema>
  ) { }

  async call(
    params: EndpointCallParams<ReqSchema, QuerySchema, PathSchema>
  ): Promise<InferResponse<ResSchema>> {
    const { data, query, pathParams, headers, signal } = params;

    // Validate Request Body
    if (this.config.request && data !== undefined) {
      const parsed = this.config.request.safeParse(data);
      if (!parsed.success) throw parsed.error;
    }

    // Validate Query Params
    if (this.config.query && query !== undefined) {
      const parsed = this.config.query.safeParse(query);
      if (!parsed.success) throw parsed.error;
    }

    // Validate Path Params
    if (this.config.pathParams && pathParams !== undefined) {
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
      pathStr = this.config.path(pathParams as any);
    } else {
      pathStr = this.config.path;
    }

    const { data: responseData, status } = await this.client.request(
      this.config.method,
      pathStr,
      data,
      {
        query: query as any,
        headers,
        baseUrlKey: this.config.baseUrlKey,
        signal,
      }
    );

    // Handle Response Validation
    const schema = this.config.response;
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
