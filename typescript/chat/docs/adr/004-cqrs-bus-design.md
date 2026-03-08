# ADR 004: In-Memory CQRS Bus Design (No External Library)

**Status**: Accepted

**Date**: 2026-03-08

## Context

We need CQRS (Command Query Responsibility Segregation) to:
- Route commands to handlers
- Route queries to handlers
- Publish domain events for side effects
- Keep code testable and decoupled

Options:
1. **In-memory bus** (custom implementation)
2. **NestJS/TypeORM decorators** (framework-dependent)
3. **eventstore-js/mediate** (external library)
4. **Message queue** (RabbitMQ/Kafka) - overkill for monolith

## Decision

**We built a custom in-memory CQRS bus** with three components:
- `CommandBus`: Routes commands to handlers
- `QueryBus`: Routes queries to handlers
- `EventBus`: Publishes domain events

## Rationale

### Why Not Use a Library?
1. **Minimal overhead**: Only 50-100 lines of code total
2. **Full control**: No hidden magic, easy to debug
3. **Zero learning curve**: Simple Map-based dispatch
4. **No lock-in**: Can replace easily if needed
5. **Production-proven**: Used in countless DDD systems

### Bus Architecture

```
┌─ Controller
│
├─ CommandBus / QueryBus
│  │
│  ├─ Map<string, Handler>
│  │  ├─ "CreateConversationCommand" → CreateConversationHandler
│  │  ├─ "SendMessageCommand" → SendMessageHandler
│  │  └─ "GetConversationQuery" → GetConversationHandler
│  │
│  └─ dispatch(command/query) → Promise<Result>
│
└─ Domain / Repository / External Service
```

## Implementation

### CommandBus
```typescript
@injectable()
export class CommandBus {
  private handlers: Map<string, ICommandHandler<any, any>> = new Map();

  register<C extends ICommand, R>(
    commandName: string,
    handler: ICommandHandler<C, R>,
  ): void {
    this.handlers.set(commandName, handler);
  }

  async dispatch<C extends ICommand, R>(command: C): Promise<R> {
    const commandName = command.constructor.name;
    const handler = this.handlers.get(commandName);

    if (!handler) {
      throw new Error(`No handler registered for command: ${commandName}`);
    }

    return handler.execute(command);
  }
}
```

### QueryBus (identical pattern)
```typescript
async dispatch<Q extends IQuery, R>(query: Q): Promise<R> {
  const queryName = query.constructor.name;
  const handler = this.handlers.get(queryName);
  if (!handler) throw new Error(`No handler: ${queryName}`);
  return handler.execute(query);
}
```

### EventBus (publisher pattern)
```typescript
@injectable()
export class EventBus {
  private handlers: Map<string, EventHandler[]> = new Map();

  subscribe(eventType: string, handler: EventHandler): void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, []);
    }
    this.handlers.get(eventType)!.push(handler);
  }

  async publishAll(events: DomainEvent[]): Promise<void> {
    await Promise.all(events.map(e => this.publish(e)));
  }

  private async publish(event: DomainEvent): Promise<void> {
    const handlers = this.handlers.get(event.eventType) || [];
    await Promise.all(handlers.map(h => h(event)));
  }
}
```

## Registration

### Container Setup
```typescript
// di/container.ts
export function registerCommandHandlers(commandBus: CommandBus): void {
  const createHandler = container.resolve(CreateConversationHandler);
  commandBus.register('CreateConversationCommand', createHandler);
  // More registrations...
}
```

### Main Bootstrap
```typescript
// main.ts
const commandBus = container.resolve(CommandBus);
const queryBus = container.resolve(QueryBus);

registerCommandHandlers(commandBus);
registerQueryHandlers(queryBus);

const app = createApp();
app.listen(port);
```

## Usage in Controllers

```typescript
@injectable()
export class ConversationController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  async create(req: Request, res: Response): Promise<void> {
    const command = new CreateConversationCommand(req.body.title);
    const conversationId = await this.commandBus.dispatch(command);
    res.json({ id: conversationId });
  }

  async getAll(req: Request, res: Response): Promise<void> {
    const query = new GetAllConversationsQuery();
    const conversations = await this.queryBus.dispatch(query);
    res.json(conversations);
  }
}
```

## Command vs Query

### Commands
- **Intent-based**: "CreateConversation", "SendMessage"
- **Side effects**: Modify state, emit events
- **Return**: Result or ID
- **Example**:
  ```typescript
  class CreateConversationCommand implements ICommand {
    constructor(readonly title: string) {}
  }
  ```

### Queries
- **Data retrieval**: "GetConversation", "GetAllConversations"
- **No side effects**: Read-only
- **Return**: DTO (Data Transfer Object)
- **Example**:
  ```typescript
  class GetConversationQuery implements IQuery {
    constructor(readonly conversationId: string) {}
  }
  ```

## Event Publishing

After a command modifies an aggregate:

```typescript
async execute(command: SendMessageCommand): Promise<AsyncGenerator<string>> {
  const conversation = await this.conversationRepository.findById(id);

  // Aggregate emits events when modified
  conversation.addUserMessage(command.message);

  // Extract events (clears them from aggregate)
  const events = conversation.pullDomainEvents();

  // Persist to event store
  await this.eventStore.saveEvents(aggregateId, events);

  // Publish for side effects (optional)
  await this.eventBus.publishAll(events);
}
```

Event handlers can react:
```typescript
eventBus.subscribe('MessageAdded', async (event) => {
  // Update read model, send notification, etc.
});
```

## Testing Benefits

### Mock a Command Handler
```typescript
it('should create conversation', async () => {
  const repo = new MockConversationRepository();
  const handler = new CreateConversationHandler(repo, new MockEventStore());

  const command = new CreateConversationCommand('Test');
  const id = await handler.execute(command);

  expect(repo.savedConversation).toBeDefined();
});
```

### No Magic, Easy to Debug
```typescript
// Just follow the code flow
command → handler → repository → response
```

## Scaling Path

If this grows to async/distributed commands:

```typescript
// Phase 2: Queued commands
class QueuedCommandBus extends CommandBus {
  async dispatch<C extends ICommand, R>(command: C): Promise<R> {
    await rabbitmq.publish('commands', command);
    return waitForResult(command.id);
  }
}

// Phase 3: Saga pattern
class SagaBus extends CommandBus {
  async executeSequence(commands: ICommand[]): Promise<void> {
    for (const cmd of commands) {
      try {
        await this.dispatch(cmd);
      } catch (e) {
        // Compensating transaction
        await this.dispatch(compensatingCommand);
      }
    }
  }
}
```

But for a monolith, in-memory is perfect.

## Consequences

### Positive
- ✅ Zero dependencies
- ✅ Easy to understand
- ✅ Minimal code
- ✅ Perfect for DDD
- ✅ Testable
- ✅ Framework-agnostic

### Negative
- ❌ Must manually register handlers
- ❌ No automatic discovery
- ❌ Not suitable for async message bus (single process only)

## Alternatives Considered

1. **NestJS**: Great framework, but opinionated, more overhead
2. **Mediate/EventBus libraries**: Too heavyweight for this use case
3. **Direct repository calls**: No separation of concerns
4. **GraphQL with directives**: Overkill, adds new complexity

## When to Migrate

If you need:
- **Multiple servers**: Switch to RabbitMQ + async handlers
- **Long-running jobs**: Add Bull/Bee-Queue for background tasks
- **Event sourcing at scale**: Move to EventStore DB
- **Micro-services**: NestJS + gRPC per service

Then the bus pattern remains the same, just different transport underneath.

## Conclusion

**Simple, proven CQRS beats complex frameworks** for a monolithic DDD application. If you can read `CommandBus.ts` in 2 minutes, you're doing it right.
