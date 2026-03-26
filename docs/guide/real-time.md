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

SSE is a lightweight way to receive push updates from a server over HTTP. Zlient simplifies this with `createSSE`, providing type-safe event listeners and validation.

### Defining an SSE Endpoint

You can define a single schema for the default `message` event, or a map of schemas for different event types.

#### **Single Schema**

If you only need to validate the default `message` event (or use the same schema for all events):

```typescript
const eventStream = client.createSSE({
  method: 'GET',
  path: '/events',
  // Validate incoming message data
  response: z.discriminatedUnion('type', [
    z.object({ type: z.literal('connected') }),
    z.object({ type: z.literal('update'), value: z.number() }),
  ]),
});
```

#### **Multi-Schema (Event-Specific)**

If your server sends different event types with distinct structures, you can map schemas to event names:

```typescript
const eventStream = client.createSSE({
  method: 'GET',
  path: '/events',
  response: {
    // Schema for 'message' event
    message: z.object({ type: z.literal('connected') }),
    // Schema for 'time' event
    time: z.string(),
    // Schema for 'update' event
    update: z.object({ id: z.string(), val: z.number() }),
  },
});
```

### Usage

Zlient provides full type safety based on the schemas defined in the endpoint configuration.

```typescript
const stream = await eventStream();

// Typed as { type: 'connected' }
stream.on('message', (data) => {
  console.log('Successfully connected');
});

// Typed as string
stream.on('time', (data) => {
  console.log('Current server time:', data);
});

// Handlers for 'open' and 'error' are also supported
stream.on('open', (ev) => console.log('SSE Connected'));
stream.on('error', (err) => console.error('SSE Error:', err));

// Clean up
// stream.close();
```

---

### Advanced Configuration

Both `createWebSocket` and `createSSE` support an `advanced` property for fine-grained control:

#### **WebSocket Advanced**

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

#### **SSE Advanced**

Zlient's SSE implementation is uniquely powerful, supporting custom HTTP methods (like `POST`), request bodies, and request validation. This is useful for APIs that require large query parameters or specific method designs.

```typescript
const stream = client.createSSE({
  method: 'POST', // Support GET (default), POST, PUT, etc.
  path: '/events',
  request: z.object({ filter: z.string(), tags: z.array(z.string()) }),
  advanced: {
    headers: { 'X-Service-Name': 'billing' }, // Additional static headers
    withCredentials: true, // Include cookies in cross-origin requests
    skipResponseValidation: false,
  },
});

// Call with additional dynamic headers or request data
const sse = await stream({
  data: { filter: 'active', tags: ['important', 'real-time'] },
  headers: { 'X-Request-ID': 'uuid-123' },
});
```
