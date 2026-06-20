import type { EventHandler } from '../realtime-utils';
import { EventEmitter } from '../event-emitter';
import { parseRealtimeData, serializeRealtimeData } from '../realtime-utils';
import { WSConnection, StandardSchemaV1 } from '../types';
import { parseOrThrow } from '../validation';

export class WSConnectionImpl<
  SendSchema extends StandardSchemaV1 | undefined,
  ReceiveSchema extends StandardSchemaV1 | undefined,
>
  extends EventEmitter
  implements WSConnection<SendSchema, ReceiveSchema>
{
  private ws: WebSocket;

  constructor(
    url: string,
    private sendSchema?: SendSchema,
    private receiveSchema?: ReceiveSchema,
    private skipRequestValidation = false,
    private skipResponseValidation = false,
    protocols?: string | string[]
  ) {
    super();

    if (typeof WebSocket === 'undefined') {
      throw new Error('WebSocket is not defined. Ensure you are in a supported environment.');
    }

    this.ws = new WebSocket(url, protocols);

    this.ws.onopen = () => this.emit('open');
    this.ws.onclose = (event) => this.emit('close', event);
    this.ws.onerror = (event) => this.emit('error', event);
    this.ws.onmessage = async (event) => {
      let data = parseRealtimeData(event.data);
      try {
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
    this.ws.send(serializeRealtimeData(data));
  }

  // Overloads satisfy the WSConnection<> interface; implementation uses never[]
  // so that any function type (including () => void) is assignable to it.
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
  on(event: string, handler: (...args: never[]) => void): void {
    super.on(event, handler as EventHandler);
  }

  off(event: string, handler: (...args: never[]) => void): void {
    super.off(event, handler as EventHandler);
  }

  close(code?: number, reason?: string): void {
    this.ws.close(code, reason);
  }

  get readyState(): number {
    return this.ws.readyState;
  }
}
