import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { z } from 'zod';
import { HttpClient } from '../lib/http/http-client';

describe('SSE Support', () => {
  let client: HttpClient;

  beforeEach(() => {
    client = new HttpClient({
      baseUrls: { default: 'http://localhost:3000' },
    });
  });

  it('should receive and validate SSE messages', async (done) => {
    (globalThis as any).fetch = mock(async () => {
      const stream = new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder();
          controller.enqueue(encoder.encode('data: {"type": "connected"}\n\n'));
          setTimeout(() => {
            controller.enqueue(encoder.encode('data: {"type": "update", "value": 42}\n\n'));
            controller.close();
          }, 10);
        },
      });
      return { ok: true, status: 200, body: stream } as any;
    });

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
          sse.close();
          done();
        }
        count++;
      } catch (e) {
        done(e);
      }
    });

    sse.on('error', (err) => done(err));
  });

  it('should handle custom events', async (done) => {
    (globalThis as any).fetch = mock(async () => {
      const stream = new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder();
          setTimeout(() => {
            controller.enqueue(
              encoder.encode('event: custom\ndata: {"type": "custom_event", "val": 123}\n\n')
            );
            controller.close();
          }, 10);
        },
      });
      return { ok: true, status: 200, body: stream } as any;
    });

    const eventStream = client.createSSE({
      method: 'GET',
      path: '/events',
      response: z.object({ type: z.literal('custom_event'), val: z.number() }),
    });

    const sse = await eventStream();
    sse.on('custom', (data) => {
      try {
        expect(data.type).toBe('custom_event');
        expect(data.val).toBe(123);
        sse.close();
        done();
      } catch (e) {
        done(e);
      }
    });
  });

  it('should support multiple schemas for different event types', async (done) => {
    (globalThis as any).fetch = mock(async () => {
      const stream = new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder();
          controller.enqueue(encoder.encode('data: {"type": "connected"}\n\n'));
          setTimeout(() => {
            controller.enqueue(encoder.encode('event: time\ndata: "2024-03-26T00:00:00Z"\n\n'));
            controller.close();
          }, 10);
        },
      });
      return { ok: true, status: 200, body: stream } as any;
    });

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

    sse.on('message', (data) => {
      try {
        expect(data.type).toBe('connected');
        messageReceived = true;
        if (messageReceived && timeReceived) {
          sse.close();
          done();
        }
      } catch (e) {
        done(e);
      }
    });

    sse.on('time', (data) => {
      try {
        expect(typeof data).toBe('string');
        expect(data).toBe('2024-03-26T00:00:00Z');
        timeReceived = true;
        if (messageReceived && timeReceived) {
          sse.close();
          done();
        }
      } catch (e) {
        done(e);
      }
    });
  });
});
