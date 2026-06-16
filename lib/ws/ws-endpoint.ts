import { parseEndpointValueSync, resolveEndpointPath } from '../endpoint-utils';
import { HttpClient } from '../http/http-client';
import {
  StandardSchemaV1,
  toQueryString,
  toRequestQuery,
  WSEndpointCall,
  WSEndpointConfig,
} from '../types';
import { WSConnectionImpl } from './ws-client';

type InferPathInput<S extends StandardSchemaV1 | undefined> = S extends StandardSchemaV1
  ? StandardSchemaV1.InferInput<S>
  : never;

type InferQueryOutput<S extends StandardSchemaV1 | undefined> = S extends StandardSchemaV1
  ? StandardSchemaV1.InferOutput<S>
  : undefined;

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
    return (params) => {
      const { query, pathParams, protocols } = params || {};
      const skipRequestValidation = this.config.advanced?.skipRequestValidation ?? false;

      parseEndpointValueSync(
        this.config.query,
        query,
        skipRequestValidation,
        'WebSocket query parameters'
      ) as InferQueryOutput<QuerySchema>;

      parseEndpointValueSync(
        this.config.pathParams,
        pathParams,
        skipRequestValidation,
        'WebSocket path parameters'
      );

      const pathStr = resolveEndpointPath(
        this.config.path,
        pathParams,
        pathParams as InferPathInput<PathSchema>
      );

      const baseUrl = this.client.getBaseUrl(this.config.advanced?.baseUrlKey || 'default');
      // Convert http/https to ws/wss if necessary
      const wsBaseUrl = baseUrl.replace(/^http/, 'ws');
      const url = `${wsBaseUrl}${pathStr}${toQueryString(toRequestQuery(query))}`;

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
