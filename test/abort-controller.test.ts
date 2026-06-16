import { describe, expect, it, mock } from 'bun:test';
import { z } from 'zod';
import { HttpClient } from '../lib/http/http-client';

describe('Abort Controller', () => {
  it('should pass the request signal to fetch', async () => {
    const controller = new AbortController();
    let capturedSignal: AbortSignal | undefined;

    const mockFetch = mock(async (req: Request) => {
      capturedSignal = req.signal;
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const client = new HttpClient({
      baseUrls: { default: 'https://api.example.com' },
      fetch: mockFetch as any,
    });

    const { data, status } = await client.get('/test', { signal: controller.signal });

    expect(status).toBe(200);
    expect(data).toEqual({ ok: true });
    expect(capturedSignal).toBeDefined();
    expect(capturedSignal?.aborted).toBe(false);

    controller.abort();
    expect(capturedSignal?.aborted).toBe(true);
  });

  it('should reject an in-flight request when the signal is aborted', async () => {
    const abortReason = new Error('User cancelled request');
    let requestStarted: (() => void) | undefined;

    const mockFetch = mock((req: Request) => {
      return new Promise((resolve, reject) => {
        requestStarted?.();

        const timer = setTimeout(() => {
          resolve(
            new Response(JSON.stringify({ ok: true }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            })
          );
        }, 100);

        req.signal.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(req.signal.reason);
        });
      });
    });

    const client = new HttpClient({
      baseUrls: { default: 'https://api.example.com' },
      fetch: mockFetch as any,
    });
    const controller = new AbortController();

    const started = new Promise<void>((resolve) => {
      requestStarted = resolve;
    });
    const request = client.get('/slow', { signal: controller.signal });

    await started;
    controller.abort(abortReason);

    await expect(request).rejects.toThrow('User cancelled request');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('should reject immediately when called with an already aborted signal', async () => {
    const controller = new AbortController();
    controller.abort(new Error('Already cancelled'));

    const mockFetch = mock(async (req: Request) => {
      if (req.signal.aborted) {
        throw req.signal.reason;
      }

      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const client = new HttpClient({
      baseUrls: { default: 'https://api.example.com' },
      fetch: mockFetch as any,
    });

    await expect(client.get('/test', { signal: controller.signal })).rejects.toThrow(
      'Already cancelled'
    );
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('should forward endpoint signals to the underlying request', async () => {
    const controller = new AbortController();
    let capturedSignal: AbortSignal | undefined;

    const mockFetch = mock(async (req: Request) => {
      capturedSignal = req.signal;
      return new Response(JSON.stringify({ id: 123, name: 'Ada' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const client = new HttpClient({
      baseUrls: { default: 'https://api.example.com' },
      fetch: mockFetch as any,
    });

    const getUser = client.createEndpoint({
      method: 'GET',
      path: '/users/123',
      response: z.object({ id: z.number(), name: z.string() }),
    });

    const user = await getUser({ signal: controller.signal });

    expect(user).toEqual({ id: 123, name: 'Ada' });
    expect(capturedSignal).toBeDefined();

    controller.abort();
    expect(capturedSignal?.aborted).toBe(true);
  });
});
