import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { z } from 'zod';
import { HttpClient } from '../lib/http/http-client';
import { ApiError } from '../lib/types';

describe('WebSocket Support', () => {
  let server: any;
  let client: HttpClient;
  const PORT = 3001;

  beforeAll(() => {
    server = Bun.serve({
      port: PORT,
      fetch(req, server) {
        if (server.upgrade(req)) return;
        return new Response('Upgrade failed', { status: 500 });
      },
      websocket: {
        message(ws, message) {
          const data = JSON.parse(message as string);
          if (data.type === 'hello') {
            ws.send(JSON.stringify({ type: 'welcome', user: 'bot' }));
          }
        },
      },
    });

    client = new HttpClient({
      baseUrls: { default: `http://localhost:${PORT}` },
    });
  });

  afterAll(() => {
    server.stop();
  });

  it('should connect and exchange typed messages', (done) => {
    const chatWs = client.createWebSocket({
      path: '/chat',
      send: z.object({ type: z.string() }),
      receive: z.object({ type: z.string(), user: z.string() }),
    });

    const socket = chatWs();

    socket.on('open', () => {
      socket.send({ type: 'hello' });
    });

    socket.on('message', (data) => {
      try {
        expect(data.type).toBe('welcome');
        expect(data.user).toBe('bot');
        socket.close();
        done();
      } catch (e) {
        done(e);
      }
    });

    socket.on('error', (err) => {
      done(err);
    });
  });

  it('should handle path parameters', (done) => {
    const roomWs = client.createWebSocket({
      path: (params) => `/rooms/${params.id}`,
      pathParams: z.object({ id: z.string() }),
      receive: z.any(),
    });

    const socket = roomWs({ pathParams: { id: '123' } });

    socket.on('open', () => {
      socket.close();
      done();
    });
    socket.on('error', (err) => done(err));
  });

  it('should throw validation error on invalid send', async () => {
    const validatedWs = client.createWebSocket({
      path: '/chat',
      send: z.object({ text: z.string() }),
    });

    const socket = validatedWs();
    try {
      await socket.send({ text: 123 as any });
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e).toBeInstanceOf(ApiError);
      expect(e.message).toContain('Validation failed');
    } finally {
      socket.close();
    }
  });
});
