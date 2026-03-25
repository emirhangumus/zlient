import { SSEConnection, SSEResponseSchema, StandardSchemaV1 } from '../types';
import { parseOrThrow } from '../validation';

export class SSEConnectionImpl<
  ResSchema extends SSEResponseSchema | undefined,
> implements SSEConnection<ResSchema> {
  private es: EventSource;
  private handlers: Map<string, Set<Function>> = new Map();

  constructor(
    url: string,
    private responseSchema?: ResSchema,
    private skipResponseValidation = false,
    withCredentials = false
  ) {
    if (typeof EventSource === 'undefined') {
      throw new Error('EventSource is not defined. Ensure you are in a supported environment.');
    }

    this.es = new EventSource(url, { withCredentials });

    this.es.onopen = (event) => this.emit('open', event);
    this.es.onerror = (event) => this.emit('error', event);
    this.es.onmessage = async (event) => {
      let data = event.data;
      try {
        if (typeof data === 'string') {
          try {
            data = JSON.parse(data);
          } catch {
            // Not JSON
          }
        }

        const schema = this.getSchema('message');
        if (!this.skipResponseValidation && schema) {
          data = await parseOrThrow(schema, data);
        }
        this.emit('message', data);
      } catch (error) {
        this.emit('error', error);
      }
    };
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
      // For custom events in SSE
      if (event !== 'message' && event !== 'open' && event !== 'error') {
        this.es.addEventListener(event, async (ev: any) => {
          let data = ev.data;
          try {
            if (typeof data === 'string') {
              try {
                data = JSON.parse(data);
              } catch {
                // Not JSON
              }
            }
            const schema = this.getSchema(event);
            if (!this.skipResponseValidation && schema) {
              data = await parseOrThrow(schema, data);
            }
            this.emit(event, data);
          } catch (error) {
            this.emit('error', error);
          }
        });
      }
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
    this.es.close();
  }

  get readyState(): number {
    return this.es.readyState;
  }
}
