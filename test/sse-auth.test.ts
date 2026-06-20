import { describe, expect, it, mock } from 'bun:test';
import { z } from 'zod';
import { HttpClient } from '../lib/http/http-client';
import { BearerTokenAuth, ApiKeyAuth } from '../lib/auth';

function makeStreamFetch(onCall: (url: string, init: RequestInit) => void) {
  return mock(async (url: string, init: RequestInit) => {
    onCall(url, init);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.close();
      },
    });
    return { ok: true, status: 200, body: stream } as unknown as Response;
  });
}

function waitForOpen(sse: {
  on: (event: string, handler: (...args: unknown[]) => void) => void;
  close: () => void;
  readyState: number;
}): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (sse.readyState === 1) { resolve(); return; }
    if (sse.readyState === 2) { reject(new Error('SSE already closed')); return; }
    sse.on('open', () => resolve());
    sse.on('error', (e: unknown) => {
      reject(e instanceof Error ? e : new Error(String(e)));
    });
  });
}

describe('SSE Authentication', () => {
  it('should apply Bearer token auth to SSE requests', async () => {
    let capturedHeaders: Record<string, string> = {};
    const mockFetch = makeStreamFetch((_, init) => {
      capturedHeaders = init.headers as Record<string, string>;
    });

    const client = new HttpClient({
      baseUrls: { default: 'http://localhost:3000' },
      headers: { 'X-Base-Header': 'base-value' },
      fetch: mockFetch,
    });
    client.setAuth(new BearerTokenAuth(() => 'test-token'));

    const eventStream = client.createSSE({
      method: 'GET',
      path: '/events',
      response: z.any(),
    });

    const sse = await eventStream();
    await waitForOpen(sse);

    expect(capturedHeaders['Authorization']).toBe('Bearer test-token');
    expect(capturedHeaders['X-Base-Header']).toBe('base-value');
    sse.close();
  });

  it('should apply query-based auth to SSE requests', async () => {
    let capturedUrl = '';
    const mockFetch = makeStreamFetch((url) => {
      capturedUrl = url;
    });

    const client = new HttpClient({
      baseUrls: { default: 'http://localhost:3000' },
      fetch: mockFetch,
    });
    client.setAuth(new ApiKeyAuth({ query: 'api_key', value: 'secret-key' }));

    const eventStream = client.createSSE({
      method: 'GET',
      path: '/events',
      response: z.any(),
    });

    const sse = await eventStream();
    await waitForOpen(sse);

    const url = new URL(capturedUrl);
    expect(url.searchParams.get('api_key')).toBe('secret-key');
    sse.close();
  });

  it('should skip auth if skipAuth is set in advanced options', async () => {
    let capturedHeaders: Record<string, string> = {};
    const mockFetch = makeStreamFetch((_, init) => {
      capturedHeaders = init.headers as Record<string, string>;
    });

    const client = new HttpClient({
      baseUrls: { default: 'http://localhost:3000' },
      fetch: mockFetch,
    });
    client.setAuth(new BearerTokenAuth(() => 'test-token'));

    const eventStream = client.createSSE({
      method: 'GET',
      path: '/events',
      response: z.any(),
      advanced: {
        skipAuth: true,
      },
    });

    const sse = await eventStream();
    await waitForOpen(sse);

    expect(capturedHeaders['Authorization']).toBeUndefined();
    sse.close();
  });
});
