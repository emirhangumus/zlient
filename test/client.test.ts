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

    describe('Advanced Features', () => {
        it('should use correct base URL when baseUrlKey is provided', async () => {
            client = new HttpClient({
                baseUrls: {
                    default: 'https://api.default.com',
                    other: 'https://api.other.com'
                },
                fetch: mockFetch as any,
            });

            await client.get('/test', { baseUrlKey: 'other' });

            const req = mockFetch.mock.calls[mockFetch.mock.calls.length - 1][0] as Request;
            expect(req.url).toBe('https://api.other.com/test');
        });

        it('should skip authentication when skipAuth is true', async () => {
            let authCalled = false;
            client.setAuth({
                apply() {
                    authCalled = true;
                }
            });

            await client.get('/public', { skipAuth: true });

            expect(authCalled).toBe(false);
        });

        it('should run interceptors', async () => {
            const beforeSpy = mock(async () => { });
            const afterSpy = mock(async () => { });

            client = new HttpClient({
                baseUrls: { default: 'https://api.example.com' },
                fetch: mockFetch as any,
                interceptors: {
                    beforeRequest: [beforeSpy],
                    afterResponse: [afterSpy]
                }
            });

            await client.get('/test');

            expect(beforeSpy).toHaveBeenCalledTimes(1);
            expect(afterSpy).toHaveBeenCalledTimes(1);
        });

        it('should timeout request', async () => {
            // Mock fetch to be slow and respect abort signal
            const slowFetch = mock((req: Request) => {
                return new Promise((resolve, reject) => {
                    const timer = setTimeout(() => resolve(new Response('ok')), 100);
                    if (req.signal) {
                        req.signal.addEventListener('abort', () => {
                            clearTimeout(timer);
                            reject(req.signal.reason);
                        });
                    }
                });
            });

            client = new HttpClient({
                baseUrls: { default: 'https://api.example.com' },
                fetch: slowFetch as any,
                timeout: { requestTimeoutMs: 10 } // Very short timeout
            });

            try {
                await client.get('/test');
                expect(true).toBe(false); // Should have thrown
            } catch (e: any) {
                expect(e.name).toBe('TimeoutError');
            }
        });
    });

    describe('FormData Support', () => {
        it('should send FormData without stringifying', async () => {
            const formDataFetch = mock((req: Request) => {
                return Promise.resolve(new Response(JSON.stringify({ fileId: 'abc123' }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' }
                }));
            });

            client = new HttpClient({
                baseUrls: { default: 'https://api.example.com' },
                fetch: formDataFetch as any,
            });

            const formData = new FormData();
            formData.append('file', new Blob(['test content'], { type: 'text/plain' }), 'test.txt');
            formData.append('description', 'Test file');

            const { data } = await client.post('/upload', formData);

            expect(data).toEqual({ fileId: 'abc123' });
            expect(formDataFetch).toHaveBeenCalledTimes(1);

            const req = formDataFetch.mock.calls[0][0] as Request;
            // Content-Type should be multipart/form-data with boundary (set by runtime)
            const contentType = req.headers.get('Content-Type');
            expect(contentType).toContain('multipart/form-data');
            expect(contentType).toContain('boundary=');
        });

        it('should send FormData through endpoint with skipRequestValidation', async () => {
            const formDataFetch = mock((req: Request) => {
                return Promise.resolve(new Response(JSON.stringify({ fileId: 'xyz789', url: 'https://cdn.example.com/file.pdf' }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' }
                }));
            });

            client = new HttpClient({
                baseUrls: { default: 'https://api.example.com' },
                fetch: formDataFetch as any,
            });

            const uploadFile = client.createEndpoint({
                method: 'POST',
                path: '/upload',
                response: z.object({ fileId: z.string(), url: z.string() }),
                advanced: {
                    skipRequestValidation: true,
                },
            });

            const formData = new FormData();
            formData.append('document', new Blob(['PDF content'], { type: 'application/pdf' }), 'document.pdf');

            const result = await uploadFile({ data: formData as any });

            expect(result).toEqual({ fileId: 'xyz789', url: 'https://cdn.example.com/file.pdf' });
        });

        it('should send Blob directly without stringifying', async () => {
            const blobFetch = mock((req: Request) => {
                return Promise.resolve(new Response(JSON.stringify({ received: true }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' }
                }));
            });

            client = new HttpClient({
                baseUrls: { default: 'https://api.example.com' },
                fetch: blobFetch as any,
                headers: { 'Content-Type': 'application/octet-stream' },
            });

            const blob = new Blob(['binary data'], { type: 'application/octet-stream' });

            const { data } = await client.post('/binary', blob);

            expect(data).toEqual({ received: true });
            expect(blobFetch).toHaveBeenCalledTimes(1);
        });
    });
});
