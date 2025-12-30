import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { z } from 'zod';
import { HttpClient } from '../lib/http/http-client';
import { HTTPStatusCode } from '../lib/types';

// Mock fetch globally
const mockFetch = mock((request: Request) => {
    return Promise.resolve(new Response(JSON.stringify({ id: 1, name: 'Test User' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
    }));
});

describe('Zlient', () => {
    let client: HttpClient;

    beforeEach(() => {
        mockFetch.mockClear();
        client = new HttpClient({
            baseUrls: { default: 'https://api.example.com' },
            fetch: mockFetch as any,
        });
    });

    describe('Functional Endpoint API', () => {
        it('should create and call a simple GET endpoint', async () => {
            const UserSchema = z.object({ id: z.number(), name: z.string() });

            const getUser = client.createEndpoint({
                method: 'GET',
                path: '/users/1',
                response: UserSchema,
            });

            const user = await getUser({});

            expect(user).toEqual({ id: 1, name: 'Test User' });
            expect(mockFetch).toHaveBeenCalledTimes(1);
            const req = mockFetch.mock.calls[0][0] as Request;
            expect(req.url).toBe('https://api.example.com/users/1');
        });

        it('should handle path parameters correctly', async () => {
            const UserSchema = z.object({ id: z.number(), name: z.string() });
            const PathSchema = z.object({ id: z.string() });

            const getUser = client.createEndpoint({
                method: 'GET',
                path: (params) => `/users/${params.id}`,
                pathParams: PathSchema,
                response: UserSchema,
            });

            const user = await getUser({
                pathParams: { id: '123' }
            });

            expect(user).toEqual({ id: 1, name: 'Test User' });
            const req = mockFetch.mock.calls[0][0] as Request;
            expect(req.url).toBe('https://api.example.com/users/123');
        });

        it('should validate request body', async () => {
            const RequestSchema = z.object({ name: z.string() });
            const ResponseSchema = z.object({ id: z.number() });

            const createUser = client.createEndpoint({
                method: 'POST',
                path: '/users',
                request: RequestSchema,
                response: ResponseSchema,
            });

            // Valid call
            await createUser({ data: { name: 'New User' } });

            // Invalid call (should throw Zod error)
            // We manually check validation logic
            try {
                await createUser({ data: { name: 123 as any } });
                expect(true).toBe(false); // Should fail if no error thrown
            } catch (e) {
                expect(e).toBeInstanceOf(z.ZodError);
            }
        });

        it('should handle specific status codes', async () => {
            // Mock 201 Created
            mockFetch.mockImplementationOnce(() =>
                Promise.resolve(new Response(JSON.stringify({ id: 123 }), { status: 201, headers: { 'Content-Type': 'application/json' } }))
            );

            const CreatedSchema = z.object({ id: z.number() });
            const ErrorSchema = z.object({ message: z.string() });

            const createItem = client.createEndpoint({
                method: 'POST',
                path: '/items',
                response: {
                    [HTTPStatusCode.CREATED]: CreatedSchema,
                    [HTTPStatusCode.BAD_REQUEST]: ErrorSchema,
                }
            });

            const result = await createItem({});
            expect(result).toEqual({ id: 123 });
        });
    });

    describe('Configuration & Hygiene', () => {
        it('should enforce baseUrls structure', () => {
            expect(() => {
                new HttpClient({ baseUrls: {} as any });
            }).toThrow();
        });
    });

    describe('V2 Audit Fixes', () => {
        it('should handle Headers object in Auth', async () => {
            // Setup client with Bearer Auth
            client.setAuth({
                apply({ init }) {
                    if (init.headers instanceof Headers) {
                        init.headers.set('Authorization', 'Bearer test-token');
                    } else {
                        init.headers = { ...init.headers, Authorization: 'Bearer test-token' };
                    }
                }
            });

            // Call endpoint ensuring we pass a Headers object if possible,
            // but standard fetch init uses plain object by default in our internal implementation.
            // We will mock the internal fetchImpl to check what it receives.

            const UserSchema = z.object({ id: z.number() });
            const getUser = client.createEndpoint({
                method: 'GET',
                path: '/users/1',
                response: UserSchema,
            });

            await getUser({});

            const req = mockFetch.mock.calls[mockFetch.mock.calls.length - 1][0] as Request;
            // The internal implementation converts everything to Request object
            expect(req.headers.get('Authorization')).toBe('Bearer test-token');
        });

        it('should calculate metrics for large datasets without stack overflow', () => {
            const { InMemoryMetricsCollector } = require('../lib/metrics');
            const collector = new InMemoryMetricsCollector(200000);

            // Generate 150,000 metrics
            for (let i = 0; i < 150000; i++) {
                collector.collect({
                    method: 'GET',
                    path: '/test',
                    durationMs: Math.random() * 1000,
                    timestamp: new Date().toISOString(),
                    success: true
                });
            }

            // Should not throw RangeError
            const summary = collector.getSummary();
            expect(summary.total).toBe(150000);
            expect(summary.minDurationMs).toBeGreaterThanOrEqual(0);
        });
    });
});
