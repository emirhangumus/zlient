import { HttpClient } from '../http/http-client';
import {
  ApiError,
  SSEEndpointCall,
  SSEEndpointConfig,
  SSEResponseSchema,
  StandardSchemaV1,
  toQueryString,
  toRequestQuery,
} from '../types';
import { parseOrThrow } from '../validation';
import { SSEConnectionImpl } from './sse-client';

type InferPathOutput<S extends StandardSchemaV1 | undefined> = S extends StandardSchemaV1
  ? StandardSchemaV1.InferOutput<S>
  : never;

type InferQueryOutput<S extends StandardSchemaV1 | undefined> = S extends StandardSchemaV1
  ? StandardSchemaV1.InferOutput<S>
  : undefined;

export class SSEEndpointImpl<
  ResSchema extends SSEResponseSchema | undefined,
  ReqSchema extends StandardSchemaV1 | undefined,
  QuerySchema extends StandardSchemaV1 | undefined,
  PathSchema extends StandardSchemaV1 | undefined,
> {
  constructor(
    private client: HttpClient,
    private config: SSEEndpointConfig<ResSchema, ReqSchema, QuerySchema, PathSchema>
  ) {}

  createCall(): SSEEndpointCall<ResSchema, ReqSchema, QuerySchema, PathSchema> {
    return async (params) => {
      const { query, pathParams, data, headers, signal } = params || {};

      const skipRequestValidation = this.config.advanced?.skipRequestValidation ?? false;

      // Validate Request Body using Standard Schema
      if (!skipRequestValidation && this.config.request && data !== undefined) {
        await parseOrThrow(this.config.request, data, { label: 'SSE request body' });
      }

      // Validate Query Params using Standard Schema
      const parsedQuery = (
        !skipRequestValidation && this.config.query && query !== undefined
          ? await parseOrThrow(this.config.query, query, { label: 'SSE query parameters' })
          : query
      ) as InferQueryOutput<QuerySchema>;

      // Validate Path Params using Standard Schema
      const parsedPathParams = (
        !skipRequestValidation && this.config.pathParams && pathParams !== undefined
          ? await parseOrThrow(this.config.pathParams, pathParams, { label: 'SSE path parameters' })
          : pathParams
      ) as InferPathOutput<PathSchema> | undefined;

      // Check for missing required params
      if (this.config.request && data === undefined) {
        throw new ApiError('Missing required request body (data)', {
          details: { missingParam: 'data' },
        });
      }
      if (this.config.pathParams && pathParams === undefined) {
        throw new ApiError('Missing required path parameters (pathParams)', {
          details: { missingParam: 'pathParams' },
        });
      }

      // Resolve Path
      let pathStr: string;
      if (typeof this.config.path === 'function') {
        if (!pathParams) {
          throw new ApiError('Path function requires pathParams', {
            details: { missingParam: 'pathParams' },
          });
        }
        pathStr = this.config.path(parsedPathParams as InferPathOutput<PathSchema>);
      } else {
        pathStr = this.config.path;
      }

      const baseUrl = this.client.getBaseUrl(this.config.advanced?.baseUrlKey || 'default');
      const url = `${baseUrl}${pathStr}${toQueryString(toRequestQuery(parsedQuery))}`;

      return new SSEConnectionImpl<ResSchema>(url, this.config.response, {
        skipResponseValidation: this.config.advanced?.skipResponseValidation,
        withCredentials: this.config.advanced?.withCredentials,
        method: this.config.method,
        data,
        headers: {
          ...this.client.getHeaders(),
          ...(this.config.advanced?.headers || {}),
          ...(headers || {}),
        },
        signal,
        auth: this.config.advanced?.skipAuth ? undefined : this.client.getAuth(),
        logger: this.client.getLogger(),
      });
    };
  }
}
