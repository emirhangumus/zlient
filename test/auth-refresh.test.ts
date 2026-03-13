import { describe, expect, it, mock } from 'bun:test';
import { BearerTokenAuth } from '../lib/auth';
import { HttpClient } from '../lib/http/http-client';
import { HTTPStatusCode } from '../lib/types';

describe('Auth Refresh Mechanism', () => {
  it('should refresh token and retry request when onUnauthenticated returns true', async () => {
    let token = 'token-1';
    let callCount = 0;

    // Mock fetch: returns 401 first, then 200
    const mockFetch = mock(async (req: Request) => {
      callCount++;
      const authHeader = req.headers.get('Authorization');

      if (callCount === 1) {
        expect(authHeader).toBe('Bearer token-1');
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (callCount === 2) {
        // Should have the new token
        expect(authHeader).toBe('Bearer token-2');
        return new Response(JSON.stringify({ id: 1, name: 'Success' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return new Response('Error', { status: 500 });
    });

    const client = new HttpClient({
      baseUrls: { default: 'https://api.example.com' },
      fetch: mockFetch as any,
      auth: new BearerTokenAuth(() => token),
      onUnauthenticated: async () => {
        // Simulate refresh
        token = 'token-2';
        return true; // Retry
      },
    });

    const { data, status } = await client.get('/protected');

    expect(status).toBe(HTTPStatusCode.OK);
    expect(data).toEqual({ id: 1, name: 'Success' });
    expect(callCount).toBe(2);
  });

  it('should not retry if onUnauthenticated returns false', async () => {
    const mockFetch = mock(async () => {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const client = new HttpClient({
      baseUrls: { default: 'https://api.example.com' },
      fetch: mockFetch as any,
      auth: new BearerTokenAuth(() => 'token-1'),
      onUnauthenticated: async () => {
        return false; // Do not retry
      },
    });

    // Actually, looking at `request` method:
    // It returns data and status. It catches errors.
    // So if fetch returns 401, it returns data and status 401.
    // UNLESS validation fails? The `endpoint` wrapper does validation.
    // Basic `client.request` does not enforce validation on response unless we use `createEndpoint`.
    // So `client.get` should return the 401 response.

    const { status } = await client.get('/protected');
    expect(status).toBe(HTTPStatusCode.UNAUTHORIZED);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('should prevent infinite loops by retrying only once', async () => {
    let callCount = 0;
    const mockFetch = mock(async () => {
      callCount++;
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const client = new HttpClient({
      baseUrls: { default: 'https://api.example.com' },
      fetch: mockFetch as any,
      auth: new BearerTokenAuth(() => 'token-1'),
      onUnauthenticated: async () => {
        return true; // Always say retry
      },
    });

    const result = await client.get('/protected');
    expect(result.status).toBe(HTTPStatusCode.UNAUTHORIZED);
    expect(callCount).toBe(2); // Initial + 1 retry
  });

  it('should work with synchronous onUnauthenticated callback', async () => {
    let token = 'token-1';
    let callCount = 0;

    const mockFetch = mock(async (req: Request) => {
      callCount++;
      const authHeader = req.headers.get('Authorization');

      if (callCount === 1) {
        expect(authHeader).toBe('Bearer token-1');
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      expect(authHeader).toBe('Bearer token-2');
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const client = new HttpClient({
      baseUrls: { default: 'https://api.example.com' },
      fetch: mockFetch as any,
      auth: new BearerTokenAuth(() => token),
      onUnauthenticated: () => {
        // Synchronous callback
        token = 'token-2';
        return true;
      },
    });

    const { status, data } = await client.get('/protected');
    expect(status).toBe(HTTPStatusCode.OK);
    expect(data).toEqual({ success: true });
    expect(callCount).toBe(2);
  });

  it('should handle errors thrown in onUnauthenticated callback', async () => {
    const mockFetch = mock(async () => {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const client = new HttpClient({
      baseUrls: { default: 'https://api.example.com' },
      fetch: mockFetch as any,
      auth: new BearerTokenAuth(() => 'token-1'),
      onUnauthenticated: async () => {
        throw new Error('Token refresh failed');
      },
    });

    await expect(client.get('/protected')).rejects.toThrow('Token refresh failed');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('should provide cloned response to onUnauthenticated', async () => {
    let capturedResponse: Response | null = null;

    const mockFetch = mock(async () => {
      return new Response(JSON.stringify({ error: 'Unauthorized', code: 'AUTH_EXPIRED' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', 'X-Auth-Error': 'token-expired' },
      });
    });

    const client = new HttpClient({
      baseUrls: { default: 'https://api.example.com' },
      fetch: mockFetch as any,
      auth: new BearerTokenAuth(() => 'token-1'),
      onUnauthenticated: async (response) => {
        capturedResponse = response;
        // Verify we can read the response
        const body = await response.json();
        expect(body).toEqual({ error: 'Unauthorized', code: 'AUTH_EXPIRED' });
        expect(response.status).toBe(401);
        expect(response.headers.get('X-Auth-Error')).toBe('token-expired');
        return false;
      },
    });

    await client.get('/protected');
    expect(capturedResponse).not.toBeNull();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('should work with POST requests', async () => {
    let token = 'token-1';
    let callCount = 0;

    const mockFetch = mock(async (req: Request) => {
      callCount++;
      const body = await req.json();

      if (callCount === 1) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      expect(req.headers.get('Authorization')).toBe('Bearer token-2');
      expect(body).toEqual({ data: 'test' });
      return new Response(JSON.stringify({ created: true }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const client = new HttpClient({
      baseUrls: { default: 'https://api.example.com' },
      fetch: mockFetch as any,
      auth: new BearerTokenAuth(() => token),
      onUnauthenticated: async () => {
        token = 'token-2';
        return true;
      },
    });

    const { status, data } = await client.post('/resource', { data: 'test' });
    expect(status).toBe(HTTPStatusCode.CREATED);
    expect(data).toEqual({ created: true });
    expect(callCount).toBe(2);
  });

  it('should work with PUT requests', async () => {
    let token = 'old-token';
    let callCount = 0;

    const mockFetch = mock(async (req: Request) => {
      callCount++;

      if (callCount === 1) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      expect(req.headers.get('Authorization')).toBe('Bearer new-token');
      return new Response(JSON.stringify({ updated: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const client = new HttpClient({
      baseUrls: { default: 'https://api.example.com' },
      fetch: mockFetch as any,
      auth: new BearerTokenAuth(() => token),
      onUnauthenticated: async () => {
        token = 'new-token';
        return true;
      },
    });

    const { status } = await client.put('/resource/1', { name: 'updated' });
    expect(status).toBe(HTTPStatusCode.OK);
    expect(callCount).toBe(2);
  });

  it('should work with DELETE requests', async () => {
    let token = 'old-token';
    let callCount = 0;

    const mockFetch = mock(async (req: Request) => {
      callCount++;

      if (callCount === 1) {
        return new Response(null, { status: 401 });
      }

      expect(req.headers.get('Authorization')).toBe('Bearer new-token');
      return new Response(null, { status: 204 });
    });

    const client = new HttpClient({
      baseUrls: { default: 'https://api.example.com' },
      fetch: mockFetch as any,
      auth: new BearerTokenAuth(() => token),
      onUnauthenticated: async () => {
        token = 'new-token';
        return true;
      },
    });

    const { status } = await client.delete('/resource/1');
    expect(status).toBe(HTTPStatusCode.NO_CONTENT);
    expect(callCount).toBe(2);
  });

  it('should not invoke onUnauthenticated for non-401 status codes', async () => {
    let onUnauthenticatedCalled = false;

    const mockFetch = mock(async () => {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const client = new HttpClient({
      baseUrls: { default: 'https://api.example.com' },
      fetch: mockFetch as any,
      auth: new BearerTokenAuth(() => 'token-1'),
      onUnauthenticated: async () => {
        onUnauthenticatedCalled = true;
        return true;
      },
    });

    const { status } = await client.get('/forbidden');
    expect(status).toBe(HTTPStatusCode.FORBIDDEN);
    expect(onUnauthenticatedCalled).toBe(false);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('should work when onUnauthenticated is not provided', async () => {
    const mockFetch = mock(async () => {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const client = new HttpClient({
      baseUrls: { default: 'https://api.example.com' },
      fetch: mockFetch as any,
      auth: new BearerTokenAuth(() => 'token-1'),
      // No onUnauthenticated provided
    });

    const { status, data } = await client.get('/protected');
    expect(status).toBe(HTTPStatusCode.UNAUTHORIZED);
    expect(data).toEqual({ error: 'Unauthorized' });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('should clear timeout before retrying on 401', async () => {
    let token = 'token-1';
    let callCount = 0;

    const mockFetch = mock(async (req: Request) => {
      callCount++;

      if (callCount === 1) {
        // Simulate some delay
        await new Promise((resolve) => setTimeout(resolve, 50));
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const client = new HttpClient({
      baseUrls: { default: 'https://api.example.com' },
      fetch: mockFetch as any,
      auth: new BearerTokenAuth(() => token),
      timeout: {
        requestTimeoutMs: 5000,
      },
      onUnauthenticated: async () => {
        token = 'token-2';
        return true;
      },
    });

    const { status } = await client.get('/protected');
    expect(status).toBe(HTTPStatusCode.OK);
    expect(callCount).toBe(2);
  });

  it('should work with interceptors', async () => {
    let token = 'token-1';
    let callCount = 0;
    const beforeCallbacks: string[] = [];
    const afterCallbacks: string[] = [];

    const mockFetch = mock(async (req: Request) => {
      callCount++;

      if (callCount === 1) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const client = new HttpClient({
      baseUrls: { default: 'https://api.example.com' },
      fetch: mockFetch as any,
      auth: new BearerTokenAuth(() => token),
      interceptors: {
        beforeRequest: [
          async ({ url, init }) => {
            beforeCallbacks.push('before');
          },
        ],
        afterResponse: [
          async ({ request, response, parsed }) => {
            afterCallbacks.push(`after-${response.status}`);
          },
        ],
      },
      onUnauthenticated: async () => {
        token = 'token-2';
        return true;
      },
    });

    const { status } = await client.get('/protected');
    expect(status).toBe(HTTPStatusCode.OK);
    expect(callCount).toBe(2);
    // Before hooks run once per request (not per retry)
    expect(beforeCallbacks).toEqual(['before']);
    // After hooks run once with the final successful response
    expect(afterCallbacks).toEqual(['after-200']);
  });

  it('should handle retry with non-JSON response', async () => {
    let token = 'token-1';
    let callCount = 0;

    const mockFetch = mock(async () => {
      callCount++;

      if (callCount === 1) {
        return new Response('Unauthorized', {
          status: 401,
          headers: { 'Content-Type': 'text/plain' },
        });
      }

      return new Response('Success', { status: 200, headers: { 'Content-Type': 'text/plain' } });
    });

    const client = new HttpClient({
      baseUrls: { default: 'https://api.example.com' },
      fetch: mockFetch as any,
      auth: new BearerTokenAuth(() => token),
      onUnauthenticated: async () => {
        token = 'token-2';
        return true;
      },
    });

    const { status, data } = await client.get('/protected');
    expect(status).toBe(HTTPStatusCode.OK);
    expect(data).toBe('Success');
    expect(callCount).toBe(2);
  });

  it('should only attempt refresh once even with multiple concurrent requests', async () => {
    let token = 'token-1';
    let refreshCount = 0;
    let fetchCallCount = 0;

    const mockFetch = mock(async (req: Request) => {
      fetchCallCount++;
      const authHeader = req.headers.get('Authorization');

      if (authHeader === 'Bearer token-1') {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const client = new HttpClient({
      baseUrls: { default: 'https://api.example.com' },
      fetch: mockFetch as any,
      auth: new BearerTokenAuth(() => token),
      onUnauthenticated: async () => {
        refreshCount++;
        token = 'token-2';
        return true;
      },
    });

    // Make the same request twice - each should only retry once
    const [result1, result2] = await Promise.all([
      client.get('/protected'),
      client.get('/protected'),
    ]);

    expect(result1.status).toBe(HTTPStatusCode.OK);
    expect(result2.status).toBe(HTTPStatusCode.OK);
    // Each request: 1 failed + 1 retry = 2 calls per request
    expect(fetchCallCount).toBe(4);
    // Each request triggers refresh independently
    expect(refreshCount).toBe(2);
  });

  it('should respect skipAuth even when retrying after 401', async () => {
    let authApplyCalled = false;
    let callCount = 0;

    const mockFetch = mock(async (req: Request) => {
      callCount++;
      const authHeader = req.headers.get('Authorization');

      if (callCount === 1) {
        // First call should have no auth header
        expect(authHeader).toBeNull();
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Retry should still have no auth header
      expect(authHeader).toBeNull();
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const client = new HttpClient({
      baseUrls: { default: 'https://api.example.com' },
      fetch: mockFetch as any,
      auth: {
        apply: async () => {
          authApplyCalled = true;
        },
      },
      onUnauthenticated: async () => {
        // Simulate some refresh logic
        return true;
      },
    });

    const { status, data } = await client.get('/public', { skipAuth: true });

    expect(status).toBe(HTTPStatusCode.OK);
    expect(data).toEqual({ success: true });
    expect(callCount).toBe(2);
    // Auth should never be applied when skipAuth is true
    expect(authApplyCalled).toBe(false);
  });
});
