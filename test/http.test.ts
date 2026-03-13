import { describe, expect, it, mock } from 'bun:test';
import { z } from 'zod';
import { HttpClient } from '../lib/http/http-client';
import { SchemaDefinitionError, toQueryString } from '../lib/types';

describe('HTTP Helpers', () => {
  describe('toQueryString', () => {
    it('should convert an object to a query string', () => {
      const query = { a: 1, b: 'hello', c: true };
      expect(toQueryString(query)).toBe('?a=1&b=hello&c=true');
    });

    it('should filter out undefined values', () => {
      const query = { a: 1, b: undefined, c: 'test' };
      expect(toQueryString(query)).toBe('?a=1&c=test');
    });

    it('should handle URLSearchParams', () => {
      const params = new URLSearchParams();
      params.append('key', 'value');
      expect(toQueryString(params)).toBe('?key=value');
    });

    it('should return empty string for empty object or params', () => {
      expect(toQueryString({})).toBe('');
      expect(toQueryString(new URLSearchParams())).toBe('');
    });
  });

  describe('HttpClient error handling', () => {
    it('should throw SchemaDefinitionError for undefined status code schema', async () => {
      const mockFetch = mock(() =>
        Promise.resolve(new Response(JSON.stringify({}), { status: 202 }))
      );
      const client = new HttpClient({
        baseUrls: { default: 'https://api.example.com' },
        fetch: mockFetch as any,
      });

      const endpoint = client.createEndpoint({
        method: 'GET',
        path: '/test',
        response: {
          200: z.object({}),
          201: z.object({}),
        },
      });

      await expect(endpoint({})).rejects.toThrow(SchemaDefinitionError);
    });

    it('should skip response validation when configured', async () => {
      const mockFetch = mock(() =>
        Promise.resolve(
          new Response(JSON.stringify({ invalid: 'data' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        )
      );
      const client = new HttpClient({
        baseUrls: { default: 'https://api.example.com' },
        fetch: mockFetch as any,
      });

      const endpoint = client.createEndpoint({
        method: 'GET',
        path: '/test',
        response: z.object({ valid: z.string() }),
        advanced: {
          skipResponseValidation: true,
        },
      });

      const result = await endpoint({});
      expect(result as any).toEqual({ invalid: 'data' });
    });

    it('should throw error if required request body is missing', async () => {
      const client = new HttpClient({
        baseUrls: { default: 'https://api.example.com' },
        fetch: mock(async () => new Response()) as any,
      });

      const endpoint = client.createEndpoint({
        method: 'POST',
        path: '/test',
        request: z.object({ name: z.string() }),
        response: z.object({}),
      });

      await expect(endpoint({} as any)).rejects.toThrow('Missing required request body (data)');
    });

    it('should throw error if required path params are missing', async () => {
      const client = new HttpClient({
        baseUrls: { default: 'https://api.example.com' },
        fetch: mock(async () => new Response()) as any,
      });

      const endpoint = client.createEndpoint({
        method: 'GET',
        path: (params) => `/users/${params.id}`,
        pathParams: z.object({ id: z.string() }),
        response: z.object({}),
      });

      await expect(endpoint({} as any)).rejects.toThrow(
        'Missing required path parameters (pathParams)'
      );
    });

    it('should handle binary response (blob)', async () => {
      const mockBlob = new Blob(['binary data'], { type: 'application/octet-stream' });
      const mockFetch = mock(
        async () =>
          new Response(mockBlob, {
            status: 200,
            headers: { 'Content-Type': 'application/octet-stream' },
          })
      );

      const client = new HttpClient({
        baseUrls: { default: 'https://api.example.com' },
        fetch: mockFetch as any,
      });

      const { data } = await client.get('/file');
      expect(data).toBeInstanceOf(Blob);
      const text = await (data as Blob).text();
      expect(text).toBe('binary data');
    });
  });
});
