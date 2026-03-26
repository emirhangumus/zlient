import { HttpClient } from '../http/http-client';
import {
  SSEEndpointCall,
  SSEEndpointConfig,
  SSEResponseSchema,
  StandardSchemaV1,
  toQueryString,
} from '../types';
import { parseOrThrow } from '../validation';
import { SSEConnectionImpl } from './sse-client';

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
        await parseOrThrow(this.config.request, data);
      }

      // Validate Query Params using Standard Schema
      if (!skipRequestValidation && this.config.query && query !== undefined) {
        await parseOrThrow(this.config.query, query);
      }

      // Validate Path Params using Standard Schema
      if (!skipRequestValidation && this.config.pathParams && pathParams !== undefined) {
        await parseOrThrow(this.config.pathParams, pathParams);
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

      const baseUrl = this.client.getBaseUrl(this.config.advanced?.baseUrlKey || 'default');
      const url = `${baseUrl}${pathStr}${toQueryString(query as any)}`;

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
