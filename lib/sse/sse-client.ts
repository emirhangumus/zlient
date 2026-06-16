import { AuthProvider } from '../auth';
import { LoggerUtil } from '../logger';
import { HttpMethod, SSEConnection, SSEResponseSchema, StandardSchemaV1 } from '../types';
import { parseOrThrow } from '../validation';

type EventHandler = (...args: unknown[]) => void;

export interface SSEConnectionOptions {
  skipResponseValidation?: boolean;
  withCredentials?: boolean;
  method?: HttpMethod;
  data?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  auth?: AuthProvider;
  logger?: LoggerUtil;
}

export class SSEConnectionImpl<
  ResSchema extends SSEResponseSchema | undefined,
> implements SSEConnection<ResSchema> {
  private abortController: AbortController = new AbortController();
  private handlers: Map<string, Set<EventHandler>> = new Map();
  private _readyState: number = 0; // 0: CONNECTING, 1: OPEN, 2: CLOSED

  constructor(
    private url: string,
    private responseSchema?: ResSchema,
    private options: SSEConnectionOptions = {}
  ) {
    this.start();
  }

  private async start() {
    try {
      let {
        method = 'GET',
        data,
        headers = {},
        withCredentials,
        signal,
        auth,
        logger,
      } = this.options;
      let url = this.url;

      const requestHeaders: Record<string, string> = {
        Accept: 'text/event-stream',
        ...headers,
      };

      const init: RequestInit & { __urlOverride?: string } = {
        method,
        headers: requestHeaders,
        signal: signal || this.abortController.signal,
      };

      if (auth) {
        await auth.apply({ url, init });
        if (init.__urlOverride) {
          url = init.__urlOverride;
        }
      }

      if (withCredentials) {
        init.credentials = 'include';
      }

      if (data) {
        init.body = typeof data === 'object' ? JSON.stringify(data) : String(data);
        if (!('Content-Type' in requestHeaders)) {
          requestHeaders['Content-Type'] = 'application/json';
        }
      }

      if (logger) {
        logger.debug('SSE connection initiated', { method, url, hasData: !!data });
      }

      const response = await fetch(url, init);

      if (!response.ok) {
        if (logger) {
          logger.error(
            `SSE request failed with status ${response.status}`,
            new Error('SSE Error'),
            {
              url,
              status: response.status,
            }
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

      const decoder = new TextDecoder();
      let lineBuffer = '';
      let eventData = '';
      let eventName = 'message';
      let lastCharWasCR = false;

      const processLine = (line: string) => {
        if (line === '') {
          if (eventData) {
            // Remove the trailing newline added by the spec
            this.handleEvent(
              eventName,
              eventData.endsWith('\n') ? eventData.slice(0, -1) : eventData
            );
            eventData = '';
          }
          eventName = 'message';
          return;
        }

        if (line.startsWith(':')) return;

        const colonIndex = line.indexOf(':');
        let field: string;
        let value: string;

        if (colonIndex === -1) {
          field = line;
          value = '';
        } else {
          field = line.slice(0, colonIndex);
          value = line.slice(colonIndex + 1);
          // Spec: If value starts with a U+0020 SPACE character, remove it.
          if (value.startsWith(' ')) {
            value = value.slice(1);
          }
        }

        if (field === 'event') {
          eventName = value;
        } else if (field === 'data') {
          // Spec: Append the value to the data buffer, followed by a LF character.
          eventData += value + '\n';
        }
      };

      while (true) {
        const { done, value } = await reader.read();

        const chunk = decoder.decode(value, { stream: true });
        for (let i = 0; i < chunk.length; i++) {
          const char = chunk[i];
          if (char === '\n') {
            if (lastCharWasCR) {
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
            if (lastCharWasCR) {
              lastCharWasCR = false;
            }
            lineBuffer += char;
          }
        }

        if (done) {
          // Final flush of the decoder
          const finalChunk = decoder.decode();
          for (const char of finalChunk) {
            if (char === '\n') {
              if (lastCharWasCR) {
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
              if (lastCharWasCR) {
                lastCharWasCR = false;
              }
              lineBuffer += char;
            }
          }

          // If there's a remaining lineBuffer without a terminal newline, process it
          if (lineBuffer) {
            processLine(lineBuffer);
            lineBuffer = '';
          }
          // If there's a pending event, dispatch it (EOF acts as a final double-newline)
          if (eventData) {
            this.handleEvent(
              eventName,
              eventData.endsWith('\n') ? eventData.slice(0, -1) : eventData
            );
            eventData = '';
          }
          break;
        }
      }
    } catch (error) {
      if ((error as Error).name === 'AbortError') return;
      this._readyState = 2; // CLOSED
      this.emit('error', error);
    } finally {
      this._readyState = 2; // CLOSED
    }
  }

  private async handleEvent(event: string, data: string) {
    let parsedData: unknown = data;
    try {
      if (typeof data === 'string' && data.length > 0) {
        try {
          // Only attempt JSON parse if it looks like it could be JSON
          if (
            (data.startsWith('{') && data.endsWith('}')) ||
            (data.startsWith('[') && data.endsWith(']')) ||
            (data.startsWith('"') && data.endsWith('"'))
          ) {
            parsedData = JSON.parse(data);
          }
        } catch {
          // Not JSON or parse failed, keep as string
        }
      }

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
      if (event === 'message') {
        return this.responseSchema as StandardSchemaV1;
      }
      return undefined;
    }
    return (this.responseSchema as Record<string, StandardSchemaV1>)[event];
  }

  on(event: string, handler: EventHandler): void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);
  }

  off(event: string, handler: EventHandler): void {
    const handlers = this.handlers.get(event);
    if (handlers) {
      handlers.delete(handler);
    }
  }

  private emit(event: string, ...args: unknown[]): void {
    const handlers = this.handlers.get(event);
    if (handlers) {
      handlers.forEach((handler) => handler(...args));
    }
  }

  close(): void {
    this.abortController.abort();
    this._readyState = 2;
  }

  get readyState(): number {
    return this._readyState;
  }
}
