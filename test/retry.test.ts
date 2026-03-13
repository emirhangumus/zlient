import { describe, expect, it, mock } from 'bun:test';
import { HttpClient } from '../lib/http/http-client';

describe('Retry Logic', () => {
  describe('Configuration Validation', () => {
    it('should throw error if maxAttempts is negative', () => {
      expect(() => {
        new HttpClient({
          baseUrls: { default: 'https://api.example.com' },
          retry: { maxAttempts: -1, baseDelayMs: 1000 },
        });
      }).toThrow('retry.maxAttempts must be a non-negative finite number');
    });

    it('should throw error if maxAttempts is not finite', () => {
      expect(() => {
        new HttpClient({
          baseUrls: { default: 'https://api.example.com' },
          retry: { maxAttempts: Infinity, baseDelayMs: 1000 },
        });
      }).toThrow('retry.maxAttempts must be a non-negative finite number');
    });

    it('should throw error if baseDelayMs is negative', () => {
      expect(() => {
        new HttpClient({
          baseUrls: { default: 'https://api.example.com' },
          retry: { maxAttempts: 3, baseDelayMs: -100 },
        });
      }).toThrow('retry.baseDelayMs must be non-negative');
    });

    it('should allow zero maxAttempts', () => {
      const client = new HttpClient({
        baseUrls: { default: 'https://api.example.com' },
        retry: { maxAttempts: 0, baseDelayMs: 1000 },
      });
      expect(client).toBeDefined();
    });

    it('should allow zero baseDelayMs', () => {
      const client = new HttpClient({
        baseUrls: { default: 'https://api.example.com' },
        retry: { maxAttempts: 3, baseDelayMs: 0 },
      });
      expect(client).toBeDefined();
    });
  });

  describe('Basic Retry Behavior', () => {
    it('should not retry when maxAttempts is 0', async () => {
      let callCount = 0;
      const mockFetch = mock(async () => {
        callCount++;
        return new Response(JSON.stringify({ error: 'Server Error' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      });

      const client = new HttpClient({
        baseUrls: { default: 'https://api.example.com' },
        fetch: mockFetch as any,
        retry: { maxAttempts: 0, baseDelayMs: 1000 },
      });

      const { status } = await client.get('/test');

      expect(status).toBe(500);
      expect(callCount).toBe(1);
    });

    it('should retry on 5xx errors when configured', async () => {
      let callCount = 0;
      const mockFetch = mock(async () => {
        callCount++;
        if (callCount === 1) {
          return new Response(JSON.stringify({ error: 'Server Error' }), {
            status: 500,
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
        retry: {
          maxAttempts: 3,
          baseDelayMs: 10,
          retryStatusCodes: [500, 502, 503],
          retryMethods: ['GET', 'POST', 'PUT'],
        },
      });

      const { status, data } = await client.get('/test');

      expect(status).toBe(200);
      expect(data).toEqual({ success: true });
      expect(callCount).toBe(2);
    });

    it('should not retry when status code is not in retryStatusCodes', async () => {
      let callCount = 0;
      const mockFetch = mock(async () => {
        callCount++;
        return new Response(JSON.stringify({ error: 'Not Found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      });

      const client = new HttpClient({
        baseUrls: { default: 'https://api.example.com' },
        fetch: mockFetch as any,
        retry: {
          maxAttempts: 3,
          baseDelayMs: 10,
          retryStatusCodes: [500, 502, 503],
          retryMethods: ['GET'],
        },
      });

      const { status } = await client.get('/test');

      expect(status).toBe(404);
      expect(callCount).toBe(1);
    });

    it('should not retry when method is not in retryMethods', async () => {
      let callCount = 0;
      const mockFetch = mock(async () => {
        callCount++;
        return new Response(JSON.stringify({ error: 'Server Error' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      });

      const client = new HttpClient({
        baseUrls: { default: 'https://api.example.com' },
        fetch: mockFetch as any,
        retry: {
          maxAttempts: 3,
          baseDelayMs: 10,
          retryStatusCodes: [500],
          retryMethods: ['GET'], // POST not included
        },
      });

      const { status } = await client.post('/test', { data: 'test' });

      expect(status).toBe(500);
      expect(callCount).toBe(1);
    });
  });

  describe('Exponential Backoff', () => {
    it('should apply exponential backoff delay between retries', async () => {
      let callCount = 0;
      const timings: number[] = [];
      const startTime = Date.now();

      const mockFetch = mock(async () => {
        callCount++;
        timings.push(Date.now() - startTime);

        if (callCount <= 2) {
          return new Response(JSON.stringify({ error: 'Server Error' }), {
            status: 503,
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
        retry: {
          maxAttempts: 3,
          baseDelayMs: 50,
          retryStatusCodes: [503],
          retryMethods: ['GET'],
        },
      });

      const { status } = await client.get('/test');

      expect(status).toBe(200);
      expect(callCount).toBe(3);
      expect(timings.length).toBe(3);

      // First call should be immediate
      expect(timings[0]).toBeLessThan(20);

      // Second call should be after baseDelayMs (50ms)
      const firstDelay = timings[1] - timings[0];
      expect(firstDelay).toBeGreaterThanOrEqual(40); // Allow some tolerance

      // Third call should be after baseDelayMs * 2 (100ms)
      const secondDelay = timings[2] - timings[1];
      expect(secondDelay).toBeGreaterThanOrEqual(90); // Allow some tolerance
    });

    it('should respect maxAttempts limit', async () => {
      let callCount = 0;
      const mockFetch = mock(async () => {
        callCount++;
        return new Response(JSON.stringify({ error: 'Server Error' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      });

      const client = new HttpClient({
        baseUrls: { default: 'https://api.example.com' },
        fetch: mockFetch as any,
        retry: {
          maxAttempts: 2,
          baseDelayMs: 10,
          retryStatusCodes: [500],
          retryMethods: ['GET'],
        },
      });

      const { status } = await client.get('/test');

      expect(status).toBe(500);
      expect(callCount).toBe(3); // Initial + 2 retries
    });
  });

  describe('Retry-After Header', () => {
    it('should respect Retry-After header when respectRetryAfter is true', async () => {
      let callCount = 0;
      const timings: number[] = [];
      const startTime = Date.now();

      const mockFetch = mock(async () => {
        callCount++;
        timings.push(Date.now() - startTime);

        if (callCount === 1) {
          return new Response(JSON.stringify({ error: 'Too Many Requests' }), {
            status: 429,
            headers: {
              'Content-Type': 'application/json',
              'Retry-After': '1', // 1 second
            },
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
        retry: {
          maxAttempts: 2,
          baseDelayMs: 100,
          retryStatusCodes: [429],
          retryMethods: ['GET'],
          respectRetryAfter: true,
        },
      });

      const { status } = await client.get('/test');

      expect(status).toBe(200);
      expect(callCount).toBe(2);

      // Delay should be at least 1 second (from Retry-After header)
      const delay = timings[1] - timings[0];
      expect(delay).toBeGreaterThanOrEqual(950);
    });

    it('should use default backoff when Retry-After is not present', async () => {
      let callCount = 0;
      const timings: number[] = [];
      const startTime = Date.now();

      const mockFetch = mock(async () => {
        callCount++;
        timings.push(Date.now() - startTime);

        if (callCount === 1) {
          return new Response(JSON.stringify({ error: 'Server Error' }), {
            status: 500,
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
        retry: {
          maxAttempts: 2,
          baseDelayMs: 50,
          retryStatusCodes: [500],
          retryMethods: ['GET'],
          respectRetryAfter: true,
        },
      });

      const { status } = await client.get('/test');

      expect(status).toBe(200);
      expect(callCount).toBe(2);

      const delay = timings[1] - timings[0];
      expect(delay).toBeGreaterThanOrEqual(40);
    });

    it('should ignore Retry-After header when respectRetryAfter is false', async () => {
      let callCount = 0;
      const timings: number[] = [];
      const startTime = Date.now();

      const mockFetch = mock(async () => {
        callCount++;
        timings.push(Date.now() - startTime);

        if (callCount === 1) {
          return new Response(JSON.stringify({ error: 'Too Many Requests' }), {
            status: 429,
            headers: {
              'Content-Type': 'application/json',
              'Retry-After': '5', // 5 seconds - should be ignored
            },
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
        retry: {
          maxAttempts: 2,
          baseDelayMs: 50,
          retryStatusCodes: [429],
          retryMethods: ['GET'],
          respectRetryAfter: false,
        },
      });

      const { status } = await client.get('/test');

      expect(status).toBe(200);
      expect(callCount).toBe(2);

      const delay = timings[1] - timings[0];
      // Should use default backoff (50ms), not Retry-After (5000ms)
      expect(delay).toBeLessThan(1000);
    });
  });

  describe('skipRetry Option', () => {
    it('should skip retry when skipRetry is true', async () => {
      let callCount = 0;
      const mockFetch = mock(async () => {
        callCount++;
        return new Response(JSON.stringify({ error: 'Server Error' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      });

      const client = new HttpClient({
        baseUrls: { default: 'https://api.example.com' },
        fetch: mockFetch as any,
        retry: {
          maxAttempts: 3,
          baseDelayMs: 10,
          retryStatusCodes: [500],
          retryMethods: ['GET'],
        },
      });

      const { status } = await client.get('/test', { skipRetry: true });

      expect(status).toBe(500);
      expect(callCount).toBe(1); // Should not retry
    });

    it('should skip retry for specific endpoint call', async () => {
      let callCount = 0;
      const mockFetch = mock(async () => {
        callCount++;
        return new Response(JSON.stringify({ error: 'Server Error' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      });

      const client = new HttpClient({
        baseUrls: { default: 'https://api.example.com' },
        fetch: mockFetch as any,
        retry: {
          maxAttempts: 3,
          baseDelayMs: 10,
          retryStatusCodes: [500],
          retryMethods: ['POST'],
        },
      });

      const { z } = require('zod');
      const createItem = client.createEndpoint({
        method: 'POST',
        path: '/items',
        response: z.object({ success: z.boolean() }).optional(),
        advanced: { skipRetry: true, skipResponseValidation: true },
      });

      await createItem({});

      expect(callCount).toBe(1); // Should not retry
    });
  });

  describe('Multiple Failure and Success Scenarios', () => {
    it('should retry multiple times before succeeding', async () => {
      let callCount = 0;
      const mockFetch = mock(async () => {
        callCount++;

        if (callCount < 4) {
          return new Response(JSON.stringify({ error: 'Server Error' }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        return new Response(JSON.stringify({ data: 'success' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      });

      const client = new HttpClient({
        baseUrls: { default: 'https://api.example.com' },
        fetch: mockFetch as any,
        retry: {
          maxAttempts: 4,
          baseDelayMs: 10,
          retryStatusCodes: [503],
          retryMethods: ['GET'],
        },
      });

      const { status, data } = await client.get('/test');

      expect(status).toBe(200);
      expect(data).toEqual({ data: 'success' });
      expect(callCount).toBe(4);
    });

    it('should stop retrying on client error (4xx)', async () => {
      let callCount = 0;
      const mockFetch = mock(async () => {
        callCount++;
        return new Response(JSON.stringify({ error: 'Bad Request' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      });

      const client = new HttpClient({
        baseUrls: { default: 'https://api.example.com' },
        fetch: mockFetch as any,
        retry: {
          maxAttempts: 3,
          baseDelayMs: 10,
          retryStatusCodes: [500], // Don't retry 400 errors
          retryMethods: ['GET'],
        },
      });

      const { status } = await client.get('/test');

      expect(status).toBe(400);
      expect(callCount).toBe(1);
    });

    it('should handle retries with POST requests preserving body', async () => {
      let callCount = 0;
      const bodies: string[] = [];

      const mockFetch = mock(async (req: Request) => {
        callCount++;
        const body = await req.text();
        bodies.push(body);

        if (callCount === 1) {
          return new Response(JSON.stringify({ error: 'Server Error' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        return new Response(JSON.stringify({ created: true }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        });
      });

      const client = new HttpClient({
        baseUrls: { default: 'https://api.example.com' },
        fetch: mockFetch as any,
        retry: {
          maxAttempts: 2,
          baseDelayMs: 10,
          retryStatusCodes: [500],
          retryMethods: ['POST'],
        },
      });

      const requestData = { name: 'Test', value: 42 };
      const { status } = await client.post('/items', requestData);

      expect(status).toBe(201);
      expect(callCount).toBe(2);
      expect(bodies).toHaveLength(2);
      expect(bodies[0]).toBe(JSON.stringify(requestData));
      expect(bodies[1]).toBe(JSON.stringify(requestData));
    });
  });

  describe('Retry with Different HTTP Methods', () => {
    it('should retry GET requests', async () => {
      let callCount = 0;
      const mockFetch = mock(async () => {
        callCount++;
        if (callCount < 2) {
          return new Response(JSON.stringify({ error: 'Error' }), { status: 502 });
        }
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      });

      const client = new HttpClient({
        baseUrls: { default: 'https://api.example.com' },
        fetch: mockFetch as any,
        retry: {
          maxAttempts: 2,
          baseDelayMs: 10,
          retryStatusCodes: [502],
          retryMethods: ['GET'],
        },
      });

      const { status } = await client.get('/data');
      expect(status).toBe(200);
      expect(callCount).toBe(2);
    });

    it('should retry PUT requests', async () => {
      let callCount = 0;
      const mockFetch = mock(async () => {
        callCount++;
        if (callCount < 2) {
          return new Response(JSON.stringify({ error: 'Error' }), { status: 503 });
        }
        return new Response(JSON.stringify({ updated: true }), { status: 200 });
      });

      const client = new HttpClient({
        baseUrls: { default: 'https://api.example.com' },
        fetch: mockFetch as any,
        retry: {
          maxAttempts: 2,
          baseDelayMs: 10,
          retryStatusCodes: [503],
          retryMethods: ['PUT'],
        },
      });

      const { status } = await client.put('/resource/1', { name: 'updated' });
      expect(status).toBe(200);
      expect(callCount).toBe(2);
    });

    it('should retry PATCH requests', async () => {
      let callCount = 0;
      const mockFetch = mock(async () => {
        callCount++;
        if (callCount < 2) {
          return new Response(JSON.stringify({ error: 'Error' }), { status: 500 });
        }
        return new Response(JSON.stringify({ patched: true }), { status: 200 });
      });

      const client = new HttpClient({
        baseUrls: { default: 'https://api.example.com' },
        fetch: mockFetch as any,
        retry: {
          maxAttempts: 2,
          baseDelayMs: 10,
          retryStatusCodes: [500],
          retryMethods: ['PATCH'],
        },
      });

      const { status } = await client.patch('/resource/1', { name: 'patched' });
      expect(status).toBe(200);
      expect(callCount).toBe(2);
    });

    it('should retry HEAD requests', async () => {
      let callCount = 0;
      const mockFetch = mock(async () => {
        callCount++;
        if (callCount < 2) {
          return new Response(null, { status: 503 });
        }
        return new Response(null, { status: 200 });
      });

      const client = new HttpClient({
        baseUrls: { default: 'https://api.example.com' },
        fetch: mockFetch as any,
        retry: {
          maxAttempts: 2,
          baseDelayMs: 10,
          retryStatusCodes: [503],
          retryMethods: ['HEAD'],
        },
      });

      const { status } = await client.request('HEAD', '/check');
      expect(status).toBe(200);
      expect(callCount).toBe(2);
    });
  });

  describe('Retry Status Codes', () => {
    it('should retry on 500 Internal Server Error', async () => {
      let callCount = 0;
      const mockFetch = mock(async () => {
        callCount++;
        if (callCount < 2) {
          return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
            status: 500,
          });
        }
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      });

      const client = new HttpClient({
        baseUrls: { default: 'https://api.example.com' },
        fetch: mockFetch as any,
        retry: {
          maxAttempts: 2,
          baseDelayMs: 10,
          retryStatusCodes: [500],
          retryMethods: ['GET'],
        },
      });

      const { status } = await client.get('/test');
      expect(status).toBe(200);
      expect(callCount).toBe(2);
    });

    it('should retry on 502 Bad Gateway', async () => {
      let callCount = 0;
      const mockFetch = mock(async () => {
        callCount++;
        if (callCount < 2) {
          return new Response(null, { status: 502 });
        }
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      });

      const client = new HttpClient({
        baseUrls: { default: 'https://api.example.com' },
        fetch: mockFetch as any,
        retry: {
          maxAttempts: 2,
          baseDelayMs: 10,
          retryStatusCodes: [502],
          retryMethods: ['GET'],
        },
      });

      const { status } = await client.get('/test');
      expect(status).toBe(200);
      expect(callCount).toBe(2);
    });

    it('should retry on 503 Service Unavailable', async () => {
      let callCount = 0;
      const mockFetch = mock(async () => {
        callCount++;
        if (callCount < 2) {
          return new Response(null, { status: 503 });
        }
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      });

      const client = new HttpClient({
        baseUrls: { default: 'https://api.example.com' },
        fetch: mockFetch as any,
        retry: {
          maxAttempts: 2,
          baseDelayMs: 10,
          retryStatusCodes: [503],
          retryMethods: ['GET'],
        },
      });

      const { status } = await client.get('/test');
      expect(status).toBe(200);
      expect(callCount).toBe(2);
    });

    it('should retry on 504 Gateway Timeout', async () => {
      let callCount = 0;
      const mockFetch = mock(async () => {
        callCount++;
        if (callCount < 2) {
          return new Response(null, { status: 504 });
        }
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      });

      const client = new HttpClient({
        baseUrls: { default: 'https://api.example.com' },
        fetch: mockFetch as any,
        retry: {
          maxAttempts: 2,
          baseDelayMs: 10,
          retryStatusCodes: [504],
          retryMethods: ['GET'],
        },
      });

      const { status } = await client.get('/test');
      expect(status).toBe(200);
      expect(callCount).toBe(2);
    });

    it('should retry on 429 Too Many Requests', async () => {
      let callCount = 0;
      const mockFetch = mock(async () => {
        callCount++;
        if (callCount < 2) {
          return new Response(JSON.stringify({ error: 'Rate limited' }), { status: 429 });
        }
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      });

      const client = new HttpClient({
        baseUrls: { default: 'https://api.example.com' },
        fetch: mockFetch as any,
        retry: {
          maxAttempts: 2,
          baseDelayMs: 10,
          retryStatusCodes: [429],
          retryMethods: ['GET'],
        },
      });

      const { status } = await client.get('/test');
      expect(status).toBe(200);
      expect(callCount).toBe(2);
    });
  });

  describe('Interaction with Other Features', () => {
    it('should retry with timeout configuration', async () => {
      let callCount = 0;
      const mockFetch = mock(async (req: Request) => {
        callCount++;

        if (callCount === 1) {
          return new Response(JSON.stringify({ error: 'Error' }), { status: 503 });
        }

        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      });

      const client = new HttpClient({
        baseUrls: { default: 'https://api.example.com' },
        fetch: mockFetch as any,
        timeout: { requestTimeoutMs: 5000 },
        retry: {
          maxAttempts: 2,
          baseDelayMs: 10,
          retryStatusCodes: [503],
          retryMethods: ['GET'],
        },
      });

      const { status } = await client.get('/test');
      expect(status).toBe(200);
      expect(callCount).toBe(2);
    });

    it('should retry with interceptors', async () => {
      let callCount = 0;
      let beforeCallCount = 0;
      let afterCallCount = 0;

      const mockFetch = mock(async () => {
        callCount++;
        if (callCount < 2) {
          return new Response(JSON.stringify({ error: 'Error' }), { status: 500 });
        }
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      });

      const client = new HttpClient({
        baseUrls: { default: 'https://api.example.com' },
        fetch: mockFetch as any,
        retry: {
          maxAttempts: 2,
          baseDelayMs: 10,
          retryStatusCodes: [500],
          retryMethods: ['GET'],
        },
        interceptors: {
          beforeRequest: [
            async () => {
              beforeCallCount++;
            },
          ],
          afterResponse: [
            async () => {
              afterCallCount++;
            },
          ],
        },
      });

      const { status } = await client.get('/test');
      expect(status).toBe(200);
      expect(callCount).toBe(2);
      // Before hooks run once per request (not per retry)
      // After hooks run only when the final response is returned
      expect(beforeCallCount).toBe(1);
      expect(afterCallCount).toBe(1);
    });

    it('should retry with authentication', async () => {
      let callCount = 0;

      const mockFetch = mock(async (req: Request) => {
        callCount++;

        const auth = req.headers.get('Authorization');
        expect(auth).toBe('Bearer test-token');

        if (callCount < 2) {
          return new Response(JSON.stringify({ error: 'Error' }), { status: 502 });
        }

        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      });

      const client = new HttpClient({
        baseUrls: { default: 'https://api.example.com' },
        fetch: mockFetch as any,
        auth: {
          apply({ init }: any) {
            if (typeof init.headers === 'object' && init.headers !== null) {
              (init.headers as any)['Authorization'] = 'Bearer test-token';
            }
          },
        } as any,
        retry: {
          maxAttempts: 2,
          baseDelayMs: 10,
          retryStatusCodes: [502],
          retryMethods: ['GET'],
        },
      });

      const { status } = await client.get('/test');
      expect(status).toBe(200);
      expect(callCount).toBe(2);
    });
  });

  describe('Should Retry Function', () => {
    it('obey the should retry function', async () => {
      let callCount = 0;
      const mockFetch = mock(async () => {
        callCount++;
        return new Response(JSON.stringify({ error: 'Error' }), { status: 502 });
      });

      const client = new HttpClient({
        baseUrls: { default: 'https://api.example.com' },
        fetch: mockFetch as any,
        retry: {
          maxAttempts: 3,
          baseDelayMs: 10,
          retryStatusCodes: [502],
          retryMethods: ['GET'],
          shouldRetry(ctx) {
            // Custom logic to determine if we should retry
            // For this test, we will never retry
            return false;
          },
        },
      });

      const { status, data } = await client.get('/test');

      expect(callCount).toBe(1); // No retries needed
    });
  });

  describe('Edge Cases', () => {
    it('should handle successful response on first attempt (no retry needed)', async () => {
      let callCount = 0;
      const mockFetch = mock(async () => {
        callCount++;
        return new Response(JSON.stringify({ data: 'success' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      });

      const client = new HttpClient({
        baseUrls: { default: 'https://api.example.com' },
        fetch: mockFetch as any,
        retry: {
          maxAttempts: 3,
          baseDelayMs: 10,
          retryStatusCodes: [500],
          retryMethods: ['GET'],
        },
      });

      const { status, data } = await client.get('/test');

      expect(status).toBe(200);
      expect(data).toEqual({ data: 'success' });
      expect(callCount).toBe(1); // No retries needed
    });

    it('should exhaust all retry attempts', async () => {
      let callCount = 0;
      const mockFetch = mock(async () => {
        callCount++;
        return new Response(JSON.stringify({ error: 'Persistent error' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      });

      const client = new HttpClient({
        baseUrls: { default: 'https://api.example.com' },
        fetch: mockFetch as any,
        retry: {
          maxAttempts: 3,
          baseDelayMs: 10,
          retryStatusCodes: [500],
          retryMethods: ['GET'],
        },
      });

      const { status } = await client.get('/test');

      expect(status).toBe(500);
      expect(callCount).toBe(4); // Initial + 3 retries
    });

    it('should handle mixed status codes with selective retry', async () => {
      let callCount = 0;
      const mockFetch = mock(async () => {
        callCount++;

        if (callCount === 1) {
          return new Response(JSON.stringify({ error: 'Service Unavailable' }), {
            status: 503,
          });
        }
        if (callCount === 2) {
          return new Response(JSON.stringify({ error: 'Bad Request' }), {
            status: 400,
          });
        }

        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      });

      const client = new HttpClient({
        baseUrls: { default: 'https://api.example.com' },
        fetch: mockFetch as any,
        retry: {
          maxAttempts: 3,
          baseDelayMs: 10,
          retryStatusCodes: [503], // Only retry 503, not 400
          retryMethods: ['GET'],
        },
      });

      const { status } = await client.get('/test');

      expect(status).toBe(400); // Should stop at 400 (not in retryStatusCodes)
      expect(callCount).toBe(2);
    });
  });
});
