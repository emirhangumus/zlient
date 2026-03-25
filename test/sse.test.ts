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

  it('should receive and validate SSE messages', (done) => {
    // Mock EventSource
    const mockEventSource = {
      onopen: null as any,
      onmessage: null as any,
      onerror: null as any,
      readyState: 0,
      close: mock(() => {}),
      addEventListener: mock((_event: string, _handler: any) => {}),
    };

    (globalThis as any).EventSource = mock(function (_url: string) {
      setTimeout(() => {
        if (mockEventSource.onopen) mockEventSource.onopen({});
        if (mockEventSource.onmessage) {
          mockEventSource.onmessage({ data: JSON.stringify({ type: 'connected' }) });
        }
        setTimeout(() => {
          if (mockEventSource.onmessage) {
            mockEventSource.onmessage({ data: JSON.stringify({ type: 'update', value: 42 }) });
          }
        }, 10);
      }, 0);
      return mockEventSource;
    });

    const eventStream = client.createSSE({
      path: '/events',
      response: z.discriminatedUnion('type', [
        z.object({ type: z.literal('connected') }),
        z.object({ type: z.literal('update'), value: z.number() }),
      ]),
    });

    const sse = eventStream();
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

  it('should handle custom events', (done) => {
    const mockEventSource = {
      onopen: null as any,
      onmessage: null as any,
      onerror: null as any,
      readyState: 0,
      close: mock(() => {}),
      addEventListener: mock((event: string, handler: any) => {
        if (event === 'custom') {
          setTimeout(() => {
            handler({ data: JSON.stringify({ type: 'custom_event', val: 123 }) });
          }, 10);
        }
      }),
    };

    (globalThis as any).EventSource = mock(() => mockEventSource);

    const eventStream = client.createSSE({
      path: '/events',
      response: z.object({ type: z.literal('custom_event'), val: z.number() }),
    });

    const sse = eventStream();
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
});
