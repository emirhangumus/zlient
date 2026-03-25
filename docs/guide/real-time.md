# Real-Time (WebSockets & SSE)

Zlient provides first-class support for real-time communication through WebSockets and Server-Sent Events (SSE), all while maintaining the same type-safety and Standard Schema validation you expect from its HTTP client.

## WebSockets

WebSocket support in Zlient is built around the `createWebSocket` method. It allows you to define typed schemas for both outgoing (send) and incoming (receive) messages.

### Defining a WebSocket Endpoint

```typescript
import { HttpClient } from 'zlient';
import { z } from 'zod';

const client = new HttpClient({
  baseUrls: { default: 'http://localhost:3000' },
});

const chatWs = client.createWebSocket({
  path: (params) => `/chat/${params.roomId}`,
  pathParams: z.object({ roomId: z.string() }),
  // Validate outgoing messages
  send: z.object({ text: z.string() }),
  // Validate incoming messages
  receive: z.object({ user: z.string(), text: z.string() }),
});
```

### Usage

The `createWebSocket` method returns a function that, when called, returns a `WSConnection` instance.

```typescript
const socket = chatWs({ pathParams: { roomId: 'lobby' } });

// Handle connection events
socket.on('open', () => {
  console.log('Connected to chat!');
  socket.send({ text: 'Hello everyone!' });
});

// Handle incoming typed messages
socket.on('message', (data) => {
  console.log(`${data.user}: ${data.text}`);
});

// Handle errors and closing
socket.on('error', (err) => console.error('WS Error:', err));
socket.on('close', (event) => console.log('WS Closed:', event.code));

// Clean up
// socket.close();
```

---

## Server-Sent Events (SSE)

SSE is a lightweight way to receive push updates from a server over HTTP. Zlient simplifies this with `createSSE`.

### Defining an SSE Endpoint

```typescript
const eventStream = client.createSSE({
  path: '/events',
  // Validate incoming event data
  response: z.discriminatedUnion('type', [
    z.object({ type: z.literal('connected') }),
    z.object({ type: z.literal('update'), value: z.number() }),
  ]),
});
```

### Usage

```typescript
const stream = eventStream();

// Handle incoming typed messages
stream.on('message', (data) => {
  if (data.type === 'update') {
    console.log('New value:', data.value);
  }
});

// Handle custom events
// If your server sends events with custom names: "event: custom_name"
stream.on('custom_name', (data) => {
  console.log('Received custom event:', data);
});

// Handle connection events
stream.on('open', (ev) => console.log('SSE Connected'));
stream.on('error', (err) => console.error('SSE Error:', err));

// Clean up
// stream.close();
```

---

## Advanced Configuration

Both `createWebSocket` and `createSSE` support an `advanced` property for fine-grained control:

```typescript
const ws = client.createWebSocket({
  path: '/chat',
  advanced: {
    baseUrlKey: 'v2', // Use a specific base URL
    skipAuth: true, // Skip global auth providers
    skipRequestValidation: true, // Disable validation for outgoing messages
    skipResponseValidation: true, // Disable validation for incoming messages
  },
});
```
