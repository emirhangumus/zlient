import { validateEndpointParams } from '../endpoint-utils';
import { HttpClient } from '../http/http-client';
import {
  StandardSchemaV1,
  toQueryString,
  toRequestQuery,
  WSEndpointCall,
  WSEndpointConfig,
} from '../types';
import { WSConnectionImpl } from './ws-client';

export class WSEndpointImpl<
  SendSchema extends StandardSchemaV1 | undefined,
  ReceiveSchema extends StandardSchemaV1 | undefined,
  QuerySchema extends StandardSchemaV1 | undefined,
  PathSchema extends StandardSchemaV1 | undefined,
> {
  constructor(
    private client: HttpClient,
    private config: WSEndpointConfig<SendSchema, ReceiveSchema, QuerySchema, PathSchema>
  ) {}

  createCall(): WSEndpointCall<SendSchema, ReceiveSchema, QuerySchema, PathSchema> {
    return async (params) => {
      const { query, pathParams, protocols } = params || {};

      const { parsedQuery, pathStr } = await validateEndpointParams(
        this.config,
        {
          query,
          pathParams,
        },
        {
          query: 'WebSocket query parameters',
          path: 'WebSocket path parameters',
        }
      );

      const baseUrl = this.client.getBaseUrl(this.config.advanced?.baseUrlKey || 'default');
      // Convert http(s) to ws(s) for WebSocket URLs
      const wsBaseUrl = baseUrl.replace(/^http/, 'ws');
      const url = `${wsBaseUrl}${pathStr}${toQueryString(toRequestQuery(parsedQuery))}`;

      return new WSConnectionImpl<SendSchema, ReceiveSchema>(
        url,
        this.config.send,
        this.config.receive,
        this.config.advanced?.skipRequestValidation,
        this.config.advanced?.skipResponseValidation,
        protocols
      );
    };
  }
}
