import { describe, expect, it } from 'bun:test';
import { ApiKeyAuth, BearerTokenAuth, NoAuth } from '../lib/auth';

describe('Auth Providers', () => {
  describe('NoAuth', () => {
    it('should not modify the request init', async () => {
      const auth = new NoAuth();
      const init: RequestInit = { headers: {} };
      await auth.apply({ url: 'https://example.com', init });
      expect(init).toEqual({ headers: {} });
    });
  });

  describe('ApiKeyAuth', () => {
    it('should add api key to headers', async () => {
      const auth = new ApiKeyAuth({ header: 'X-API-Key', value: 'secret-key' });
      const init: RequestInit = { headers: { 'X-Other': 'value' } };
      await auth.apply({ url: 'https://example.com', init });
      expect(init.headers).toEqual({ 'X-Other': 'value', 'X-API-Key': 'secret-key' });
    });

    it('should add api key to query params', async () => {
      const auth = new ApiKeyAuth({ query: 'apiKey', value: 'secret-key' });
      const ctx = { url: 'https://example.com/path', init: { headers: {} } };
      await auth.apply(ctx);
      expect(ctx.url).toBe('https://example.com/path?apiKey=secret-key');
    });

    it('should throw if both header and query are provided', () => {
      expect(() => new ApiKeyAuth({ header: 'a', query: 'b', value: 'c' })).toThrow();
    });

    it('should throw if neither header nor query is provided', () => {
      expect(() => new ApiKeyAuth({ value: 'c' } as any)).toThrow();
    });
  });

  describe('BearerTokenAuth', () => {
    it('should add bearer token to headers from a string', async () => {
      const auth = new BearerTokenAuth(() => 'my-token');
      const init: RequestInit = { headers: {} };
      await auth.apply({ url: 'https://example.com', init });
      expect(init.headers).toEqual({ Authorization: 'Bearer my-token' });
    });

    it('should add bearer token to headers from a promise', async () => {
      const auth = new BearerTokenAuth(() => Promise.resolve('my-token-promise'));
      const init: RequestInit = { headers: {} };
      await auth.apply({ url: 'https://example.com', init });
      expect(init.headers).toEqual({ Authorization: 'Bearer my-token-promise' });
    });

    it('should throw if getToken returns an empty token', async () => {
      const auth = new BearerTokenAuth(() => '');
      const init: RequestInit = { headers: {} };
      await expect(auth.apply({ url: 'https://example.com', init })).rejects.toThrow(
        'BearerTokenAuth: token is empty or undefined'
      );
    });

    it('should throw if getToken promise rejects', async () => {
      const auth = new BearerTokenAuth(() => Promise.reject(new Error('Failed to get token')));
      const init: RequestInit = { headers: {} };
      await expect(auth.apply({ url: 'https://example.com', init })).rejects.toThrow(
        'Failed to get token'
      );
    });
  });
});
