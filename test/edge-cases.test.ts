/**
 * Edge Cases and Error Recovery Tests
 *
 * Tests for complex error scenarios, edge cases, and recovery mechanisms:
 * - Network error handling
 * - Timeout edge cases
 * - Large payload handling
 * - Response parsing edge cases
 * - Concurrency scenarios
 * - Type safety and validation
 */

import { type } from 'arktype';
import { describe, expect, it, mock } from 'bun:test';
import * as v from 'valibot';
import { z } from 'zod';
import { BearerTokenAuth, NoAuth } from '../lib/auth';
import { HttpClient } from '../lib/http/http-client';
import { InMemoryMetricsCollector } from '../lib/metrics';
import { ApiError, HTTPStatusCode } from '../lib/types';
import { isStandardSchema } from '../lib/validation';

describe('Edge Cases and Error Recovery', () => {
  describe('Network Error Scenarios', () => {
    it('should handle fetch throwing a network error', async () => {
      const mockFetch = mock(async () => {
        throw new Error('Network connection failed');
      });

      const client = new HttpClient({
        baseUrls: { default: 'https://api.example.com' },
        fetch: mockFetch as any,
      });

      await expect(client.get('/test')).rejects.toThrow('Network connection failed');
    });

    it('should handle DNS resolution failure', async () => {
      const mockFetch = mock(async () => {
        const error = new Error('getaddrinfo ENOTFOUND unreachable.invalid');
        (error as any).code = 'ENOTFOUND';
        throw error;
      });

      const client = new HttpClient({
        baseUrls: { default: 'https://unreachable.invalid' },
        fetch: mockFetch as any,
      });

      await expect(client.get('/test')).rejects.toThrow('ENOTFOUND');
    });
  });

  describe('Response Parsing Edge Cases', () => {
    it('should handle malformed JSON response', async () => {
      const mockFetch = mock(async () =>
        Promise.resolve(
          new Response('{invalid json', {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        )
      );

      const client = new HttpClient({
        baseUrls: { default: 'https://api.example.com' },
        fetch: mockFetch as any,
      });

      await expect(client.get('/test')).rejects.toThrow();
    });

    it('should handle response with no content-type header', async () => {
      const mockFetch = mock(async () =>
        Promise.resolve(new Response(JSON.stringify({ data: 'test' }), { status: 200 }))
      );

      const client = new HttpClient({
        baseUrls: { default: 'https://api.example.com' },
        fetch: mockFetch as any,
      });

      const { data } = await client.get('/test');

      // Should default to text when no content-type
      expect(data).toBe(JSON.stringify({ data: 'test' }));
    });

    it('should handle response with charset in content-type', async () => {
      const mockFetch = mock(async () =>
        Promise.resolve(
          new Response(JSON.stringify({ message: 'hello' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json; charset=utf-8' },
          })
        )
      );

      const client = new HttpClient({
        baseUrls: { default: 'https://api.example.com' },
        fetch: mockFetch as any,
      });

      const { data } = await client.get('/test');

      expect(data).toEqual({ message: 'hello' });
    });

    it('should handle very large JSON response', async () => {
      // Create a large object with 10,000 properties
      const largeObject: Record<string, number> = {};
      for (let i = 0; i < 10000; i++) {
        largeObject[`prop_${i}`] = i;
      }

      const mockFetch = mock(async () =>
        Promise.resolve(
          new Response(JSON.stringify(largeObject), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        )
      );

      const client = new HttpClient({
        baseUrls: { default: 'https://api.example.com' },
        fetch: mockFetch as any,
      });

      const { data } = await client.get('/test');

      expect(Object.keys(data as Record<string, unknown>).length).toBe(10000);
      expect((data as Record<string, unknown>).prop_5000 as unknown).toBe(5000);
    });

    it('should handle null JSON response', async () => {
      const mockFetch = mock(async () =>
        Promise.resolve(
          new Response('null', {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        )
      );

      const client = new HttpClient({
        baseUrls: { default: 'https://api.example.com' },
        fetch: mockFetch as any,
      });

      const { data } = await client.get('/test');

      expect(data).toBeNull();
    });
  });

  describe('Timeout Edge Cases', () => {
    it('should timeout a slow request', async () => {
      const mockFetch = mock(async (req: Request) => {
        return new Promise((_, reject) => {
          const timer = setTimeout(() => {
            reject(new Error('Request took too long'));
          }, 500);

          if (req.signal) {
            req.signal.addEventListener('abort', () => {
              clearTimeout(timer);
              // Handle both Error and reason passed to abort
              if (req.signal.reason instanceof Error) {
                reject(req.signal.reason);
              } else {
                reject(new Error('TimeoutError'));
              }
            });
          }
        });
      });

      const client = new HttpClient({
        baseUrls: { default: 'https://api.example.com' },
        fetch: mockFetch as any,
        timeout: { requestTimeoutMs: 50 },
      });

      await expect(client.get('/slow')).rejects.toThrow();
    });

    it('should not timeout a fast request', async () => {
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
        timeout: { requestTimeoutMs: 5000 },
      });

      const { status } = await client.get('/test');

      expect(status).toBe(200);
    });

    it('should handle zero timeout', async () => {
      const mockFetch = mock(async () =>
        Promise.resolve(
          new Response(JSON.stringify({}), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        )
      );

      const client = new HttpClient({
        baseUrls: { default: 'https://api.example.com' },
        fetch: mockFetch as any,
        timeout: { requestTimeoutMs: 0 },
      });

      const { status } = await client.get('/test');

      expect(status).toBe(200);
    });
  });

  describe('Validation with Multiple Schema Libraries', () => {
    it('should detect Zod schema correctly', () => {
      const schema = z.object({ name: z.string() });
      expect(isStandardSchema(schema)).toBe(true);
    });

    it('should detect Valibot schema correctly', () => {
      const schema = v.object({ name: v.string() });
      expect(isStandardSchema(schema)).toBe(true);
    });

    it('should detect ArkType schema correctly', () => {
      const schema = type({ name: 'string' });
      expect(isStandardSchema(schema)).toBe(true);
    });

    it('should return false for non-standard objects', () => {
      const fakeSchema = {
        '~standard': {
          version: 1,
          validate: () => ({ value: 'test' }),
        },
      };

      // This is missing the required structure
      const result = isStandardSchema({}); // empty object
      expect(result).toBe(false);
    });

    it('should handle schema with custom validate function', async () => {
      const customSchema: any = {
        '~standard': {
          version: 1,
          validate: async (value: any) => {
            if (typeof value === 'string' && value.length > 0) {
              return { value };
            }
            return { issues: [{ message: 'Invalid string' }] };
          },
        },
      };

      expect(isStandardSchema(customSchema)).toBe(true);
    });
  });

  describe('Metrics Collection Edge Cases', () => {
    it('should collect metrics for successful requests', () => {
      const collector = new InMemoryMetricsCollector();

      collector.collect({
        method: 'GET',
        path: '/users',
        status: 200,
        durationMs: 50,
        timestamp: new Date().toISOString(),
        success: true,
      });

      const metrics = collector.getMetrics();
      expect(metrics.length).toBe(1);
      expect(metrics[0].status).toBe(200);
      expect(metrics[0].success).toBe(true);
    });

    it('should collect metrics for failed requests', () => {
      const collector = new InMemoryMetricsCollector();

      collector.collect({
        method: 'POST',
        path: '/invalid',
        status: 400,
        durationMs: 30,
        timestamp: new Date().toISOString(),
        success: false,
        error: 'Bad Request',
      });

      const metrics = collector.getMetrics();
      expect(metrics[0].success).toBe(false);
      expect(metrics[0].error).toBe('Bad Request');
    });

    it('should calculate correct summary statistics', () => {
      const collector = new InMemoryMetricsCollector();

      // Add 10 requests
      for (let i = 0; i < 10; i++) {
        collector.collect({
          method: 'GET',
          path: '/test',
          status: i < 7 ? 200 : 500,
          durationMs: (i + 1) * 10,
          timestamp: new Date().toISOString(),
          success: i < 7,
        });
      }

      const summary = collector.getSummary();
      expect(summary.total).toBe(10);
      expect(summary.successful).toBe(7);
      expect(summary.failed).toBe(3);
      expect(summary.minDurationMs).toBe(10);
      expect(summary.maxDurationMs).toBe(100);
      expect(summary.avgDurationMs).toBe(55); // (10+20+...+100) / 10
    });

    it('should respect maxEntries limit and remove oldest', () => {
      const collector = new InMemoryMetricsCollector(3);

      for (let i = 0; i < 5; i++) {
        collector.collect({
          method: 'GET',
          path: `/request-${i}`,
          durationMs: 100,
          timestamp: new Date().toISOString(),
          success: true,
        });
      }

      const metrics = collector.getMetrics();
      expect(metrics.length).toBe(3);
      expect(metrics[0].path).toBe('/request-2');
      expect(metrics[2].path).toBe('/request-4');
    });
  });

  describe('Auth Provider Edge Cases', () => {
    it('should handle auth provider that modifies URL', async () => {
      const mockFetch = mock(async (req: Request) => {
        expect(req.url).toContain('token=abc123');
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
        auth: {
          apply({ url, init }) {
            if (init.__urlOverride) {
              init.__urlOverride = url + (url.includes('?') ? '&' : '?') + 'token=abc123';
            } else {
              const newUrl = new URL(url);
              newUrl.searchParams.set('token', 'abc123');
              init.__urlOverride = newUrl.toString();
            }
          },
        },
      });

      await client.get('/protected');

      expect(mockFetch).toHaveBeenCalled();
    });

    it('should switch auth provider at runtime', async () => {
      let tokenValue = 'token-1';

      const mockFetch = mock(async (req: Request) => {
        const auth = req.headers.get('Authorization');
        expect(auth).toBe(`Bearer ${tokenValue}`);
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
        auth: new BearerTokenAuth(() => tokenValue),
      });

      // First request
      await client.get('/test');
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Switch auth provider
      const newAuth = new BearerTokenAuth(() => 'different-token');
      client.setAuth(newAuth);

      tokenValue = 'different-token';
      await client.get('/test');

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should handle async auth that throws error', async () => {
      const mockFetch = mock(async () =>
        Promise.resolve(
          new Response(JSON.stringify({}), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        )
      );

      const client = new HttpClient({
        baseUrls: { default: 'https://api.example.com' },
        fetch: mockFetch as any,
        auth: new BearerTokenAuth(async () => {
          throw new Error('Cannot fetch token');
        }),
      });

      await expect(client.get('/protected')).rejects.toThrow('Cannot fetch token');
    });
  });

  describe('Endpoint Status Code Mapping', () => {
    it('should use correct schema for each status code', async () => {
      let responseStatus = 201;

      const mockFetch = mock(async () => {
        const status = responseStatus;
        if (status === 201) {
          return Promise.resolve(
            new Response(JSON.stringify({ id: 123, created: true }), {
              status: 201,
              headers: { 'Content-Type': 'application/json' },
            })
          );
        } else if (status === 202) {
          return Promise.resolve(
            new Response(JSON.stringify({ id: 123, pending: true }), {
              status: 202,
              headers: { 'Content-Type': 'application/json' },
            })
          );
        }
        return Promise.resolve(new Response(JSON.stringify({}), { status }));
      });

      const client = new HttpClient({
        baseUrls: { default: 'https://api.example.com' },
        fetch: mockFetch as any,
      });

      const CreatedSchema = z.object({ id: z.number(), created: z.boolean() });
      const AcceptedSchema = z.object({ id: z.number(), pending: z.boolean() });

      const createItem = client.createEndpoint({
        method: 'POST',
        path: '/items',
        response: {
          [HTTPStatusCode.CREATED]: CreatedSchema,
          [HTTPStatusCode.ACCEPTED]: AcceptedSchema,
        },
      });

      // First call - 201
      const result1 = await createItem({});
      expect(result1).toEqual({ id: 123, created: true });

      // Change mock to return 202
      responseStatus = 202;
      const result2 = await createItem({});
      expect(result2).toEqual({ id: 123, pending: true });
    });
  });

  describe('Concurrent Request Handling', () => {
    it('should handle multiple concurrent requests', async () => {
      let callCount = 0;

      const mockFetch = mock(async (req: Request) => {
        callCount++;
        const id = req.url.split('/').pop();
        return Promise.resolve(
          new Response(JSON.stringify({ id, timestamp: Date.now() }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        );
      });

      const client = new HttpClient({
        baseUrls: { default: 'https://api.example.com' },
        fetch: mockFetch as any,
      });

      const promises = [];
      for (let i = 1; i <= 5; i++) {
        promises.push(client.get(`/user/${i}`));
      }

      const results = await Promise.all(promises);

      expect(results.length).toBe(5);
      expect(callCount).toBe(5);

      // All should have returned successfully
      results.forEach((result) => {
        expect(result.status).toBe(200);
        expect((result.data as any).id).toBeDefined();
      });
    });

    it('should handle mixed success/failure concurrent requests', async () => {
      const mockFetch = mock(async (req: Request) => {
        const id = parseInt(req.url.split('/').pop() || '0');

        if (id % 2 === 0) {
          return Promise.resolve(
            new Response(JSON.stringify({ id, status: 'ok' }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            })
          );
        } else {
          return Promise.resolve(
            new Response(JSON.stringify({ error: 'Not found' }), {
              status: 404,
              headers: { 'Content-Type': 'application/json' },
            })
          );
        }
      });

      const client = new HttpClient({
        baseUrls: { default: 'https://api.example.com' },
        fetch: mockFetch as any,
      });

      const promises = [];
      for (let i = 1; i <= 5; i++) {
        promises.push(client.get(`/item/${i}`));
      }

      const results = await Promise.allSettled(promises);

      expect(results.length).toBe(5);

      // Check even IDs succeeded
      expect((results[1] as PromiseFulfilledResult<any>).value.status).toBe(200);
      expect((results[3] as PromiseFulfilledResult<any>).value.status).toBe(200);

      // Check odd IDs failed
      expect(results[0].status).toBe('rejected');
      expect((results[0] as PromiseRejectedResult).reason).toBeInstanceOf(ApiError);
      expect((results[0] as PromiseRejectedResult).reason.status).toBe(404);
      expect(results[2].status).toBe('rejected');
      expect((results[2] as PromiseRejectedResult).reason.status).toBe(404);
      expect(results[4].status).toBe('rejected');
      expect((results[4] as PromiseRejectedResult).reason.status).toBe(404);
    });
  });

  describe('ArrayBuffer and Binary Data', () => {
    it('should send ArrayBuffer as request body', async () => {
      let receivedBody: any;

      const mockFetch = mock(async (req: Request) => {
        receivedBody = await req.arrayBuffer();
        return Promise.resolve(
          new Response(JSON.stringify({ received: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        );
      });

      const client = new HttpClient({
        baseUrls: { default: 'https://api.example.com' },
        fetch: mockFetch as any,
        headers: { 'Content-Type': 'application/octet-stream' },
      });

      const buffer = new Uint8Array([1, 2, 3, 4, 5]);
      await client.post('/binary', buffer);

      expect(receivedBody).toBeInstanceOf(ArrayBuffer);
    });
  });

  describe('NoAuth and Default Behaviors', () => {
    it('should work with NoAuth provider', async () => {
      const mockFetch = mock(async (req: Request) => {
        const auth = req.headers.get('Authorization');
        expect(auth).toBeNull();
        return Promise.resolve(
          new Response(JSON.stringify({ public: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        );
      });

      const client = new HttpClient({
        baseUrls: { default: 'https://api.example.com' },
        fetch: mockFetch as any,
        auth: new NoAuth(),
      });

      const { data } = await client.get('/public');

      expect((data as any).public).toBe(true);
    });

    it('should use NoAuth by default when auth is not provided', async () => {
      const mockFetch = mock(async (req: Request) => {
        const auth = req.headers.get('Authorization');
        expect(auth).toBeNull();
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
        // No auth provider specified
      });

      await client.get('/test');

      expect(mockFetch).toHaveBeenCalled();
    });
  });

  describe('Deep Nested Validation', () => {
    it('should validate deeply nested Zod schemas', async () => {
      const mockFetch = mock(async () =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              user: {
                profile: {
                  contact: {
                    email: 'test@example.com',
                    phone: '+1234567890',
                  },
                },
              },
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }
          )
        )
      );

      const client = new HttpClient({
        baseUrls: { default: 'https://api.example.com' },
        fetch: mockFetch as any,
      });

      const DeepSchema = z.object({
        user: z.object({
          profile: z.object({
            contact: z.object({
              email: z.string().email(),
              phone: z.string(),
            }),
          }),
        }),
      });

      const getDeep = client.createEndpoint({
        method: 'GET',
        path: '/deep',
        response: DeepSchema,
      });

      const result = await getDeep({});

      expect((result as any).user.profile.contact.email).toBe('test@example.com');
    });
  });
});
