import {
  assertRequiredEndpointValue,
  parseEndpointValue,
  resolveEndpointPath,
  validateRequiredHeaders,
} from '../endpoint-utils';
import {
  HTTPMethod,
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

// Helper type to create required headers from mustHeaderKeys
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

// Helper to extract the response type from a schema which might be a single schema or a status map
type InferResponse<S> = S extends StandardSchemaV1
  ? StandardSchemaV1.InferOutput<S>
  : S extends SchemaMap
    ? {
        [K in keyof S]: S[K] extends StandardSchemaV1 ? StandardSchemaV1.InferOutput<S[K]> : never;
      }[keyof S]
    : never;

type InferPathOutput<S extends StandardSchemaV1 | undefined> = S extends StandardSchemaV1
  ? StandardSchemaV1.InferOutput<S>
  : never;

type InferQueryOutput<S extends StandardSchemaV1 | undefined> = S extends StandardSchemaV1
  ? StandardSchemaV1.InferOutput<S>
  : undefined;

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

    const skipRequestValidation = this.config.advanced?.skipRequestValidation ?? false;
    const skipResponseValidation = this.config.advanced?.skipResponseValidation ?? false;

    validateRequiredHeaders(this.config.mustHeaderKeys, headers);

    // Validate Request Body using Standard Schema
    await parseEndpointValue(this.config.request, data, skipRequestValidation, 'Request body');

    // Validate Query Params using Standard Schema
    const parsedQuery = (await parseEndpointValue(
      this.config.query,
      query,
      skipRequestValidation,
      'Query parameters'
    )) as InferQueryOutput<QuerySchema>;

    // Validate Path Params using Standard Schema
    const parsedPathParams = (await parseEndpointValue(
      this.config.pathParams,
      pathParams,
      skipRequestValidation,
      'Path parameters'
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

    // Handle Response Validation
    const schema = this.config.response;
    if (skipResponseValidation) {
      return responseData as InferResponse<ResSchema>;
    }

    if (isStandardSchema(schema)) {
      // Single schema for all success codes
      return (await parseOrThrow(schema, responseData, {
        label: `Response body for status ${status}`,
        status,
      })) as InferResponse<ResSchema>;
    }

    // Map of status codes to schemas
    const schemaMap = schema as SchemaMap;
    const specificSchema = schemaMap[status];
    if (!specificSchema) {
      // No schema defined for this status code
      throw new SchemaDefinitionError(status);
    }

    return (await parseOrThrow(specificSchema, responseData, {
      label: `Response body for status ${status}`,
      status,
    })) as InferResponse<ResSchema>;
  }
}
