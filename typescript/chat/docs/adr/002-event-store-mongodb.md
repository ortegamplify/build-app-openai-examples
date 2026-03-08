# ADR 002: Event Store Design with MongoDB

**Status**: Accepted

**Date**: 2026-03-08

## Context

We need to implement Event Sourcing to maintain an audit trail of all conversation changes. We must decide on:
- Storage strategy (append-only, immutable log)
- Database schema design
- Snapshot vs full replay strategy
- Event versioning

## Decision

**Dual-write pattern with MongoDB**:
- `conversations`: Current aggregate state (snapshot)
- `domain_events`: Append-only immutable event log
- Store ALL events, even if conversation is updated

## Rationale

### Why Dual-Write (Not Pure Event Sourcing)?
Pure Event Sourcing requires replaying all events on every query, which is:
- Expensive for conversations with 1000+ messages
- Slower than direct snapshot reads

Dual-write gives us the best of both worlds:
- **Fast reads**: Snapshot in `conversations` collection (O(1))
- **Audit trail**: Immutable log in `domain_events` (append-only)
- **Replay capability**: Can reconstruct any past state from events

### Schema Design

#### domain_events collection
```typescript
{
  _id: ObjectId,
  aggregateId: string,          // UUID of Conversation
  aggregateType: string,         // "Conversation"
  eventType: string,             // "MessageAdded" | "ConversationCreated" | ...
  eventVersion: number,          // 1, 2, 3, ...
  payload: object,               // The event itself (serialized)
  occurredAt: Date,              // When event happened
  createdAt: Date,               // When persisted
}
```

Indices:
- `{aggregateId: 1, occurredAt: 1}`: Efficient event retrieval per aggregate
- `{eventType: 1}`: Query events by type
- `{occurredAt: 1}`: Timeline queries

#### conversations collection
```typescript
{
  _id: string,                   // UUID of Conversation
  title: string,
  messages: [                    // Current state snapshot
    {
      id: string,
      role: "user" | "assistant",
      content: string,
      createdAt: Date,
    }
  ],
  createdAt: Date,
  updatedAt: Date,
}
```

## Event Versioning

Each domain event has `eventVersion: 1`.

If we need to evolve events in the future:
```typescript
// Old event structure
class MessageAdded_v1 {
  eventVersion = 1;
}

// New event with additional fields
class MessageAdded_v2 {
  eventVersion = 2;
  tokenCount?: number;  // New field
}

// Handlers check eventVersion and migrate if needed
```

## Flow Example

### Adding a Message
```
1. User sends message "Hello"
2. Handler creates Conversation aggregate
3. aggregate.addUserMessage("Hello") → raises MessageAdded event
4. Save events to domain_events:
   {
     aggregateId: "conv-123",
     eventType: "MessageAdded",
     payload: { messageId, role: "user", content: "Hello", ... }
   }
5. Update conversations snapshot:
   {
     _id: "conv-123",
     messages: [{ id, role: "user", content: "Hello", createdAt }],
     updatedAt: now
   }
```

## Replay Capability

To reconstruct a conversation's state at any point:
```typescript
const events = await eventStore.getEventsByAggregateId(conversationId);
const conversation = new Conversation(id);

for (const event of events) {
  if (event.eventType === 'MessageAdded') {
    conversation.addMessageFromEvent(event);
  }
}

// conversation now has exact state at that point in time
```

## Consequences

### Positive
- Complete audit trail of all changes
- Can answer questions like "what did the conversation look like at 2pm?"
- Event-driven architecture enables future SAGAS and side effects
- Append-only guarantees data integrity
- No lost information

### Negative
- Additional storage (event log + snapshot)
- Must keep snapshots in sync with events
- More complex migration strategy if event structure changes
- Requires careful handling of eventual consistency

## Monitoring

Track:
- Event count per aggregateId (conversation growth)
- Event types distribution (user vs assistant messages)
- Time between events (conversation pauses)
- Event storage size growth

## Future Evolution

1. **View Models**: Create denormalized read models for faster queries
2. **Event Projections**: Real-time analytics from event stream
3. **Full Event Sourcing**: Remove snapshot, always replay (if needed)
4. **Event Store DB**: Migrate to specialized ES database (EventStoreDB, Axon)
