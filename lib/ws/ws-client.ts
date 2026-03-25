import { WSConnection, StandardSchemaV1 } from '../types';
import { parseOrThrow } from '../validation';

export class WSConnectionImpl<
  SendSchema extends StandardSchemaV1 | undefined,
  ReceiveSchema extends StandardSchemaV1 | undefined,
> implements WSConnection<SendSchema, ReceiveSchema> {
  private ws: WebSocket;
  private handlers: Map<string, Set<Function>> = new Map();

  constructor(
    url: string,
    private sendSchema?: SendSchema,
    private receiveSchema?: ReceiveSchema,
    private skipRequestValidation = false,
    private skipResponseValidation = false,
    protocols?: string | string[]
  ) {
    if (typeof WebSocket === 'undefined') {
      throw new Error('WebSocket is not defined. Ensure you are in a supported environment.');
    }

    this.ws = new WebSocket(url, protocols);

    this.ws.onopen = () => this.emit('open');
    this.ws.onclose = (event) => this.emit('close', event);
    this.ws.onerror = (event) => this.emit('error', event);
    this.ws.onmessage = async (event) => {
      let data = event.data;
      try {
        if (typeof data === 'string') {
          try {
            data = JSON.parse(data);
          } catch {
            // Not JSON, keep as string
          }
        }

        if (!this.skipResponseValidation && this.receiveSchema) {
          data = await parseOrThrow(this.receiveSchema, data);
        }
        this.emit('message', data);
      } catch (error) {
        this.emit('error', error);
      }
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async send(data: any): Promise<void> {
    if (!this.skipRequestValidation && this.sendSchema) {
      await parseOrThrow(this.sendSchema, data);
    }

    const message = data != null && typeof data === 'object' ? JSON.stringify(data) : data;
    this.ws.send(message);
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

  close(code?: number, reason?: string): void {
    this.ws.close(code, reason);
  }

  get readyState(): number {
    return this.ws.readyState;
  }
}
