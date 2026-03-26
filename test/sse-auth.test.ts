import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { z } from 'zod';
import { HttpClient } from '../lib/http/http-client';
import { BearerTokenAuth, ApiKeyAuth } from '../lib/auth';

describe('SSE Authentication', () => {
  let client: HttpClient;

  beforeEach(() => {
    client = new HttpClient({
      baseUrls: { default: 'http://localhost:3000' },
      headers: { 'X-Base-Header': 'base-value' },
    });
  });

  it('should apply Bearer token auth to SSE requests', async (done) => {
    let capturedHeaders: Record<string, string> = {};
    (globalThis as any).fetch = mock(async (url: string, init: any) => {
      capturedHeaders = init.headers;
      const stream = new ReadableStream({
        start(controller) {
          controller.close();
        },
      });
      return { ok: true, status: 200, body: stream } as any;
    });

    client.setAuth(new BearerTokenAuth(() => 'test-token'));

    const eventStream = client.createSSE({
      method: 'GET',
      path: '/events',
      response: z.any(),
    });

    const sse = await eventStream();

    setTimeout(() => {
      try {
        expect(capturedHeaders['Authorization']).toBe('Bearer test-token');
        expect(capturedHeaders['X-Base-Header']).toBe('base-value');
        sse.close();
        done();
      } catch (e) {
        done(e);
      }
    }, 50);
  });

  it('should apply query-based auth to SSE requests', async (done) => {
    let capturedUrl: string = '';
    (globalThis as any).fetch = mock(async (url: string, init: any) => {
      capturedUrl = url;
      const stream = new ReadableStream({
        start(controller) {
          controller.close();
        },
      });
      return { ok: true, status: 200, body: stream } as any;
    });

    client.setAuth(new ApiKeyAuth({ query: 'api_key', value: 'secret-key' }));

    const eventStream = client.createSSE({
      method: 'GET',
      path: '/events',
      response: z.any(),
    });

    const sse = await eventStream();

    setTimeout(() => {
      try {
        const url = new URL(capturedUrl);
        expect(url.searchParams.get('api_key')).toBe('secret-key');
        sse.close();
        done();
      } catch (e) {
        done(e);
      }
    }, 50);
  });

  it('should skip auth if skipAuth is set in advanced options', async (done) => {
    let capturedHeaders: Record<string, string> = {};
    (globalThis as any).fetch = mock(async (url: string, init: any) => {
      capturedHeaders = init.headers;
      const stream = new ReadableStream({
        start(controller) {
          controller.close();
        },
      });
      return { ok: true, status: 200, body: stream } as any;
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

    setTimeout(() => {
      try {
        expect(capturedHeaders['Authorization']).toBeUndefined();
        sse.close();
        done();
      } catch (e) {
        done(e);
      }
    }, 50);
  });
});
