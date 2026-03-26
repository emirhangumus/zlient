import { SSEConnection, SSEResponseSchema, StandardSchemaV1, HttpMethod } from '../types';
import { parseOrThrow } from '../validation';

export interface SSEConnectionOptions {
  skipResponseValidation?: boolean;
  withCredentials?: boolean;
  method?: HttpMethod;
  body?: any;
  headers?: Record<string, string>;
}

export class SSEConnectionImpl<
  ResSchema extends SSEResponseSchema | undefined,
> implements SSEConnection<ResSchema> {
  private abortController: AbortController = new AbortController();
  private handlers: Map<string, Set<Function>> = new Map();
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
      const { method = 'GET', body, headers = {}, withCredentials } = this.options;

      const init: RequestInit = {
        method,
        headers: {
          Accept: 'text/event-stream',
          ...headers,
        },
        signal: this.abortController.signal,
      };

      if (withCredentials) {
        init.credentials = 'include';
      }

      if (body) {
        init.body = typeof body === 'object' ? JSON.stringify(body) : String(body);
        if (!init.headers || !('Content-Type' in (init.headers as any))) {
          (init.headers as any)['Content-Type'] = 'application/json';
        }
      }

      const response = await fetch(this.url, init);

      if (!response.ok) {
        throw new Error(`SSE request failed with status ${response.status}`);
      }

      this._readyState = 1; // OPEN
      this.emit('open', { type: 'open' });

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Response body is not readable');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split(/\r\n|\r|\n/);
        buffer = parts.pop() || '';

        let eventData = '';
        let eventName = 'message';

        for (const line of parts) {
          if (line === '') {
            if (eventData) {
              this.handleEvent(eventName, eventData.trim());
              eventData = '';
              eventName = 'message';
            }
            continue;
          }

          if (line.startsWith(':')) continue;

          const colonIndex = line.indexOf(':');
          if (colonIndex === -1) {
            // Field only
            this.processField(line, '', (name, data) => {
              eventName = name || eventName;
              eventData += data;
            });
          } else {
            const field = line.slice(0, colonIndex);
            const value = line.slice(colonIndex + 1).trim();
            if (field === 'event') {
              eventName = value;
            } else if (field === 'data') {
              eventData += (eventData ? '\n' : '') + value;
            }
            // Ignore other fields like id, retry for now
          }
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

  private processField(
    field: string,
    value: string,
    callback: (name: string, data: string) => void
  ) {
    if (field === 'event') {
      callback(value, '');
    } else if (field === 'data') {
      callback('', value);
    }
  }

  private async handleEvent(event: string, data: string) {
    let parsedData: any = data;
    try {
      if (typeof data === 'string') {
        try {
          parsedData = JSON.parse(data);
        } catch {
          // Not JSON
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

  on(event: string, handler: Function): void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);
  }

  off(event: string, handler: Function): void {
    const handlers = this.handlers.get(event);
    if (handlers) {
      handlers.delete(handler);
    }
  }

  private emit(event: string, ...args: any[]): void {
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
