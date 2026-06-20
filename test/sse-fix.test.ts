import { describe, expect, it, mock } from 'bun:test';
import { HttpClient } from '../lib/http/http-client';

function makeClient(fetchImpl: typeof fetch) {
  return new HttpClient({
    baseUrls: { default: 'http://localhost:3000' },
    fetch: fetchImpl as unknown as typeof fetch,
  });
}

function makeStreamClient(chunks: Uint8Array[], delay = 0) {
  const mockFetch = mock(async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(chunk);
        }
        if (delay > 0) {
          setTimeout(() => controller.close(), delay);
        } else {
          controller.close();
        }
      },
    });
    return { ok: true, status: 200, body: stream } as unknown as Response;
  });
  return { client: makeClient(mockFetch as unknown as typeof fetch), mockFetch };
}

describe('SSE Data Loss Reproductions', () => {
  it('should handle \r\n split across chunks correctly', async () => {
    const encoder = new TextEncoder();
    const mockFetch = mock(async () => {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode('data: line1\r'));
          setTimeout(() => {
            controller.enqueue(encoder.encode('\n\n'));
            controller.close();
          }, 10);
        },
      });
      return { ok: true, status: 200, body: stream } as unknown as Response;
    });

    const client = makeClient(mockFetch as unknown as typeof fetch);
    const sse = await client.createSSE({ method: 'GET', path: '/events' })();
    const promise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timeout')), 1000);
      sse.on('message', (data: unknown) => {
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
    const encoder = new TextEncoder();
    const { client } = makeStreamClient([
      encoder.encode('data:  leading space\n'),
      encoder.encode('data:trailing space \n\n'),
    ]);

    const sse = await client.createSSE({ method: 'GET', path: '/events' })();
    const promise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timeout')), 1000);
      sse.on('message', (data: unknown) => {
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
    const encoder = new TextEncoder();
    const { client } = makeStreamClient([encoder.encode('data:  \n\n')]);

    const sse = await client.createSSE({ method: 'GET', path: '/events' })();
    const promise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timeout')), 1000);
      sse.on('message', (data: unknown) => {
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
    const encoder = new TextEncoder();
    const { client } = makeStreamClient([encoder.encode('data: final message')]);

    const sse = await client.createSSE({ method: 'GET', path: '/events' })();
    const promise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timeout')), 1000);
      sse.on('message', (data: unknown) => {
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
