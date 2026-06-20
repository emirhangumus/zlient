import { describe, expect, it, mock } from 'bun:test';
import { z } from 'zod';
import { HttpClient } from '../lib/http/http-client';

function makeSSEClient(mockFetch: (...args: unknown[]) => unknown) {
  return new HttpClient({
    baseUrls: { default: 'http://localhost:3000' },
    fetch: mockFetch as unknown as typeof fetch,
  });
}

describe('SSE Support', () => {
  it('should receive and validate SSE messages', async () => {
    const encoder = new TextEncoder();
    const fetchMock = mock(async () => {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode('data: {"type": "connected"}\n\n'));
          setTimeout(() => {
            controller.enqueue(encoder.encode('data: {"type": "update", "value": 42}\n\n'));
            controller.close();
          }, 10);
        },
      });
      return { ok: true, status: 200, body: stream } as unknown as Response;
    });

    const client = makeSSEClient(fetchMock);
    const eventStream = client.createSSE({
      method: 'GET',
      path: '/events',
      response: z.discriminatedUnion('type', [
        z.object({ type: z.literal('connected') }),
        z.object({ type: z.literal('update'), value: z.number() }),
      ]),
    });

    const sse = await eventStream();
    let count = 0;

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timeout waiting for messages')), 2000);

      sse.on('message', (data) => {
        try {
          if (count === 0) {
            expect(data.type).toBe('connected');
          } else if (count === 1) {
            if (data.type === 'update') {
              expect(data.value).toBe(42);
            } else {
              throw new Error(`Expected type 'update', got '${data.type}'`);
            }
            clearTimeout(timeout);
            sse.close();
            resolve();
          }
          count++;
        } catch (e) {
          clearTimeout(timeout);
          reject(e);
        }
      });

      sse.on('error', (err) => {
        clearTimeout(timeout);
        reject(err instanceof Error ? err : new Error(String(err)));
      });
    });
  });

  it('should handle custom events', async () => {
    const encoder = new TextEncoder();
    const fetchMock = mock(async () => {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          setTimeout(() => {
            controller.enqueue(
              encoder.encode('event: custom\ndata: {"type": "custom_event", "val": 123}\n\n')
            );
            controller.close();
          }, 10);
        },
      });
      return { ok: true, status: 200, body: stream } as unknown as Response;
    });

    const client = makeSSEClient(fetchMock);
    const eventStream = client.createSSE({
      method: 'GET',
      path: '/events',
      response: z.object({ type: z.literal('custom_event'), val: z.number() }),
    });

    const sse = await eventStream();

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timeout waiting for custom event')), 2000);

      sse.on('custom', (data) => {
        clearTimeout(timeout);
        try {
          const event = data as { type: string; val: number };
          expect(event.type).toBe('custom_event');
          expect(event.val).toBe(123);
          sse.close();
          resolve();
        } catch (e) {
          reject(e);
        }
      });

      sse.on('error', (err) => {
        clearTimeout(timeout);
        reject(err instanceof Error ? err : new Error(String(err)));
      });
    });
  });

  it('should support multiple schemas for different event types', async () => {
    const encoder = new TextEncoder();
    const fetchMock = mock(async () => {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode('data: {"type": "connected"}\n\n'));
          setTimeout(() => {
            controller.enqueue(encoder.encode('event: time\ndata: "2024-03-26T00:00:00Z"\n\n'));
            controller.close();
          }, 10);
        },
      });
      return { ok: true, status: 200, body: stream } as unknown as Response;
    });

    const client = makeSSEClient(fetchMock);
    const eventStream = client.createSSE({
      method: 'GET',
      path: '/events',
      response: {
        message: z.object({ type: z.literal('connected') }),
        time: z.string(),
      },
    });

    const sse = await eventStream();
    let messageReceived = false;
    let timeReceived = false;

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timeout waiting for events')), 2000);

      const tryResolve = () => {
        if (messageReceived && timeReceived) {
          clearTimeout(timeout);
          sse.close();
          resolve();
        }
      };

      sse.on('message', (data) => {
        try {
          expect(data.type).toBe('connected');
          messageReceived = true;
          tryResolve();
        } catch (e) {
          clearTimeout(timeout);
          reject(e);
        }
      });

      sse.on('time', (data) => {
        try {
          expect(typeof data).toBe('string');
          expect(data).toBe('2024-03-26T00:00:00Z');
          timeReceived = true;
          tryResolve();
        } catch (e) {
          clearTimeout(timeout);
          reject(e);
        }
      });

      sse.on('error', (err) => {
        clearTimeout(timeout);
        reject(err instanceof Error ? err : new Error(String(err)));
      });
    });
  });
});
