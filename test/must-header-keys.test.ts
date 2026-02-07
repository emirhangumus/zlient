import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { z } from 'zod';
import { HttpClient } from '../lib/http/http-client';

// Mock fetch globally
const mockFetch = mock((request: Request) => {
    return Promise.resolve(new Response(JSON.stringify({ id: '1', name: 'Test Menu' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
    }));
});

describe('mustHeaderKeys', () => {
    let client: HttpClient;

    beforeEach(() => {
        mockFetch.mockClear();
        client = new HttpClient({
            baseUrls: { default: 'https://api.example.com' },
            fetch: mockFetch as any,
        });
    });

    it('should pass headers to request when mustHeaderKeys are provided', async () => {
        const MenuSchema = z.object({ id: z.string(), name: z.string() });

        const listMenus = client.createEndpoint({
            method: 'GET',
            path: '/menus',
            response: MenuSchema,
            mustHeaderKeys: ['X-Site-Code'] as const,
        });

        const result = await listMenus({
            headers: { 'X-Site-Code': 'site-123' }
        });

        expect(result).toEqual({ id: '1', name: 'Test Menu' });
        expect(mockFetch).toHaveBeenCalledTimes(1);
        const req = mockFetch.mock.calls[0][0] as Request;
        expect(req.headers.get('X-Site-Code')).toBe('site-123');
    });

    it('should throw runtime error when required header is missing', async () => {
        const MenuSchema = z.object({ id: z.string(), name: z.string() });

        const listMenus = client.createEndpoint({
            method: 'GET',
            path: '/menus',
            response: MenuSchema,
            mustHeaderKeys: ['X-Site-Code'] as const,
        });

        try {
            // @ts-expect-error - intentionally passing empty headers to test runtime validation
            await listMenus({ headers: {} });
            expect(true).toBe(false); // Should not reach here
        } catch (e) {
            expect(e).toBeInstanceOf(Error);
            expect((e as Error).message).toBe('Missing required header(s): X-Site-Code');
        }
    });

    it('should throw runtime error when headers object is missing', async () => {
        const MenuSchema = z.object({ id: z.string(), name: z.string() });

        const listMenus = client.createEndpoint({
            method: 'GET',
            path: '/menus',
            response: MenuSchema,
            mustHeaderKeys: ['X-Site-Code'] as const,
        });

        try {
            // @ts-expect-error - intentionally omitting headers to test runtime validation
            await listMenus({});
            expect(true).toBe(false); // Should not reach here
        } catch (e) {
            expect(e).toBeInstanceOf(Error);
            expect((e as Error).message).toBe('Missing required header(s): X-Site-Code');
        }
    });

    it('should throw error listing all missing headers', async () => {
        const MenuSchema = z.object({ id: z.string(), name: z.string() });

        const listMenus = client.createEndpoint({
            method: 'GET',
            path: '/menus',
            response: MenuSchema,
            mustHeaderKeys: ['X-Site-Code', 'X-Tenant-Id', 'X-Api-Version'] as const,
        });

        try {
            // @ts-expect-error - intentionally passing partial headers
            await listMenus({ headers: { 'X-Site-Code': 'site-123' } });
            expect(true).toBe(false); // Should not reach here
        } catch (e) {
            expect(e).toBeInstanceOf(Error);
            expect((e as Error).message).toBe('Missing required header(s): X-Tenant-Id, X-Api-Version');
        }
    });

    it('should work with multiple required headers', async () => {
        const MenuSchema = z.object({ id: z.string(), name: z.string() });

        const listMenus = client.createEndpoint({
            method: 'GET',
            path: '/menus',
            response: MenuSchema,
            mustHeaderKeys: ['X-Site-Code', 'X-Tenant-Id'] as const,
        });

        const result = await listMenus({
            headers: {
                'X-Site-Code': 'site-123',
                'X-Tenant-Id': 'tenant-456'
            }
        });

        expect(result).toEqual({ id: '1', name: 'Test Menu' });
        const req = mockFetch.mock.calls[0][0] as Request;
        expect(req.headers.get('X-Site-Code')).toBe('site-123');
        expect(req.headers.get('X-Tenant-Id')).toBe('tenant-456');
    });

    it('should allow additional headers beyond required ones', async () => {
        const MenuSchema = z.object({ id: z.string(), name: z.string() });

        const listMenus = client.createEndpoint({
            method: 'GET',
            path: '/menus',
            response: MenuSchema,
            mustHeaderKeys: ['X-Site-Code'] as const,
        });

        const result = await listMenus({
            headers: {
                'X-Site-Code': 'site-123',
                'X-Custom-Header': 'custom-value'
            }
        });

        expect(result).toEqual({ id: '1', name: 'Test Menu' });
        const req = mockFetch.mock.calls[0][0] as Request;
        expect(req.headers.get('X-Site-Code')).toBe('site-123');
        expect(req.headers.get('X-Custom-Header')).toBe('custom-value');
    });

    it('should allow optional headers when no mustHeaderKeys defined', async () => {
        const MenuSchema = z.object({ id: z.string(), name: z.string() });

        const listMenus = client.createEndpoint({
            method: 'GET',
            path: '/menus',
            response: MenuSchema,
        });

        // Should work without headers
        const result1 = await listMenus({});
        expect(result1).toEqual({ id: '1', name: 'Test Menu' });

        // Should also work with headers
        const result2 = await listMenus({ headers: { 'X-Optional': 'value' } });
        expect(result2).toEqual({ id: '1', name: 'Test Menu' });
    });

    it('should work with empty mustHeaderKeys array', async () => {
        const MenuSchema = z.object({ id: z.string(), name: z.string() });

        const listMenus = client.createEndpoint({
            method: 'GET',
            path: '/menus',
            response: MenuSchema,
            mustHeaderKeys: [] as const,
        });

        // Should work without headers when mustHeaderKeys is empty
        const result = await listMenus({});
        expect(result).toEqual({ id: '1', name: 'Test Menu' });
    });

    it('should work alongside other endpoint features', async () => {
        const MenuSchema = z.object({ id: z.string(), name: z.string() });
        const QuerySchema = z.object({ limit: z.number().optional() });
        const PathSchema = z.object({ orgId: z.string() });

        const listMenus = client.createEndpoint({
            method: 'GET',
            path: (params) => `/orgs/${params.orgId}/menus`,
            pathParams: PathSchema,
            query: QuerySchema,
            response: MenuSchema,
            mustHeaderKeys: ['X-Site-Code'] as const,
        });

        const result = await listMenus({
            pathParams: { orgId: 'org-123' },
            query: { limit: 10 },
            headers: { 'X-Site-Code': 'site-123' }
        });

        expect(result).toEqual({ id: '1', name: 'Test Menu' });
        const req = mockFetch.mock.calls[0][0] as Request;
        expect(req.url).toContain('/orgs/org-123/menus');
        expect(req.url).toContain('limit=10');
        expect(req.headers.get('X-Site-Code')).toBe('site-123');
    });
});
