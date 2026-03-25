import { HttpClient } from '../http/http-client';
import { StandardSchemaV1, toQueryString, WSEndpointCall, WSEndpointConfig } from '../types';
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createCall(): WSEndpointCall<SendSchema, ReceiveSchema, QuerySchema, PathSchema> {
    return (params) => {
      const { query, pathParams, protocols } = params || {};

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
      // Convert http/https to ws/wss if necessary
      const wsBaseUrl = baseUrl.replace(/^http/, 'ws');
      const url = `${wsBaseUrl}${pathStr}${toQueryString(query as any)}`;

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
