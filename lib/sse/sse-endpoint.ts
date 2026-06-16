import {
  assertRequiredEndpointValue,
  parseEndpointValue,
  resolveEndpointPath,
} from '../endpoint-utils';
import { HttpClient } from '../http/http-client';
import {
  SSEEndpointCall,
  SSEEndpointConfig,
  SSEResponseSchema,
  StandardSchemaV1,
  toQueryString,
  toRequestQuery,
} from '../types';
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
      await parseEndpointValue(
        this.config.request,
        data,
        skipRequestValidation,
        'SSE request body'
      );

      // Validate Query Params using Standard Schema
      const parsedQuery = (await parseEndpointValue(
        this.config.query,
        query,
        skipRequestValidation,
        'SSE query parameters'
      )) as InferQueryOutput<QuerySchema>;

      // Validate Path Params using Standard Schema
      const parsedPathParams = (await parseEndpointValue(
        this.config.pathParams,
        pathParams,
        skipRequestValidation,
        'SSE path parameters'
      )) as InferPathOutput<PathSchema> | undefined;

      // Check for missing required params
      assertRequiredEndpointValue(
        this.config.request,
        data,
        'data',
        'Missing required request body (data)'
      );
      assertRequiredEndpointValue(
        this.config.pathParams,
        pathParams,
        'pathParams',
        'Missing required path parameters (pathParams)'
      );

      // Resolve Path
      const pathStr = resolveEndpointPath(
        this.config.path,
        pathParams,
        parsedPathParams as InferPathOutput<PathSchema>
      );

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
