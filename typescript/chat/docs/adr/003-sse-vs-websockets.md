# ADR 003: SSE vs WebSockets for Real-Time Streaming

**Status**: Accepted

**Date**: 2026-03-08

## Context

We need to stream OpenAI chat completion tokens to the client in real-time as they arrive. Two main approaches:

1. **Server-Sent Events (SSE)**: HTTP-based, one-way (server → client)
2. **WebSockets**: TCP-based, two-way (bidirectional)

## Decision

**We chose SSE for Phase 1**.

## Rationale

### SSE Advantages
1. **Built on HTTP**: Uses standard HTTP, no protocol upgrade needed
2. **No new dependencies**: Express handles SSE natively
3. **Auto-reconnect**: Browser automatically reconnects on disconnect
4. **Stateless backend**: No persistent connection management
5. **Simpler debugging**: Standard curl/curl compatible
6. **Better for this use case**: Chat streaming is mostly one-way

### Comparison
| Feature | SSE | WebSocket |
|---------|-----|-----------|
| Setup Complexity | Very Low | Medium |
| Bidirectional | One-way | Yes |
| Auto-reconnect | Yes | No (manual) |
| Compression | HTTP native | Manual |
| Latency | ~50ms | <10ms |
| Protocol | HTTP | TCP |
| Backend State | Stateless | Stateful |
| Scaling | Horizontal | Requires sticky sessions |

## Implementation

### Server Side (Express)
```typescript
res.setHeader('Content-Type', 'text/event-stream');
res.setHeader('Cache-Control', 'no-cache');
res.setHeader('Connection', 'keep-alive');

// Send data chunks
res.write(`data: ${JSON.stringify({ delta: "Hello" })}\n\n`);

// Signal completion
res.write('event: done\ndata: {}\n\n');
res.end();
```

### Client Side (React)
```typescript
const stream = new EventSource('/api/stream?conversationId=123');
stream.addEventListener('message', (event) => {
  const { delta } = JSON.parse(event.data);
  updateMessage(delta);
});
stream.addEventListener('done', () => {
  stream.close();
});
```

## Streaming Flow

```
User types "Hello"
    ↓
POST /api/stream {conversationId, message}
    ↓
Express opens SSE connection
    ↓
1. Save user message to DB
2. Call OpenAI streaming API
    ↓
OpenAI streams tokens
    ↓
For each token:
  res.write(`data: {delta}\n\n`)
    ↓
Browser receives event,
updates UI in real-time
    ↓
OpenAI finishes
    ↓
res.write('event: done\n...')
res.end()
    ↓
Save full response to DB
Close SSE connection
```

## Event Format

Each message is newline-delimited JSON:
```
data: {"delta": "The"}
data: {"delta": " answer"}
data: {"delta": " is"}
...
event: done
data: {}

```

The browser's EventSource API automatically parses these.

## Error Handling

Errors are sent as data events:
```typescript
try {
  // stream completion
} catch (error) {
  res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
  res.end();
}
```

Client listens for `error` event:
```typescript
stream.addEventListener('error', (error) => {
  console.error('Stream error:', error);
});
```

## Connection Management

SSE automatically handles:
- **Network errors**: Browser retries with exponential backoff
- **Server crashes**: EventSource reconnects
- **Idle timeouts**: Keep-alive heartbeat prevents proxy timeouts

```typescript
// Optional heartbeat to prevent timeout (every 30s)
setInterval(() => {
  res.write(': heartbeat\n\n');
}, 30000);
```

## Limitations & Trade-offs

### SSE Limitations
- **One-way**: Cannot send data from client to server mid-stream
- **No binary**: Must JSON-encode all data
- **Late-binding**: All events must come through same connection

### For Chat Use Case
These aren't problems because:
- Streaming is strictly server → client
- Text tokens are naturally JSON-compatible
- No need to interrupt mid-stream

## Scaling Considerations

### Load Balancing
SSE is stateless, so:
- Different requests can hit different servers
- No sticky session needed
- Redis not required (no shared state)

### Connection Limits
Each open SSE connection uses one file descriptor:
- Node.js default ulimit: ~1000
- Can handle ~500-1000 concurrent streams on one server
- Scale horizontally by adding servers

## Future: WebSocket Upgrade Path

If we need bidirectional communication (e.g., interrupting stream, side-by-side editing):
```typescript
// Would switch to:
io.on('connection', (socket) => {
  socket.on('send-message', (data) => { ... });
  socket.emit('token', { delta: "..." });
});
```

But for now, SSE's simplicity wins.

## Alternatives Considered

1. **Long-polling**: More overhead, worse user experience
2. **HTTP/2 Server Push**: Browser support still limited
3. **gRPC streaming**: Unnecessary complexity for this use case
4. **WebRTC Data Channels**: Overkill for one-way streaming

## Conclusion

SSE is ideal for:
- Streaming model outputs (Claude, GPT, Llama)
- Live notifications
- Real-time dashboards
- Stock tickers

When you need request-response during streaming, migrate to WebSockets.
