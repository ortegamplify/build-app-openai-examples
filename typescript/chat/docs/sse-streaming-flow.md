# SSE Streaming Flow - Real-Time Token Delivery

## Overview

This document explains how Server-Sent Events (SSE) is used to stream OpenAI completions token-by-token to the client.

## Architecture Diagram

```
Browser/Client
    │
    │ 1. User clicks send
    │
    ├─────POST /api/stream────→
    │  {conversationId, message}
    │
    │                          Express Server
    │                          │
    │                          ├─ LoadConversation
    │                          │
    │                          ├─ SaveUserMessage
    │                          │
    │                          ├─ CallOpenAI (streaming)
    │                          │
    ├─────← data: {delta}──────┤
    ├─────← data: {delta}──────┤  For each token:
    │ (updates UI in real-time) │  res.write(SSE format)
    ├─────← data: {delta}──────┤
    │                          │
    │                          ├─ SaveAssistantMessage
    │                          │
    │                          ├─ SaveEvents
    │                          │
    ├─────← event: done────────┤
    │                          │
    └────── Connection closed  │
```

## Step-by-Step Flow

### 1. Client Initiates Stream

```typescript
// Frontend: useChat.ts
const response = await fetch('/api/stream', {
  method: 'POST',
  body: JSON.stringify({
    conversationId: currentConversation.id,
    message: userInput,
  }),
});

const reader = response.body?.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  const chunk = decoder.decode(value);
  // Process SSE formatted data
  parseSSEEvents(chunk);
}
```

### 2. Server Receives Request

```typescript
// Backend: StreamController
async stream(req: Request, res: Response): Promise<void> {
  const { conversationId, message } = req.body;

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const command = new SendMessageCommand(conversationId, message);
  const generator = await this.commandBus.dispatch(command);

  // Process generator stream
}
```

### 3. Handler Prepares Aggregate

```typescript
// Backend: SendMessageHandler
async execute(command: SendMessageCommand): {
  const conversation = await this.conversationRepository.findById(
    new ConversationId(command.conversationId)
  );

  // User message saved immediately
  conversation.addUserMessage(command.message);
  let events = conversation.pullDomainEvents();
  await this.eventStore.saveEvents(conversationId.getValue(), events);
}
```

### 4. OpenAI Streaming

```typescript
// Backend: OpenAIAdapter
async streamCompletion(
  messages: Message[],
  onChunk: (chunk: string) => Promise<void>
): Promise<string> {
  let fullResponse = '';

  const stream = await this.client.chat.completions.create({
    model: 'gpt-4',
    messages: messages,
    stream: true,  // ← Enable streaming
  });

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content || '';
    if (delta) {
      fullResponse += delta;
      await onChunk(delta);  // ← Called for each token
    }
  }

  return fullResponse;
}
```

### 5. Token Written to Response

```typescript
// Backend: SendMessageHandler (generator function)
async *execute(command: SendMessageCommand) {
  // ... prepare messages ...

  const assistantResponse = await this.openaiPort.streamCompletion(
    messages,
    async (chunk: string) => {
      // For each OpenAI token:
      yield chunk;  // ← Sent to client
    }
  );

  // After completion:
  conversation.addAssistantMessage(assistantResponse);
  events = conversation.pullDomainEvents();
  await this.eventStore.saveEvents(conversationId.getValue(), events);
  await this.conversationRepository.save(conversation);
}
```

### 6. SSE Response Handling

In StreamController, the generator yields are written as SSE:

```typescript
for await (const chunk of generator) {
  // Write as SSE data event
  res.write(`data: ${JSON.stringify({ delta: chunk })}\n\n`);
}

// Signal completion
res.write('event: done\ndata: {}\n\n');
res.end();
```

### 7. Client Processes Events

```typescript
// Frontend: SSE handler
const eventSource = new EventSource(
  `/api/stream?conversationId=${id}&message=${msg}`
);

eventSource.addEventListener('message', (event) => {
  const { delta } = JSON.parse(event.data);

  // Update UI with delta
  setCurrentMessage((prev) => prev + delta);

  // Optional: Scroll to bottom, show typing indicator
});

eventSource.addEventListener('done', () => {
  eventSource.close();
  setLoading(false);
  setSavedMessage(true);
});

eventSource.addEventListener('error', (error) => {
  console.error('Stream error:', error);
  eventSource.close();
});
```

## SSE Event Format

### Token Data Event
```
data: {"delta":"The"}
data: {"delta":" quick"}
data: {"delta":" brown"}
data: {"delta":" fox"}
```

Note: Each line ends with `\n`, empty line `\n\n` separates events.

### Completion Event
```
event: done
data: {}
```

The `event:` field allows the client to handle different event types.

### Error Event
```
data: {"error":"OpenAI API error"}
```

## Timing Diagram

```
Time →

Browser                          Server                           OpenAI
│                               │                                 │
├──────POST /api/stream────────→                                 │
│                               │                                 │
│                               ├─ Load conversation             │
│                               │                                 │
│                               ├─ Validate message              │
│                               │                                 │
│                               ├─ Save user message to DB        │
│                               │                                 │
│                               ├─ Call streaming API────────────→
│                               │                                 │
│                               │←────── token "The" ────────────┤
│←──── data: {delta: "The"} ────│                                │
│                               │←────── token " quick" ────────→
│←─ data: {delta: " quick"} ────│                                │
│                               │                                │
│                    [stream continues until completion]         │
│                               │                                │
│                               │←─ [DONE] ──────────────────────┤
│                               │                                │
│                               ├─ Save assistant message        │
│                               │                                │
│                               ├─ Save events                   │
│                               │                                │
│←────── event: done ───────────│                                │
│                               │                                │
│ [connection closes]           │                                │
```

## Performance Considerations

### Latency
- **Network**: ~50-200ms (HTTP round trip)
- **OpenAI API**: ~20-100ms per token (varies by model)
- **Total**: ~100-300ms time-to-first-token

### Throughput
- **Tokens per second**: 2-5 tokens/sec (typical for gpt-4)
- **Message size**: 50-200 tokens average
- **Duration**: 10-100 seconds per response

### Resource Usage
- **Memory**: ~1-2MB per active stream
- **CPU**: Minimal (mostly I/O bound)
- **Connections**: One per active user

## Scalability

### Vertical
Single Node.js process can handle:
- ~500-1000 concurrent streams
- Limited by file descriptors (ulimit -n)
- Limited by memory (~1-2MB per stream)

### Horizontal
To scale beyond single server:

```
                    Load Balancer
                         │
        ┌────────────────┼────────────────┐
        │                │                │
    Server 1         Server 2         Server 3
    (stream)         (stream)         (stream)
     │ Conv1           │ Conv2          │ Conv3
```

Benefits:
- Stateless: No sticky sessions needed
- No shared state: Each server independent
- Scale out: Add more servers as needed

Challenges:
- Chat history must be in shared DB
- Event store must be centralized
- Real-time sync not needed (eventual consistency OK)

## Error Handling

### Network Error (Client Disconnects)

```typescript
// Server stops writing when socket closes
res.on('close', () => {
  // Clean up resources
  stream.destroy();
});
```

### OpenAI Error (API Fails)

```typescript
try {
  const generator = await openai.streamCompletion(...);
} catch (error) {
  res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
  res.end();
}
```

### Timeout

```typescript
// Set a timeout for streaming
const timeout = setTimeout(() => {
  res.write(`data: ${JSON.stringify({ error: 'Stream timeout' })}\n\n`);
  res.end();
}, 60000);

// Clear on completion
eventSource.addEventListener('done', () => clearTimeout(timeout));
```

## Browser Support

SSE is supported in all modern browsers:
- Chrome 6+
- Firefox 6+
- Safari 5+
- Edge 79+
- IE: Not supported (use polyfill)

```typescript
// Check support
if (!window.EventSource) {
  console.error('SSE not supported');
  // Fallback to polling or WebSocket
}
```

## Debugging

### Monitor Stream in Browser DevTools

```
Network tab → XHR/Fetch → /api/stream
  Headers:
    Response Headers:
      Content-Type: text/event-stream
      Cache-Control: no-cache
      Connection: keep-alive
  Response:
    data: {"delta":"The"}
    data: {"delta":" answer"}
    ...
```

### Log Server-Side

```typescript
for await (const chunk of generator) {
  console.log(`[SSE] Token: "${chunk}"`);
  res.write(`data: ${JSON.stringify({ delta: chunk })}\n\n`);
}
```

### Test with curl

```bash
curl -X POST http://localhost:3001/api/stream \
  -H "Content-Type: application/json" \
  -d '{
    "conversationId": "conv-123",
    "message": "Hello!"
  }'

# Output:
# data: {"delta":"The"}
# data: {"delta":" answer"}
# ...
# event: done
# data: {}
```

## Comparison with Alternatives

| Method | Latency | Bandwidth | Scalability | Complexity |
|--------|---------|-----------|-------------|-----------|
| **SSE** | Medium | Low | Good | Low |
| WebSocket | Low | Low | Fair | Medium |
| Polling | High | High | Poor | Low |
| Long-polling | Medium | Medium | Fair | Medium |

For streaming LLM tokens → **SSE is optimal**.

## Future Enhancements

1. **Retry Logic**: Auto-reconnect with exponential backoff
2. **Batching**: Send multiple tokens per event
3. **Compression**: gzip compress SSE stream
4. **Prioritization**: High-priority tokens sent first
5. **Interruption**: Allow client to cancel mid-stream
