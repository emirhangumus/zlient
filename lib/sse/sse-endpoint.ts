import { validateEndpointParams } from '../endpoint-utils';
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

      const { parsedQuery, pathStr } = await validateEndpointParams(
        this.config,
        {
          data,
          query,
          pathParams,
        },
        {
          request: 'SSE request body',
          query: 'SSE query parameters',
          path: 'SSE path parameters',
        }
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
        fetch: this.client.getFetch(),
      });
    };
  }
}
