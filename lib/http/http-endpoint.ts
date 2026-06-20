import { validateEndpointParams, validateRequiredHeaders } from '../endpoint-utils';
import {
  HTTPMethod,
  InferPathOutput,
  InferQueryOutput,
  ResponseSchema,
  SchemaDefinitionError,
  SchemaMap,
  StandardSchemaV1,
  toRequestQuery,
} from '../types';
import { isStandardSchema, parseOrThrow } from '../validation';
import { HttpClient } from './http-client';

export type EndpointConfig<
  ResSchema extends ResponseSchema,
  ReqSchema extends StandardSchemaV1 | undefined = undefined,
  QuerySchema extends StandardSchemaV1 | undefined = undefined,
  PathSchema extends StandardSchemaV1 | undefined = undefined,
  MustHeaderKeys extends readonly string[] = readonly [],
> = {
  method: keyof typeof HTTPMethod;
  path: string | ((params: StandardSchemaV1.InferOutput<Exclude<PathSchema, undefined>>) => string);
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

// Requires specific header keys when MustHeaderKeys is non-empty.
type RequiredHeaders<Keys extends readonly string[]> = Keys extends readonly []
  ? Record<string, string> | undefined
  : { [K in Keys[number]]: string } & Record<string, string>;

export type EndpointCallParams<
  ReqSchema extends StandardSchemaV1 | undefined,
  QuerySchema extends StandardSchemaV1 | undefined,
  PathSchema extends StandardSchemaV1 | undefined,
  MustHeaderKeys extends readonly string[] = readonly [],
> = {
  data?: ReqSchema extends StandardSchemaV1 ? StandardSchemaV1.InferInput<ReqSchema> : never;
  query?: QuerySchema extends StandardSchemaV1 ? StandardSchemaV1.InferInput<QuerySchema> : never;
  pathParams?: PathSchema extends StandardSchemaV1
    ? StandardSchemaV1.InferInput<PathSchema>
    : never;
  signal?: globalThis.AbortSignal;
} & (MustHeaderKeys extends readonly []
  ? { headers?: Record<string, string> }
  : { headers: RequiredHeaders<MustHeaderKeys> });

// Infers the union of all possible response output types.
type InferResponse<S> = S extends StandardSchemaV1
  ? StandardSchemaV1.InferOutput<S>
  : S extends SchemaMap
    ? {
        [K in keyof S]: S[K] extends StandardSchemaV1 ? StandardSchemaV1.InferOutput<S[K]> : never;
      }[keyof S]
    : never;

export type EndpointCall<
  ResSchema extends ResponseSchema,
  ReqSchema extends StandardSchemaV1 | undefined,
  QuerySchema extends StandardSchemaV1 | undefined,
  PathSchema extends StandardSchemaV1 | undefined,
  MustHeaderKeys extends readonly string[] = readonly [],
> = (
  params: EndpointCallParams<ReqSchema, QuerySchema, PathSchema, MustHeaderKeys>
) => Promise<InferResponse<ResSchema>>;

export class EndpointImpl<
  ResSchema extends ResponseSchema,
  ReqSchema extends StandardSchemaV1 | undefined,
  QuerySchema extends StandardSchemaV1 | undefined,
  PathSchema extends StandardSchemaV1 | undefined,
  MustHeaderKeys extends readonly string[] = readonly [],
> {
  constructor(
    private client: HttpClient,
    private config: EndpointConfig<ResSchema, ReqSchema, QuerySchema, PathSchema, MustHeaderKeys>
  ) {}

  async call(
    params: EndpointCallParams<ReqSchema, QuerySchema, PathSchema, MustHeaderKeys>
  ): Promise<InferResponse<ResSchema>> {
    const { data, query, pathParams, signal } = params;
    const headers = 'headers' in params ? params.headers : undefined;

    validateRequiredHeaders(this.config.mustHeaderKeys, headers);

    const { parsedQuery, pathStr } = await validateEndpointParams(this.config, {
      data,
      query,
      pathParams,
    });

    const { data: responseData, status } = await this.client.request(
      this.config.method,
      pathStr,
      data,
      {
        query: toRequestQuery(parsedQuery),
        headers,
        baseUrlKey: this.config.advanced?.baseUrlKey,
        skipAuth: this.config.advanced?.skipAuth,
        skipRetry: this.config.advanced?.skipRetry,
        signal,
      }
    );

    if (this.config.advanced?.skipResponseValidation) {
      return responseData as InferResponse<ResSchema>;
    }

    const schema = this.config.response;

    if (isStandardSchema(schema)) {
      return (await parseOrThrow(schema, responseData, {
        label: `Response body for status ${status}`,
        status,
      })) as InferResponse<ResSchema>;
    }

    // SchemaMap: look up by status code
    const schemaMap = schema as SchemaMap;
    const specificSchema = schemaMap[status];
    if (!specificSchema) {
      throw new SchemaDefinitionError(status);
    }

    return (await parseOrThrow(specificSchema, responseData, {
      label: `Response body for status ${status}`,
      status,
    })) as InferResponse<ResSchema>;
  }
}

// Re-export for convenience
export type { InferPathOutput, InferQueryOutput };
