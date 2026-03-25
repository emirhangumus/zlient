import { HttpClient } from '../http/http-client';
import { StandardSchemaV1, toQueryString, SSEEndpointCall, SSEEndpointConfig } from '../types';
import { SSEConnectionImpl } from './sse-client';

export class SSEEndpointImpl<
  ResSchema extends StandardSchemaV1 | undefined,
  QuerySchema extends StandardSchemaV1 | undefined,
  PathSchema extends StandardSchemaV1 | undefined,
> {
  constructor(
    private client: HttpClient,
    private config: SSEEndpointConfig<ResSchema, QuerySchema, PathSchema>
  ) {}

  createCall(): SSEEndpointCall<ResSchema, QuerySchema, PathSchema> {
    return (params) => {
      const { query, pathParams } = params || {};

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

      return new SSEConnectionImpl<ResSchema>(
        url,
        this.config.response,
        this.config.advanced?.skipResponseValidation,
        this.config.advanced?.withCredentials
      );
    };
  }
}
