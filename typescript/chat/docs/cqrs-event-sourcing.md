# CQRS & Event Sourcing in Detail

## Overview

This document explains how CQRS (Command Query Responsibility Segregation) and Event Sourcing work together in our ChatGPT clone.

## CQRS Principles

**CQRS separates** read and write operations:

```
Write Path (Commands)          Read Path (Queries)
    ↓                              ↓
User Action                   User Requests Data
    ↓                              ↓
CommandBus                    QueryBus
    ↓                              ↓
Command Handler               Query Handler
    ↓                              ↓
Modify aggregate              Read snapshot/cache
Emit events                   Return DTO
    ↓                              ↓
Persist state                 Fast, optimized reads
```

### Benefits of CQRS

1. **Optimization**: Read and write models can be optimized independently
2. **Scalability**: Queries can be cached separately from writes
3. **Testing**: Command handlers and query handlers are isolated
4. **Evolution**: Can add new views/queries without modifying writes
5. **Audit**: All state changes go through commands with event trail

## Command Flow Example

### "Send Message" Command

```typescript
// 1. User submits form
const command = new SendMessageCommand(conversationId, message);

// 2. Express controller dispatches
const generator = await commandBus.dispatch(command);

// 3. CommandBus finds handler
const handler = handlers.get('SendMessageCommand');

// 4. Handler executes
async execute(command: SendMessageCommand) {
  // Load aggregate
  const conversation = await repo.findById(command.conversationId);

  // Modify aggregate (pure domain logic)
  conversation.addUserMessage(command.message);

  // Aggregate raises event (not persisted yet)
  const events = conversation.pullDomainEvents();
  // [MessageAdded { conversationId, messageId, role: "user", content: "..." }]

  // Persist events to append-only log
  await eventStore.saveEvents(conversationId, events);

  // Update snapshot for fast reads
  await conversationRepository.save(conversation);

  // Return stream for SSE
  return streamOpenAIResponse(conversation);
}
```

## Event Sourcing Pattern

### What is Event Sourcing?

Instead of storing current state, store a sequence of events that represent all changes:

```
Without Event Sourcing:
┌─────────────────────────────┐
│ Current State Snapshot      │
│ Conversation                │
│ - title: "My Chat"          │
│ - messages: [               │
│     {id, role, content},    │
│     {id, role, content},    │
│   ]                         │
└─────────────────────────────┘
     ↑
   Only one version, history lost
```

```
With Event Sourcing:
┌──────────────────────────────────────────────────┐
│ Immutable Event Log (append-only)                │
├──────────────────────────────────────────────────┤
│ 1. ConversationCreated {id, title, timestamp}    │
│ 2. MessageAdded {id: msg1, role: user, "Hi"}     │
│ 3. MessageAdded {id: msg2, role: assistant,...}  │
│ 4. MessageAdded {id: msg3, role: user, "How?"}   │
│ 5. MessageAdded {id: msg4, role: assistant,...}  │
└──────────────────────────────────────────────────┘
     ↓ Replay all events
┌──────────────────────────────┐
│ Reconstructed State          │
│ Conversation {msgs: [1,2,3]} │
└──────────────────────────────┘
```

### Benefits

1. **Complete History**: Can query "what was the state at timestamp X?"
2. **Audit Trail**: Who did what, when
3. **Temporal Queries**: "Show me conversations at 3pm yesterday"
4. **Replay**: Recreate any past state
5. **Debugging**: Trace exactly how state evolved
6. **GDPR Compliance**: Events can act as transaction log

## Dual-Write Pattern

We use **partial event sourcing** with dual-write:

```
Aggregate modified
    ↓
Extract events (e.g., MessageAdded)
    ↓
Branch 1: Save to domain_events (immutable log)
    │
    └─ Timestamp: now
       Aggregat eId: conv-123
       EventType: MessageAdded
       Payload: {...}

Branch 2: Update conversations snapshot
    │
    └─ _id: conv-123
       messages: [updated list]
       updatedAt: now
```

### Indices in MongoDB

```typescript
// domain_events
db.domain_events.createIndex({ aggregateId: 1, occurredAt: 1 });
db.domain_events.createIndex({ eventType: 1 });
db.domain_events.createIndex({ occurredAt: 1 });

// conversations
db.conversations.createIndex({ _id: 1 });  // Built-in
```

## Invariant Enforcement

The aggregate root enforces business rules:

```typescript
export class Conversation extends AggregateRoot {
  getMessages(): Message[] {
    return [...this.messages];  // Immutable copy
  }

  addUserMessage(content: string): void {
    // Validate invariants
    if (!content || content.trim().length === 0) {
      throw new Error('Message cannot be empty');
    }

    // Only the aggregate can emit events
    const message = Message.create(Role.USER, content);
    this.messages.push(message);

    // Event is local until pulled
    this.addDomainEvent(
      new MessageAdded(this.id.getValue(), message.getId().getValue(), ...)
    );
  }

  // Add assistant without external event
  private addAssistantReply(content: string): void {
    const message = Message.create(Role.ASSISTANT, content);
    this.messages.push(message);
    // No event here - assistant reply is part of user interaction
  }
}
```

## Event Sourcing in Practice

### Scenario: User requests conversation history

```
GET /api/conversations/conv-123
    ↓
GetConversationQuery(conversationId: "conv-123")
    ↓
GetConversationHandler reads from conversations snapshot
    ├─ Fast (O(1))
    ├─ Latest state
    └─ Returns ConversationDTO
```

### Scenario: Audit - "Show conversation at specific time"

```
GET /api/conversations/conv-123?asOf=2026-03-08T14:00:00Z
    ↓
1. Query domain_events where aggregateId = conv-123
   AND occurredAt <= asOf
    ↓
2. Replay events in order
    ↓
3. Return state at that moment
```

### Scenario: Analytics - "How many messages per conversation type?"

```
db.domain_events.aggregate([
  { $match: { eventType: { $in: ["MessageAdded", "AssistantReplied"] } } },
  { $group: { _id: "$aggregateId", count: { $sum: 1 } } },
  { $sort: { count: -1 } }
])
```

## Error Handling in Commands

Commands should fail fast before modifying aggregate:

```typescript
async execute(command: SendMessageCommand): Promise<void> {
  // Validation happens BEFORE loading aggregate
  if (!command.message || command.message.trim().length === 0) {
    throw new ValidationError('Message cannot be empty');
  }

  // Load aggregate
  const conversation = await this.repo.findById(
    new ConversationId(command.conversationId),
  );

  if (!conversation) {
    throw new NotFoundError('Conversation not found');
  }

  // Now modify (guaranteed to succeed)
  conversation.addUserMessage(command.message);

  // No try-catch needed here - aggregate methods don't throw
  const events = conversation.pullDomainEvents();
  await this.eventStore.saveEvents(aggregateId, events);
}
```

## Consistency Models

### Strong Consistency
```
Request → Modify aggregate → Save to both stores → Return
(No delay, immediate consistency)
```

### Eventual Consistency
```
Request → Modify → Save to event log → Return
                   (async) → Update snapshot
```

We use **strong consistency** because:
- Single MongoDB instance (no cross-database transactions)
- Low write volume (not a bottleneck)
- User expects immediate feedback

## Testing Event Sourcing

### Unit Test: Aggregate Behavior
```typescript
it('should record message addition', () => {
  const conversation = Conversation.create();
  conversation.addUserMessage('Hello');

  const events = conversation.pullDomainEvents();
  expect(events).toHaveLength(2);  // Created + MessageAdded
  expect(events[1]).toBeInstanceOf(MessageAdded);
  expect(events[1].content).toBe('Hello');
});
```

### Integration Test: Event Store
```typescript
it('should persist and retrieve events', async () => {
  const event = new MessageAdded('conv-1', 'msg-1', Role.USER, 'Hi');
  await eventStore.saveEvents('conv-1', [event]);

  const retrieved = await eventStore.getEventsByAggregateId('conv-1');
  expect(retrieved).toHaveLength(1);
  expect(retrieved[0].content).toBe('Hi');
});
```

### Handler Test: Full Flow
```typescript
it('should stream message completion', async () => {
  const command = new SendMessageCommand(conversationId, 'Hi');
  const generator = await handler.execute(command);

  const chunks: string[] = [];
  for await (const chunk of generator) {
    chunks.push(chunk);
  }

  expect(chunks.join('')).toContain('Hello');
  expect(eventStore.saved).toHaveLength(1);  // Events persisted
  expect(repo.saved.messages).toHaveLength(2);  // User + assistant
});
```

## Versioning Events

If event structure changes:

```typescript
// Old version
class MessageAdded_v1 implements DomainEvent {
  eventVersion = 1;
  constructor(
    aggregateId: string,
    messageId: string,
    role: Role,
    content: string,
  ) {}
}

// New version with additional data
class MessageAdded_v2 implements DomainEvent {
  eventVersion = 2;
  constructor(
    aggregateId: string,
    messageId: string,
    role: Role,
    content: string,
    tokenCount: number,  // NEW
    sentiment?: string,  // NEW
  ) {}
}

// In handler: check version and adapt
if (event.eventVersion === 1) {
  return {
    ...event,
    tokenCount: estimateTokens(event.content),  // Backfill
  };
}
```

## Key Takeaway

**CQRS + Event Sourcing = Explicit, auditable, evolvable systems**

Every state change is a deliberate decision (command), captured as an event, and queries work against optimized views.
