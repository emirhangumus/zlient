import { describe, expect, it } from 'bun:test';
import { z } from 'zod';
import { HttpClient } from '../lib';

function assertType<T>(_value: T): void {
  // Compile-time only.
}

function createTypeTestClient() {
  return new HttpClient({
    baseUrls: { default: 'https://api.example.com' },
    fetch: async () =>
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
  });
}

function characterizeEndpointInference() {
  const client = createTypeTestClient();

  const getUser = client.createEndpoint({
    method: 'GET',
    path: (params) => `/users/${params.id}`,
    pathParams: z.object({ id: z.string() }),
    query: z.object({ includePosts: z.boolean().optional() }),
    response: z.object({
      id: z.string(),
      name: z.string(),
    }),
  });

  assertType<Promise<{ id: string; name: string }>>(
    getUser({
      pathParams: { id: 'user-1' },
      query: { includePosts: true },
    })
  );

  // @ts-expect-error - path params are inferred from the pathParams schema input.
  getUser({ pathParams: { id: 123 } });

  // @ts-expect-error - query params are inferred from the query schema input.
  getUser({ pathParams: { id: 'user-1' }, query: { includePosts: 'yes' } });

  const createPost = client.createEndpoint({
    method: 'POST',
    path: '/posts',
    request: z.object({ title: z.string() }),
    response: {
      201: z.object({ id: z.string(), status: z.literal('created') }),
      400: z.object({ error: z.string(), code: z.literal('validation_error') }),
    },
  });

  assertType<
    Promise<{ id: string; status: 'created' } | { error: string; code: 'validation_error' }>
  >(createPost({ data: { title: 'Hello' } }));

  // @ts-expect-error - request data is inferred from the request schema input.
  createPost({ data: { title: 123 } });
}

function characterizeRequiredHeaderInference() {
  const client = createTypeTestClient();

  const listMenus = client.createEndpoint({
    method: 'GET',
    path: '/menus',
    response: z.object({ id: z.string() }),
    mustHeaderKeys: ['X-Site-Code', 'X-Tenant-Id'] as const,
  });

  assertType<Promise<{ id: string }>>(
    listMenus({
      headers: {
        'X-Site-Code': 'site-123',
        'X-Tenant-Id': 'tenant-456',
      },
    })
  );

  // @ts-expect-error - all mustHeaderKeys are required at compile time.
  listMenus({ headers: { 'X-Site-Code': 'site-123' } });

  // @ts-expect-error - headers are required when mustHeaderKeys is non-empty.
  listMenus({});
}

async function characterizeSSEInference() {
  const client = createTypeTestClient();

  const streamEvents = client.createSSE({
    method: 'POST',
    path: (params) => `/events/${params.topic}`,
    pathParams: z.object({ topic: z.string() }),
    request: z.object({ filter: z.string() }),
    response: {
      message: z.object({ type: z.literal('connected') }),
      time: z.string(),
    },
  });

  const connection = await streamEvents({
    pathParams: { topic: 'deployments' },
    data: { filter: 'active' },
  });

  connection.on('message', (data) => {
    assertType<{ type: 'connected' }>(data);
  });

  connection.on('time', (data) => {
    assertType<string>(data);
  });

  // @ts-expect-error - SSE request data is inferred from the request schema input.
  streamEvents({ pathParams: { topic: 'deployments' }, data: { filter: 123 } });

  // @ts-expect-error - SSE path params are inferred from the pathParams schema input.
  streamEvents({ pathParams: { topic: 123 }, data: { filter: 'active' } });
}

async function characterizeWebSocketInference() {
  const client = createTypeTestClient();

  const chat = client.createWebSocket({
    path: (params) => `/rooms/${params.roomId}`,
    pathParams: z.object({ roomId: z.string() }),
    send: z.object({ text: z.string() }),
    receive: z.object({ user: z.string(), text: z.string() }),
  });

  const socket = await chat({ pathParams: { roomId: 'lobby' } });

  void socket.send({ text: 'hello' });

  socket.on('message', (data) => {
    assertType<{ user: string; text: string }>(data);
  });

  // @ts-expect-error - WebSocket send data is inferred from the send schema input.
  void socket.send({ text: 123 });

  // @ts-expect-error - WebSocket path params are inferred from the pathParams schema input.
  chat({ pathParams: { roomId: 123 } });
}

describe('type inference characterization', () => {
  it('is checked by TypeScript', () => {
    expect(true).toBe(true);
  });
});
