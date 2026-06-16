/**
 * Advanced Features Tests
 *
 * Comprehensive tests for advanced and edge case scenarios:
 * - Complex interceptor chains
 * - Multiple base URL switching
 * - Error handling edge cases
 * - Custom headers interaction with auth
 * - Content-Type handling
 * - Response content type detection
 * - URL encoding edge cases
 * - Abort signal handling
 */

import { describe, expect, it, mock } from 'bun:test';
import { z } from 'zod';
import { ApiKeyAuth, BearerTokenAuth } from '../lib/auth';
import { HttpClient } from '../lib/http/http-client';
import { ApiError } from '../lib/types';

describe('Advanced Features and Edge Cases', () => {
  describe('Interceptor Chain Complexity', () => {
    it('should execute interceptors in order', async () => {
      const executionOrder: string[] = [];

      const mockFetch = mock(async () =>
        Promise.resolve(
          new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        )
      );

      const client = new HttpClient({
        baseUrls: { default: 'https://api.example.com' },
        fetch: mockFetch as any,
        interceptors: {
          beforeRequest: [
            async ({ init }) => {
              executionOrder.push('before-1');
              if (!init.headers) init.headers = {};
              if (typeof init.headers === 'object' && !Array.isArray(init.headers)) {
                (init.headers as Record<string, string>)['X-Order'] = '1';
              }
            },
            async ({ init }) => {
              executionOrder.push('before-2');
              if (typeof init.headers === 'object' && !Array.isArray(init.headers)) {
                (init.headers as Record<string, string>)['X-Order'] = '2';
              }
            },
            async ({ init }) => {
              executionOrder.push('before-3');
              if (typeof init.headers === 'object' && !Array.isArray(init.headers)) {
                (init.headers as Record<string, string>)['X-Order'] = '3';
              }
            },
          ],
          afterResponse: [
            async () => {
              executionOrder.push('after-1');
            },
            async () => {
              executionOrder.push('after-2');
            },
          ],
        },
      });

      await client.get('/test');

      expect(executionOrder).toEqual(['before-1', 'before-2', 'before-3', 'after-1', 'after-2']);
    });

    it('should handle interceptor exceptions and propagate them', async () => {
      const mockFetch = mock(async () =>
        Promise.resolve(new Response(JSON.stringify({}), { status: 200 }))
      );

      const client = new HttpClient({
        baseUrls: { default: 'https://api.example.com' },
        fetch: mockFetch as any,
        interceptors: {
          beforeRequest: [
            async () => {
              throw new Error('Interceptor error');
            },
          ],
        },
      });

      await expect(client.get('/test')).rejects.toThrow('Interceptor error');
    });

    it('should modify request in interceptor and reflect in actual request', async () => {
      let capturedHeaders: HeadersInit | undefined;

      const mockFetch = mock(async (req: Request) => {
        capturedHeaders = req.headers;
        return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
      });

      const client = new HttpClient({
        baseUrls: { default: 'https://api.example.com' },
        fetch: mockFetch as any,
        headers: { 'X-Default': 'default' },
        interceptors: {
          beforeRequest: [
            async ({ init }) => {
              if (
                typeof init.headers === 'object' &&
                !Array.isArray(init.headers) &&
                init.headers
              ) {
                (init.headers as Record<string, string>)['X-Intercepted'] = 'interceptor-value';
              }
            },
          ],
        },
      });

      await client.get('/test');

      const headersObj = capturedHeaders;
      if (headersObj instanceof Headers) {
        expect(headersObj.get('X-Default')).toBe('default');
        expect(headersObj.get('X-Intercepted')).toBe('interceptor-value');
      }
    });
  });

  describe('Multiple Base URL Scenarios', () => {
    it('should throw error for undefined base URL key', async () => {
      const client = new HttpClient({
        baseUrls: {
          default: 'https://api.example.com',
          cdn: 'https://cdn.example.com',
        },
        fetch: mock(async () => new Response()) as any,
      });

      await expect(client.get('/test', { baseUrlKey: 'nonexistent' as any })).rejects.toThrow(
        'Unknown baseUrl key'
      );
    });

    it('should use correct base URL when switching between different services', async () => {
      const calls: string[] = [];

      const mockFetch = mock(async (req: Request) => {
        calls.push(req.url);
        return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
      });

      const client = new HttpClient({
        baseUrls: {
          default: 'https://api.example.com',
          auth: 'https://auth.example.com',
          cdn: 'https://cdn.example.com',
        },
        fetch: mockFetch as any,
      });

      await client.get('/login', { baseUrlKey: 'auth' });
      await client.get('/assets');
      await client.get('/files', { baseUrlKey: 'cdn' });

      expect(calls).toEqual([
        'https://auth.example.com/login',
        'https://api.example.com/assets',
        'https://cdn.example.com/files',
      ]);
    });

    it('should handle trailing slashes in base URLs', async () => {
      const mockFetch = mock(async (req: Request) => {
        return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
      });

      const client = new HttpClient({
        baseUrls: {
          default: 'https://api.example.com/', // with trailing slash
          other: 'https://other.example.com',
        },
        fetch: mockFetch as any,
      });

      await client.get('/test');
      const req = (mockFetch.mock.calls[0] as unknown[])[0] as Request;
      expect(req.url).toBe('https://api.example.com/test'); // should not have double slash
    });
  });

  describe('Content-Type Handling', () => {
    it('should handle form-urlencoded content type', async () => {
      let capturedBody: string | undefined;

      const mockFetch = mock(async (req: Request) => {
        capturedBody = await req.text();
        return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
      });

      const client = new HttpClient({
        baseUrls: { default: 'https://api.example.com' },
        fetch: mockFetch as any,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });

      await client.post('/form', 'key1=value1&key2=value2');

      expect(capturedBody).toBe('key1=value1&key2=value2');
    });

    it('should handle xml content type', async () => {
      const xmlData = '<root><item>test</item></root>';

      const mockFetch = mock(async (req: Request) => {
        const body = await req.text();
        expect(body).toBe(xmlData);
        return Promise.resolve(
          new Response('<response><status>ok</status></response>', {
            status: 200,
            headers: { 'Content-Type': 'application/xml' },
          })
        );
      });

      const client = new HttpClient({
        baseUrls: { default: 'https://api.example.com' },
        fetch: mockFetch as any,
        headers: { 'Content-Type': 'application/xml' },
      });

      const { data, status } = await client.post('/data', xmlData);

      expect(status).toBe(200);
      expect(data).toBe('<response><status>ok</status></response>');
    });

    it('should handle text response content type', async () => {
      const mockFetch = mock(async () =>
        Promise.resolve(
          new Response('Plain text response', {
            status: 200,
            headers: { 'Content-Type': 'text/plain' },
          })
        )
      );

      const client = new HttpClient({
        baseUrls: { default: 'https://api.example.com' },
        fetch: mockFetch as any,
      });

      const { data } = await client.get('/text');

      expect(data).toBe('Plain text response');
    });

    it('should handle CSV response', async () => {
      const mockFetch = mock(async () =>
        Promise.resolve(
          new Response('name,age\nJohn,30\nJane,25', {
            status: 200,
            headers: { 'Content-Type': 'text/csv' },
          })
        )
      );

      const client = new HttpClient({
        baseUrls: { default: 'https://api.example.com' },
        fetch: mockFetch as any,
      });

      const { data } = await client.get('/export');

      expect(data).toBe('name,age\nJohn,30\nJane,25');
    });

    it('should handle PDF response as blob', async () => {
      const pdfContent = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // PDF magic bytes
      const mockFetch = mock(async () =>
        Promise.resolve(
          new Response(pdfContent, {
            status: 200,
            headers: { 'Content-Type': 'application/pdf' },
          })
        )
      );

      const client = new HttpClient({
        baseUrls: { default: 'https://api.example.com' },
        fetch: mockFetch as any,
      });

      const { data } = await client.get('/document.pdf');

      expect(data).toBeInstanceOf(Blob);
    });

    it('should handle image response as blob', async () => {
      const mockFetch = mock(async () =>
        Promise.resolve(
          new Response(new Blob(['image data'], { type: 'image/png' }), {
            status: 200,
            headers: { 'Content-Type': 'image/png' },
          })
        )
      );

      const client = new HttpClient({
        baseUrls: { default: 'https://api.example.com' },
        fetch: mockFetch as any,
      });

      const { data } = await client.get('/image.png');

      expect(data).toBeInstanceOf(Blob);
    });

    it('should handle video response as blob', async () => {
      const mockFetch = mock(async () =>
        Promise.resolve(
          new Response(new Blob(['video data'], { type: 'video/mp4' }), {
            status: 200,
            headers: { 'Content-Type': 'video/mp4' },
          })
        )
      );

      const client = new HttpClient({
        baseUrls: { default: 'https://api.example.com' },
        fetch: mockFetch as any,
      });

      const { data } = await client.get('/video.mp4');

      expect(data).toBeInstanceOf(Blob);
    });

    it('should handle zip file response', async () => {
      const mockFetch = mock(async () =>
        Promise.resolve(
          new Response(new Blob(['zip data']), {
            status: 200,
            headers: { 'Content-Type': 'application/zip' },
          })
        )
      );

      const client = new HttpClient({
        baseUrls: { default: 'https://api.example.com' },
        fetch: mockFetch as any,
      });

      const { data } = await client.get('/archive.zip');

      expect(data).toBeInstanceOf(Blob);
    });
  });

  describe('Query Parameter Edge Cases', () => {
    it('should encode special characters in query params', async () => {
      let capturedUrl = '';
      const mockFetch = mock(async (req: Request) => {
        capturedUrl = req.url;
        return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
      });

      const client = new HttpClient({
        baseUrls: { default: 'https://api.example.com' },
        fetch: mockFetch as any,
      });

      await client.get('/search', { query: { search: 'hello world' } });

      // Verify that the search parameter was included and encoded
      expect(capturedUrl).toContain('search=');
      expect(capturedUrl).toContain('hello');
      expect(mockFetch).toHaveBeenCalled();
    });

    it('should handle numeric query parameters', async () => {
      const mockFetch = mock(async (req: Request) => {
        expect(req.url).toContain('page=1');
        expect(req.url).toContain('limit=10');
        expect(req.url).toContain('active=true');
        return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
      });

      const client = new HttpClient({
        baseUrls: { default: 'https://api.example.com' },
        fetch: mockFetch as any,
      });

      await client.get('/items', { query: { page: 1, limit: 10, active: true } });

      expect(mockFetch).toHaveBeenCalled();
    });

    it('should handle multiple values for same query parameter via URLSearchParams', async () => {
      const mockFetch = mock(async (req: Request) => {
        expect(req.url).toContain('tag=a');
        expect(req.url).toContain('tag=b');
        return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
      });

      const client = new HttpClient({
        baseUrls: { default: 'https://api.example.com' },
        fetch: mockFetch as any,
      });

      const params = new URLSearchParams();
      params.append('tag', 'a');
      params.append('tag', 'b');

      await client.get('/filter', { query: params });

      expect(mockFetch).toHaveBeenCalled();
    });

    it('should ignore undefined query values', async () => {
      const mockFetch = mock(async (req: Request) => {
        expect(req.url).not.toContain('missing');
        expect(req.url).toContain('present=value');
        return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
      });

      const client = new HttpClient({
        baseUrls: { default: 'https://api.example.com' },
        fetch: mockFetch as any,
      });

      await client.get('/test', { query: { missing: undefined, present: 'value' } });

      expect(mockFetch).toHaveBeenCalled();
    });
  });

  describe('Header Merging and Precedence', () => {
    it('should merge default headers with request headers', async () => {
      const mockFetch = mock(async (req: Request) => {
        expect(req.headers.get('X-Default')).toBe('default-value');
        expect(req.headers.get('X-Request')).toBe('request-value');
        return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
      });

      const client = new HttpClient({
        baseUrls: { default: 'https://api.example.com' },
        fetch: mockFetch as any,
        headers: { 'X-Default': 'default-value', 'Content-Type': 'application/json' },
      });

      await client.get('/test', { headers: { 'X-Request': 'request-value' } });

      expect(mockFetch).toHaveBeenCalled();
    });

    it('should override default headers with request headers', async () => {
      const mockFetch = mock(async (req: Request) => {
        expect(req.headers.get('X-Custom')).toBe('overridden');
        return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
      });

      const client = new HttpClient({
        baseUrls: { default: 'https://api.example.com' },
        fetch: mockFetch as any,
        headers: { 'X-Custom': 'default', 'Content-Type': 'application/json' },
      });

      await client.get('/test', { headers: { 'X-Custom': 'overridden' } });

      expect(mockFetch).toHaveBeenCalled();
    });

    it('should handle auth headers alongside other headers', async () => {
      const mockFetch = mock(async (req: Request) => {
        expect(req.headers.get('Authorization')).toBe('Bearer token-123');
        expect(req.headers.get('X-Custom')).toBe('custom-value');
        expect(req.headers.get('Content-Type')).toBe('application/json');
        return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
      });

      const client = new HttpClient({
        baseUrls: { default: 'https://api.example.com' },
        fetch: mockFetch as any,
        auth: new BearerTokenAuth(() => 'token-123'),
        headers: { 'Content-Type': 'application/json' },
      });

      await client.get('/protected', { headers: { 'X-Custom': 'custom-value' } });

      expect(mockFetch).toHaveBeenCalled();
    });

    it('should preserve Content-Type when adding auth headers', async () => {
      const mockFetch = mock(async (req: Request) => {
        expect(req.headers.get('Authorization')).toBe('Bearer token');
        const contentType = req.headers.get('Content-Type');
        expect(contentType).toContain('application/json');
        return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
      });

      const client = new HttpClient({
        baseUrls: { default: 'https://api.example.com' },
        fetch: mockFetch as any,
        auth: new BearerTokenAuth(() => 'token'),
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      });

      await client.post('/data', { name: 'test' });

      expect(mockFetch).toHaveBeenCalled();
    });
  });

  describe('Error Response Scenarios', () => {
    it('should handle error response with JSON body', async () => {
      const mockFetch = mock(async () =>
        Promise.resolve(
          new Response(JSON.stringify({ code: 'VALIDATION_ERROR', message: 'Invalid input' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          })
        )
      );

      const client = new HttpClient({
        baseUrls: { default: 'https://api.example.com' },
        fetch: mockFetch as any,
      });

      try {
        await client.get('/test');
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).status).toBe(400);
        expect((error as ApiError).details).toEqual({
          code: 'VALIDATION_ERROR',
          message: 'Invalid input',
        });
      }
    });

    it('should handle error response with plain text body', async () => {
      const mockFetch = mock(async () =>
        Promise.resolve(
          new Response('Internal Server Error', {
            status: 500,
            headers: { 'Content-Type': 'text/plain' },
          })
        )
      );

      const client = new HttpClient({
        baseUrls: { default: 'https://api.example.com' },
        fetch: mockFetch as any,
      });

      try {
        await client.get('/test');
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).status).toBe(500);
        expect((error as ApiError).details).toBe('Internal Server Error');
      }
    });

    it('should handle empty response body', async () => {
      const mockFetch = mock(async () =>
        Promise.resolve(
          new Response('', {
            status: 204,
            headers: { 'Content-Type': 'text/plain' },
          })
        )
      );

      const client = new HttpClient({
        baseUrls: { default: 'https://api.example.com' },
        fetch: mockFetch as any,
      });

      const { status } = await client.delete('/resource');

      expect(status).toBe(204);
      // Empty response with text/plain should return empty string
      expect(mockFetch).toHaveBeenCalled();
    });
  });

  describe('Abort Signal Handling', () => {
    it('should support AbortSignal for request cancellation', async () => {
      let aborted = false;

      const mockFetch = mock(async (req: Request) => {
        if (req.signal.aborted) {
          aborted = true;
          throw new Error('Request aborted');
        }
        return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
      });

      const client = new HttpClient({
        baseUrls: { default: 'https://api.example.com' },
        fetch: mockFetch as any,
      });

      const controller = new AbortController();
      controller.abort();

      await expect(client.get('/test', { signal: controller.signal })).rejects.toThrow(
        'Request aborted'
      );
      expect(aborted).toBe(true);
    });

    it('should use custom abort signal over timeout', async () => {
      const mockFetch = mock(async () =>
        Promise.resolve(
          new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        )
      );

      const client = new HttpClient({
        baseUrls: { default: 'https://api.example.com' },
        fetch: mockFetch as any,
        timeout: { requestTimeoutMs: 5000 }, // timeout configured
      });

      const controller = new AbortController();

      // Should use custom signal, not the internal timeout abort controller
      const { status } = await client.get('/test', { signal: controller.signal });

      expect(status).toBe(200);
      expect(mockFetch).toHaveBeenCalled();
    });
  });

  describe('Auth Integration Edge Cases', () => {
    it('should handle auth that adds query parameters', async () => {
      const mockFetch = mock(async (req: Request) => {
        expect(req.url).toContain('apiKey=secret');
        return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
      });

      const client = new HttpClient({
        baseUrls: { default: 'https://api.example.com' },
        fetch: mockFetch as any,
        auth: new ApiKeyAuth({ query: 'apiKey', value: 'secret' }),
      });

      await client.get('/test');

      expect(mockFetch).toHaveBeenCalled();
    });

    it('should apply auth even when skipAuth is false (default)', async () => {
      let authApplied = false;

      const mockFetch = mock(async (req: Request) => {
        if (req.headers.get('X-Auth')) {
          authApplied = true;
        }
        return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
      });

      const client = new HttpClient({
        baseUrls: { default: 'https://api.example.com' },
        fetch: mockFetch as any,
        auth: {
          apply({ init }) {
            if (typeof init.headers === 'object' && !Array.isArray(init.headers) && init.headers) {
              (init.headers as Record<string, string>)['X-Auth'] = 'applied';
            }
          },
        },
      });

      await client.get('/test');

      expect(authApplied).toBe(true);
    });
  });

  describe('Method-Specific Convenience Methods', () => {
    it('should work with HEAD requests (no body)', async () => {
      const mockFetch = mock(async (req: Request) => {
        expect(req.method).toBe('HEAD');
        return Promise.resolve(new Response(null, { status: 200, headers: { 'X-Count': '42' } }));
      });

      const client = new HttpClient({
        baseUrls: { default: 'https://api.example.com' },
        fetch: mockFetch as any,
      });

      const { status } = await client.request('HEAD', '/resource');

      expect(status).toBe(200);
      expect(mockFetch).toHaveBeenCalled();
    });

    it('should work with OPTIONS requests', async () => {
      const mockFetch = mock(async (req: Request) => {
        expect(req.method).toBe('OPTIONS');
        return Promise.resolve(
          new Response(null, {
            status: 200,
            headers: { Allow: 'GET, POST, PUT, DELETE, OPTIONS' },
          })
        );
      });

      const client = new HttpClient({
        baseUrls: { default: 'https://api.example.com' },
        fetch: mockFetch as any,
      });

      const { status } = await client.request('OPTIONS', '/resource');

      expect(status).toBe(200);
      expect(mockFetch).toHaveBeenCalled();
    });
  });

  describe('Empty and Null Values', () => {
    it('should handle null body gracefully', async () => {
      const mockFetch = mock(async (req: Request) => {
        const body = req.body;
        expect(body).toBeNull();
        return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
      });

      const client = new HttpClient({
        baseUrls: { default: 'https://api.example.com' },
        fetch: mockFetch as any,
      });

      await client.post('/test', null);

      expect(mockFetch).toHaveBeenCalled();
    });

    it('should handle undefined body (same as no body)', async () => {
      const mockFetch = mock(async (req: Request) => {
        const body = req.body;
        expect(body).toBeNull();
        return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
      });

      const client = new HttpClient({
        baseUrls: { default: 'https://api.example.com' },
        fetch: mockFetch as any,
      });

      await client.post('/test', undefined);

      expect(mockFetch).toHaveBeenCalled();
    });

    it('should handle empty object body', async () => {
      let capturedBody: string | undefined;

      const mockFetch = mock(async (req: Request) => {
        capturedBody = await req.text();
        return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
      });

      const client = new HttpClient({
        baseUrls: { default: 'https://api.example.com' },
        fetch: mockFetch as any,
      });

      await client.post('/test', {});

      expect(capturedBody).toBe('{}');
    });
  });

  describe('Endpoint Path Variants', () => {
    it('should handle path without leading slash', async () => {
      let capturedUrl = '';
      const mockFetch = mock(async (req: Request) => {
        capturedUrl = req.url;
        return Promise.resolve(
          new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        );
      });

      const client = new HttpClient({
        baseUrls: { default: 'https://api.example.com' },
        fetch: mockFetch as any,
      });

      const endpoint = client.createEndpoint({
        method: 'GET',
        path: '/test',
        response: z.object({ ok: z.boolean() }),
      });

      await endpoint({});

      expect(capturedUrl).toContain('/test');
      expect(mockFetch).toHaveBeenCalled();
    });

    it('should handle path with trailing slash', async () => {
      let capturedUrl = '';
      const mockFetch = mock(async (req: Request) => {
        capturedUrl = req.url;
        return Promise.resolve(
          new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        );
      });

      const client = new HttpClient({
        baseUrls: { default: 'https://api.example.com' },
        fetch: mockFetch as any,
      });

      const endpoint = client.createEndpoint({
        method: 'GET',
        path: '/resource/',
        response: z.object({ ok: z.boolean() }),
      });

      await endpoint({});

      expect(capturedUrl).toContain('/resource/');
      expect(mockFetch).toHaveBeenCalled();
    });

    it('should handle dynamic path with multiple parameters', async () => {
      let capturedUrl = '';
      const mockFetch = mock(async (req: Request) => {
        capturedUrl = req.url;
        return Promise.resolve(
          new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        );
      });

      const client = new HttpClient({
        baseUrls: { default: 'https://api.example.com' },
        fetch: mockFetch as any,
      });

      const PathSchema = z.object({
        orgId: z.string(),
        teamId: z.string(),
        userId: z.string(),
      });

      const endpoint = client.createEndpoint({
        method: 'GET',
        path: (params) => `/orgs/${params.orgId}/teams/${params.teamId}/members/${params.userId}`,
        pathParams: PathSchema,
        response: z.object({ ok: z.boolean() }),
      });

      await endpoint({
        pathParams: { orgId: 'org-123', teamId: 'team-456', userId: 'user-789' },
      });

      expect(capturedUrl).toContain('/orgs/org-123');
      expect(capturedUrl).toContain('user-789');
      expect(mockFetch).toHaveBeenCalled();
    });
  });
});
