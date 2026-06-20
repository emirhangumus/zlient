import type { AuthContext, AuthProvider } from '../auth';
import { EventEmitter } from '../event-emitter';
import { LoggerUtil } from '../logger';
import { parseRealtimeData } from '../realtime-utils';
import {
  FetchLike,
  HttpMethod,
  SSEConnection,
  SSEResponseSchema,
  StandardSchemaV1,
} from '../types';
import { parseOrThrow } from '../validation';

export interface SSEConnectionOptions {
  skipResponseValidation?: boolean;
  withCredentials?: boolean;
  method?: HttpMethod;
  data?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  auth?: AuthProvider;
  logger?: LoggerUtil;
  fetch?: FetchLike;
}

export class SSEConnectionImpl<ResSchema extends SSEResponseSchema | undefined>
  extends EventEmitter
  implements SSEConnection<ResSchema>
{
  private abortController: AbortController = new AbortController();
  private _readyState: number = 0; // 0: CONNECTING, 1: OPEN, 2: CLOSED

  constructor(
    private url: string,
    private responseSchema?: ResSchema,
    private options: SSEConnectionOptions = {}
  ) {
    super();
    this.start();
  }

  private async start() {
    try {
      const { method = 'GET', data, withCredentials, signal, auth, logger } = this.options;

      const requestHeaders: Record<string, string> = {
        Accept: 'text/event-stream',
        ...this.options.headers,
      };

      const init: RequestInit = {
        method,
        headers: requestHeaders,
        signal: signal || this.abortController.signal,
      };

      let url = this.url;

      if (auth) {
        const ctx: AuthContext = { url, init };
        await auth.apply(ctx);
        url = ctx.url;
      }

      if (withCredentials) {
        init.credentials = 'include';
      }

      if (data != null) {
        init.body = typeof data === 'object' ? JSON.stringify(data) : String(data);
        if (!('Content-Type' in requestHeaders)) {
          requestHeaders['Content-Type'] = 'application/json';
        }
      }

      if (logger) {
        logger.debug('SSE connection initiated', { method, url, hasData: data != null });
      }

      const fetchImpl = this.options.fetch ?? globalThis.fetch.bind(globalThis);
      const response = await fetchImpl(url, init);

      if (!response.ok) {
        if (logger) {
          logger.error(
            `SSE request failed with status ${response.status}`,
            new Error('SSE Error'),
            { url, status: response.status }
          );
        }
        throw new Error(`SSE request failed with status ${response.status}`);
      }

      this._readyState = 1; // OPEN
      this.emit('open', { type: 'open' });

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Response body is not readable');
      }

      await this.readStream(reader);
    } catch (error) {
      if ((error as Error).name === 'AbortError') return;
      this._readyState = 2; // CLOSED
      this.emit('error', error);
    } finally {
      this._readyState = 2; // CLOSED
    }
  }

  /**
   * Reads the SSE stream according to the spec:
   * - Lines are separated by LF, CR, or CRLF
   * - Empty line dispatches the accumulated event
   * - Lines starting with ':' are comments
   * - 'event' field sets the event name; 'data' field accumulates the payload
   */
  private async readStream(reader: ReadableStreamDefaultReader<Uint8Array>) {
    const decoder = new TextDecoder();
    let lineBuffer = '';
    let eventData = '';
    let eventName = 'message';
    let lastCharWasCR = false;

    const processLine = (line: string) => {
      if (line === '') {
        if (eventData) {
          this.handleEvent(
            eventName,
            eventData.endsWith('\n') ? eventData.slice(0, -1) : eventData
          );
          eventData = '';
        }
        eventName = 'message';
        return;
      }

      if (line.startsWith(':')) return; // comment

      const colonIndex = line.indexOf(':');
      let field: string;
      let value: string;

      if (colonIndex === -1) {
        field = line;
        value = '';
      } else {
        field = line.slice(0, colonIndex);
        value = line.slice(colonIndex + 1);
        // Spec: remove a single leading space from the value
        if (value.startsWith(' ')) value = value.slice(1);
      }

      if (field === 'event') {
        eventName = value;
      } else if (field === 'data') {
        // Spec: append value followed by LF
        eventData += value + '\n';
      }
    };

    const processChunk = (chunk: string) => {
      for (let i = 0; i < chunk.length; i++) {
        const char = chunk[i];
        if (char === '\n') {
          if (lastCharWasCR) {
            // This \n is the second half of \r\n — skip it
            lastCharWasCR = false;
          } else {
            processLine(lineBuffer);
            lineBuffer = '';
          }
        } else if (char === '\r') {
          processLine(lineBuffer);
          lineBuffer = '';
          lastCharWasCR = true;
        } else {
          lastCharWasCR = false;
          lineBuffer += char;
        }
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      processChunk(decoder.decode(value, { stream: true }));

      if (done) {
        processChunk(decoder.decode()); // flush remaining bytes

        // Process any unterminated line at EOF
        if (lineBuffer) {
          processLine(lineBuffer);
          lineBuffer = '';
        }
        // Dispatch any pending event (EOF acts as implicit double newline)
        if (eventData) {
          this.handleEvent(
            eventName,
            eventData.endsWith('\n') ? eventData.slice(0, -1) : eventData
          );
        }
        break;
      }
    }
  }

  private async handleEvent(event: string, data: string) {
    let parsedData = parseRealtimeData(data);
    try {
      const schema = this.getSchema(event);
      if (!this.options.skipResponseValidation && schema) {
        parsedData = await parseOrThrow(schema, parsedData);
      }
      this.emit(event, parsedData);
    } catch (error) {
      this.emit('error', error);
    }
  }

  private getSchema(event: string): StandardSchemaV1 | undefined {
    if (!this.responseSchema) return undefined;
    if ('~standard' in this.responseSchema) {
      return event === 'message' ? (this.responseSchema as StandardSchemaV1) : undefined;
    }
    return (this.responseSchema as Record<string, StandardSchemaV1>)[event];
  }

  close(): void {
    this.abortController.abort();
    this._readyState = 2;
  }

  get readyState(): number {
    return this._readyState;
  }
}
