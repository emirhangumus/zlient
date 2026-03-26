import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { HttpClient } from '../lib/http/http-client';

describe('SSE Data Loss Reproductions', () => {
  let client: HttpClient;

  beforeEach(() => {
    client = new HttpClient({
      baseUrls: { default: 'http://localhost:3000' },
    });
  });

  it('should handle \r\n split across chunks correctly', async () => {
    (globalThis as any).fetch = mock(async () => {
      const stream = new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder();
          controller.enqueue(encoder.encode('data: line1\r'));
          setTimeout(() => {
            controller.enqueue(encoder.encode('\n\n'));
            controller.close();
          }, 10);
        },
      });
      return { ok: true, status: 200, body: stream } as any;
    });

    const sse = await client.createSSE({ method: 'GET', path: '/events' })();
    const promise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timeout')), 1000);
      sse.on('message', (data: any) => {
        clearTimeout(timeout);
        try {
          expect(data).toBe('line1');
          resolve(null);
        } catch (e) {
          reject(e);
        }
      });
      sse.on('error', reject);
    });
    await promise;
  });

  it('should preserve whitespace according to spec', async () => {
    (globalThis as any).fetch = mock(async () => {
      const stream = new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder();
          controller.enqueue(encoder.encode('data:  leading space\n'));
          controller.enqueue(encoder.encode('data:trailing space \n\n'));
          controller.close();
        },
      });
      return { ok: true, status: 200, body: stream } as any;
    });

    const sse = await client.createSSE({ method: 'GET', path: '/events' })();
    const promise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timeout')), 1000);
      sse.on('message', (data: any) => {
        clearTimeout(timeout);
        try {
          expect(data).toBe(' leading space\ntrailing space ');
          resolve(null);
        } catch (e) {
          reject(e);
        }
      });
      sse.on('error', reject);
    });
    await promise;
  });

  it('should dispatch whitespace-only data', async () => {
    (globalThis as any).fetch = mock(async () => {
      const stream = new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder();
          controller.enqueue(encoder.encode('data:  \n\n'));
          controller.close();
        },
      });
      return { ok: true, status: 200, body: stream } as any;
    });

    const sse = await client.createSSE({ method: 'GET', path: '/events' })();
    const promise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timeout')), 1000);
      sse.on('message', (data: any) => {
        clearTimeout(timeout);
        try {
          expect(data).toBe(' ');
          resolve(null);
        } catch (e) {
          reject(e);
        }
      });
      sse.on('error', reject);
    });
    await promise;
  });

  it('should not lose the last message when stream closes abruptly', async () => {
    (globalThis as any).fetch = mock(async () => {
      const stream = new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder();
          controller.enqueue(encoder.encode('data: final message'));
          controller.close();
        },
      });
      return { ok: true, status: 200, body: stream } as any;
    });

    const sse = await client.createSSE({ method: 'GET', path: '/events' })();
    const promise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timeout')), 1000);
      sse.on('message', (data: any) => {
        clearTimeout(timeout);
        try {
          expect(data).toBe('final message');
          resolve(null);
        } catch (e) {
          reject(e);
        }
      });
      sse.on('error', reject);
    });
    await promise;
  });
});
