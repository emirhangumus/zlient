import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { z } from 'zod';
import { HttpClient } from '../lib/http/http-client';

describe('SSE Method and Body Support', () => {
  let client: HttpClient;

  beforeEach(() => {
    client = new HttpClient({
      baseUrls: { default: 'http://localhost:3000' },
    });
    // Mock global fetch
    (globalThis as any).fetch = mock(async (url: string, init: RequestInit) => {
      const stream = new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder();
          controller.enqueue(encoder.encode('event: open\ndata: {}\n\n'));
          controller.enqueue(encoder.encode('data: {"type":"message","val":123}\n\n'));
          setTimeout(() => {
            controller.enqueue(
              encoder.encode('event: custom\ndata: {"type":"custom","val":456}\n\n')
            );
            controller.close();
          }, 10);
        },
      });

      return {
        ok: true,
        status: 200,
        body: stream,
        headers: new Headers({ 'Content-Type': 'text/event-stream' }),
      } as any;
    });
  });

  it('should support POST method and data', async (done) => {
    const eventStream = client.createSSE({
      method: 'POST',
      path: '/events',
      response: z.object({ type: z.string(), val: z.number() }),
      request: z.object({ foo: z.string() }),
    });

    const sse = await eventStream({
      data: { foo: 'bar' },
      headers: { 'X-Custom-Header': 'baz' },
    });

    sse.on('message', (data) => {
      try {
        expect(data.type).toBe('message');
        expect(data.val).toBe(123);

        // Check if fetch was called correctly
        const fetchMock = (globalThis as any).fetch as any;
        const [url, init] = fetchMock.mock.calls[0];
        expect(init.method).toBe('POST');
        expect(init.body).toBe(JSON.stringify({ foo: 'bar' }));
        expect(init.headers['X-Custom-Header']).toBe('baz');
        expect(init.headers['Accept']).toBe('text/event-stream');
      } catch (e) {
        done(e);
      }
    });

    sse.on('custom', (data) => {
      try {
        const event = data as { type: string; val: number };
        expect(event.type).toBe('custom');
        expect(event.val).toBe(456);
        sse.close();
        done();
      } catch (e) {
        done(e);
      }
    });
  });

  it('should validate request data', async () => {
    const eventStream = client.createSSE({
      method: 'POST',
      path: '/events',
      response: z.any(),
      request: z.object({ foo: z.string() }),
    });

    await expect(eventStream({ data: { foo: 123 } as any })).rejects.toThrow();
  });

  it('should handle multiline data', async (done) => {
    (globalThis as any).fetch = mock(async () => {
      const stream = new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder();
          controller.enqueue(encoder.encode('data: line1\ndata: line2\n\n'));
          controller.close();
        },
      });
      return { ok: true, status: 200, body: stream } as any;
    });

    const eventStream = client.createSSE({
      method: 'GET',
      path: '/events',
      response: z.string(),
    });

    const sse = await eventStream();

    sse.on('message', (data) => {
      try {
        expect(data).toBe('line1\nline2');
        done();
      } catch (e) {
        done(e);
      }
    });
  });
});
