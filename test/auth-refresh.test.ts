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
                return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
            }

            if (callCount === 2) {
                // Should have the new token
                expect(authHeader).toBe('Bearer token-2');
                return new Response(JSON.stringify({ id: 1, name: 'Success' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
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
            return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
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
            return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
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
});
