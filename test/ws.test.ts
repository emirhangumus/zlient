import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { z } from 'zod';
import { HttpClient } from '../lib/http/http-client';
import { ApiError } from '../lib/types';

describe('WebSocket Support', () => {
  let client: HttpClient;
  let originalWebSocket: typeof WebSocket | undefined;

  class FakeWebSocket {
    static instances: FakeWebSocket[] = [];
    static readonly CONNECTING = 0;
    static readonly OPEN = 1;
    static readonly CLOSING = 2;
    static readonly CLOSED = 3;

    onopen: (() => void) | null = null;
    onclose: ((event: CloseEvent) => void) | null = null;
    onerror: ((event: unknown) => void) | null = null;
    onmessage: ((event: MessageEvent) => void) | null = null;
    readyState = FakeWebSocket.CONNECTING;
    sentMessages: string[] = [];

    constructor(
      readonly url: string,
      readonly protocols?: string | string[]
    ) {
      FakeWebSocket.instances.push(this);
      setTimeout(() => {
        this.readyState = FakeWebSocket.OPEN;
        this.onopen?.();
      }, 0);
    }

    send(message: string) {
      this.sentMessages.push(message);
      try {
        const data = JSON.parse(message);
        if (data.type === 'hello') {
          queueMicrotask(() => {
            this.onmessage?.({
              data: JSON.stringify({ type: 'welcome', user: 'bot' }),
            } as MessageEvent);
          });
        }
      } catch {
        // Non-JSON test messages are ignored by the fake transport.
      }
    }

    close(code?: number, reason?: string) {
      this.readyState = FakeWebSocket.CLOSED;
      this.onclose?.({ code, reason } as CloseEvent);
    }
  }

  beforeEach(() => {
    originalWebSocket = globalThis.WebSocket;
    FakeWebSocket.instances = [];
    (globalThis as unknown as { WebSocket: typeof WebSocket }).WebSocket =
      FakeWebSocket as unknown as typeof WebSocket;

    client = new HttpClient({
      baseUrls: { default: 'http://localhost:3001' },
    });
  });

  afterEach(() => {
    if (originalWebSocket) {
      (globalThis as unknown as { WebSocket: typeof WebSocket }).WebSocket = originalWebSocket;
    } else {
      delete (globalThis as unknown as { WebSocket?: typeof WebSocket }).WebSocket;
    }
  });

  it('should connect and exchange typed messages', async () => {
    const chatWs = client.createWebSocket({
      path: '/chat',
      send: z.object({ type: z.string() }),
      receive: z.object({ type: z.string(), user: z.string() }),
    });

    const socket = await chatWs();

    await new Promise<void>((resolve, reject) => {
      socket.on('open', () => {
        socket.send({ type: 'hello' });
      });

      socket.on('message', (data) => {
        try {
          expect(data.type).toBe('welcome');
          expect(data.user).toBe('bot');
          socket.close();
          resolve();
        } catch (e) {
          reject(e);
        }
      });

      socket.on('error', (err) => reject(new Error(String(err))));
    });
  });

  it('should handle path parameters', async () => {
    const roomWs = client.createWebSocket({
      path: (params) => `/rooms/${params.id}`,
      pathParams: z.object({ id: z.string() }),
      receive: z.any(),
    });

    const socket = await roomWs({ pathParams: { id: '123' } });

    await new Promise<void>((resolve, reject) => {
      socket.on('open', () => {
        expect(FakeWebSocket.instances[0].url).toBe('ws://localhost:3001/rooms/123');
        socket.close();
        resolve();
      });
      socket.on('error', (err) => reject(new Error(String(err))));
    });
  });

  it('should validate path parameters before connecting', async () => {
    const roomWs = client.createWebSocket({
      path: (params) => `/rooms/${params.id}`,
      pathParams: z.object({ id: z.string() }),
      receive: z.any(),
    });

    await expect(
      async () => await roomWs({ pathParams: { id: 123 as unknown as string } })
    ).toThrow(ApiError);
    expect(FakeWebSocket.instances).toHaveLength(0);
  });

  it('should validate query parameters before connecting', async () => {
    const roomWs = client.createWebSocket({
      path: '/rooms',
      query: z.object({ token: z.string() }),
      receive: z.any(),
    });

    await expect(
      async () => await roomWs({ query: { token: 123 as unknown as string } })
    ).toThrow(ApiError);
    expect(FakeWebSocket.instances).toHaveLength(0);
  });

  it('should skip endpoint request validation when configured', async () => {
    const roomWs = client.createWebSocket({
      path: (params) => `/rooms/${params.id}`,
      pathParams: z.object({ id: z.string() }),
      query: z.object({ token: z.string() }),
      receive: z.any(),
      advanced: { skipRequestValidation: true },
    });

    const socket = await roomWs({
      pathParams: { id: 123 as unknown as string },
      query: { token: 456 as unknown as string },
    });

    await new Promise<void>((resolve, reject) => {
      socket.on('open', () => {
        expect(FakeWebSocket.instances[0].url).toBe('ws://localhost:3001/rooms/123?token=456');
        socket.close();
        resolve();
      });
      socket.on('error', (err) => reject(new Error(String(err))));
    });
  });

  it('should throw validation error on invalid send', async () => {
    const validatedWs = client.createWebSocket({
      path: '/chat',
      send: z.object({ text: z.string() }),
    });

    const socket = await validatedWs();
    try {
      await socket.send({ text: 123 as unknown as string });
      expect(true).toBe(false);
    } catch (e: unknown) {
      expect(e).toBeInstanceOf(ApiError);
      expect((e as ApiError).message).toContain('Validation failed');
    } finally {
      socket.close();
    }
  });
});
