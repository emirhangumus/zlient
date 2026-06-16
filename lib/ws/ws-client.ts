import { WSConnection, StandardSchemaV1 } from '../types';
import { parseOrThrow } from '../validation';

type EventHandler = (...args: unknown[]) => void;
type RegisteredHandler = (...args: never[]) => void;

export class WSConnectionImpl<
  SendSchema extends StandardSchemaV1 | undefined,
  ReceiveSchema extends StandardSchemaV1 | undefined,
> implements WSConnection<SendSchema, ReceiveSchema> {
  private ws: WebSocket;
  private handlers: Map<string, Set<EventHandler>> = new Map();

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

  async send(
    data: SendSchema extends StandardSchemaV1 ? StandardSchemaV1.InferInput<SendSchema> : unknown
  ): Promise<void> {
    if (!this.skipRequestValidation && this.sendSchema) {
      await parseOrThrow(this.sendSchema, data);
    }

    const message =
      data != null && typeof data === 'object'
        ? JSON.stringify(data)
        : typeof data === 'string'
          ? data
          : String(data);
    this.ws.send(message);
  }

  on(
    event: 'message',
    handler: (
      data: ReceiveSchema extends StandardSchemaV1
        ? StandardSchemaV1.InferOutput<ReceiveSchema>
        : unknown
    ) => void
  ): void;
  on(event: 'open', handler: () => void): void;
  on(event: 'close', handler: (event: CloseEvent) => void): void;
  on(event: 'error', handler: (event: unknown) => void): void;
  on(event: string, handler: (data: unknown) => void): void;
  on(event: string, handler: RegisteredHandler): void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler as EventHandler);
  }

  off(event: string, handler: RegisteredHandler): void {
    const handlers = this.handlers.get(event);
    if (handlers) {
      handlers.delete(handler as EventHandler);
    }
  }

  private emit(event: string, ...args: unknown[]): void {
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
