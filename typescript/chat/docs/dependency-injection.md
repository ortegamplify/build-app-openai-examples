# Dependency Injection with tsyringe

## Overview

We use **tsyringe** (Microsoft's lightweight DI container) to manage dependencies across the application. This enables:
- Loose coupling between components
- Easy testing with mocks
- Centralized configuration
- Type-safe dependency resolution

## Setup

### tsconfig.json Requirements

```json
{
  "compilerOptions": {
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  }
}
```

### Import Reflect Metadata

In `main.ts`, before anything else:

```typescript
import 'reflect-metadata';  // ← Must be first import

import dotenv from 'dotenv';
import { container } from 'tsyringe';
// ... rest of app
```

## Core Concepts

### 1. Symbols as Tokens

Instead of string-based tokens (error-prone), use Symbols:

```typescript
// tokens.ts
export const TOKENS = {
  ConversationRepo: Symbol('IConversationRepository'),
  EventStore: Symbol('IEventStore'),
  OpenAIPort: Symbol('IOpenAIPort'),
};
```

Benefits:
- ✅ Type-safe: Cannot accidentally use wrong token
- ✅ No naming collisions: Each Symbol is unique
- ✅ IDE support: Auto-complete works

### 2. Registration

Register implementations with the container:

```typescript
// container.ts
import { container } from 'tsyringe';

export function registerDependencies(): void {
  // Register concrete implementations
  container.register(TOKENS.ConversationRepo, {
    useClass: MongoConversationRepository,
  });

  container.register(TOKENS.EventStore, {
    useClass: MongoEventStore,
  });

  // Register singletons (shared instance)
  container.register(CommandBus, {
    useClass: CommandBus,
    options: { lifecycle: Lifecycle.Singleton },
  });

  // Register factory function
  container.register(TOKENS.OpenAIPort, {
    useFactory: (container) => new OpenAIAdapter(),
  });
}
```

### 3. Injection

Use `@inject()` decorator to request dependencies:

```typescript
@injectable()
export class SendMessageHandler {
  constructor(
    @inject(TOKENS.ConversationRepo)
    private readonly conversationRepository: IConversationRepository,

    @inject(TOKENS.EventStore)
    private readonly eventStore: IEventStore,

    @inject(TOKENS.OpenAIPort)
    private readonly openaiPort: IOpenAIPort,
  ) {}

  async execute(command: SendMessageCommand): Promise<void> {
    // Dependencies are automatically resolved
    const conversation = await this.conversationRepository.findById(...);
  }
}
```

The `@injectable()` decorator tells tsyringe: "This class can be instantiated from the container."

### 4. Resolution

Get instances from the container:

```typescript
// Automatic resolution
const handler = container.resolve(CreateConversationHandler);

// With dependencies
const bus = container.resolve(CommandBus);
// CommandBus's constructor dependencies are automatically resolved
```

## Dependency Graph

```
main.ts
  │
  ├─ registerDependencies()
  │   ├─ ConversationRepo → MongoConversationRepository
  │   ├─ EventStore → MongoEventStore
  │   ├─ OpenAIPort → OpenAIAdapter
  │   ├─ CommandBus (Singleton)
  │   └─ QueryBus (Singleton)
  │
  ├─ registerCommandHandlers(commandBus)
  │   ├─ CreateConversationHandler
  │   │   └─ Needs: ConversationRepo, EventStore
  │   │
  │   └─ SendMessageHandler
  │       └─ Needs: ConversationRepo, EventStore, OpenAIPort
  │
  └─ createApp()
      └─ Express routes resolve handlers from container

When user hits endpoint:
  ├─ Controller resolved (needs CommandBus, QueryBus)
  ├─ CommandBus.dispatch(command)
  ├─ Handler resolved (needs repo, eventStore, openai)
  └─ All dependencies automatically injected
```

## Lifecycle Options

tsyringe supports different lifecycles:

```typescript
import { Lifecycle } from 'tsyringe';

// Transient (default): New instance every time
container.register(SomeHandler, {
  useClass: SomeHandler,
  options: { lifecycle: Lifecycle.Transient },
});

// Singleton: One instance shared everywhere
container.register(CommandBus, {
  useClass: CommandBus,
  options: { lifecycle: Lifecycle.Singleton },
});

// ResolutionScoped: One per resolution call
container.register(RequestContext, {
  useClass: RequestContext,
  options: { lifecycle: Lifecycle.ResolutionScoped },
});
```

For our app:
- **Singletons**: `CommandBus`, `QueryBus`, `EventBus` (shared across requests)
- **Transient**: Handlers, Controllers (new instance per request)
- **Transient**: Repositories (cheap to create, can use connection pool)

## Testing with DI

### Mock Injection

```typescript
it('should create conversation', async () => {
  // Create mock repository
  const mockRepo: IConversationRepository = {
    save: jest.fn(),
    findById: jest.fn(),
    findAll: jest.fn(),
    delete: jest.fn(),
  };

  // Create mock event store
  const mockEventStore: IEventStore = {
    saveEvents: jest.fn(),
    getEventsByAggregateId: jest.fn(),
    getAllEvents: jest.fn(),
  };

  // Instantiate handler with mocks
  const handler = new CreateConversationHandler(mockRepo, mockEventStore);

  // Test
  await handler.execute(new CreateConversationCommand('Test'));

  expect(mockRepo.save).toHaveBeenCalled();
  expect(mockEventStore.saveEvents).toHaveBeenCalled();
});
```

### Container Override for Tests

```typescript
beforeEach(() => {
  // Create fresh container for each test
  container.clearInstances();
});

it('should use mock repository', async () => {
  const mockRepo = createMockRepository();

  // Override registration
  container.register(TOKENS.ConversationRepo, {
    useValue: mockRepo,
  });

  // Resolve handler (will get mock)
  const handler = container.resolve(CreateConversationHandler);
  await handler.execute(command);

  expect(mockRepo.save).toHaveBeenCalled();
});
```

## Common Patterns

### Pattern 1: Constructor Injection (Preferred)

```typescript
@injectable()
export class ConversationController {
  constructor(
    @inject(TOKENS.CommandBus)
    private commandBus: CommandBus,

    @inject(TOKENS.QueryBus)
    private queryBus: QueryBus,
  ) {}

  async create(req: Request, res: Response) {
    const result = await this.commandBus.dispatch(command);
  }
}
```

✅ Benefits:
- All dependencies visible
- Easy to test (just pass mocks)
- TypeScript checks types at compile time

### Pattern 2: Factory Registration

```typescript
container.register(TOKENS.OpenAIPort, {
  useFactory: () => {
    return new OpenAIAdapter(process.env.OPENAI_API_KEY);
  },
});
```

Use when:
- Dependencies need configuration (env vars)
- Complex initialization logic
- Conditional registration based on environment

### Pattern 3: Lazy Registration

```typescript
container.registerSingleton(QueryBus, QueryBus);

// Explicitly register handlers after bus creation
const queryBus = container.resolve(QueryBus);
const getConvHandler = container.resolve(GetConversationHandler);
queryBus.register('GetConversationQuery', getConvHandler);
```

Use when:
- Handlers need special setup
- Circular dependencies must be avoided
- Order of registration matters

## Avoiding Common Mistakes

### ❌ Mistake 1: Forgetting `@injectable()`

```typescript
// WRONG - No @injectable() decorator
export class SomeHandler {
  constructor(@inject(TOKENS.Repo) private repo) {}
}

// ERROR: Container cannot resolve dependencies
```

✅ Fix:
```typescript
@injectable()
export class SomeHandler {
  constructor(@inject(TOKENS.Repo) private repo) {}
}
```

### ❌ Mistake 2: Using String Tokens

```typescript
// WRONG - String tokens are error-prone
container.register('conversationRepository', {
  useClass: MongoConversationRepository,
});

// Easy to typo
@inject('conversationRepsoitory')  // ← Typo, no compile error!
```

✅ Fix: Use Symbols

```typescript
export const TOKENS = {
  ConversationRepo: Symbol('IConversationRepository'),
};

@inject(TOKENS.ConversationRepo)  // ← TS checks this exists
```

### ❌ Mistake 3: Circular Dependencies

```typescript
// WRONG - A needs B, B needs A
@injectable()
class ServiceA {
  constructor(@inject(ServiceB) private b: ServiceB) {}
}

@injectable()
class ServiceB {
  constructor(@inject(ServiceA) private a: ServiceA) {}
}

// CRASH: Container cannot resolve (infinite loop)
```

✅ Fix: Break cycle with factory or lazy injection

```typescript
@injectable()
class ServiceA {
  constructor(
    @inject(ServiceB) private b: ServiceB,
    @inject(TOKENS.Repo) private repo: Repo,
  ) {}
}

@injectable()
class ServiceB {
  constructor(@inject(TOKENS.Repo) private repo: Repo) {
    // Don't depend on ServiceA, only on Repo
  }
}
```

### ❌ Mistake 4: Forgetting `import 'reflect-metadata'`

```typescript
// WRONG - No reflect-metadata import
import { container } from 'tsyringe';

// CRASH: Decorators won't work
```

✅ Fix: Import in main.ts first

```typescript
import 'reflect-metadata';  // ← Must be FIRST import

import dotenv from 'dotenv';
// ... rest of app
```

## Advanced: Custom Decorators

Create a shorthand for common injection:

```typescript
// decorators.ts
export function InjectRepo() {
  return inject(TOKENS.ConversationRepo);
}

// Usage
@injectable()
export class SomeHandler {
  constructor(
    @InjectRepo() private repo: IConversationRepository,
  ) {}
}
```

## Debugging

### Print Container State

```typescript
// See what's registered
console.log(container.cradle);

// Resolve and see instance
const bus = container.resolve(CommandBus);
console.log(bus);
```

### Track Injection

```typescript
// Enable debug logging
container.options = {
  autoInject: true,
};

// Now resolution logs are available
const handler = container.resolve(CreateConversationHandler);
```

## Performance

### Resolution Time
- First resolution: ~1-5ms (reflection + instantiation)
- Subsequent singleton resolutions: <0.1ms (cached)
- Negligible impact on API response time

### Memory
- Container overhead: <1MB
- Each handler instance: <10KB
- At 1000 handlers: ~10MB

Not a bottleneck for typical applications.

## Migration Path

If DI becomes insufficient:

1. **Add Scopes**: Handle per-request context
2. **Module System**: Organize providers by feature
3. **Decorators as Middleware**: Combine DI with Express middleware
4. **Switch to NestJS**: Full framework with advanced DI

But for a monolithic app, tsyringe is more than sufficient.

## Conclusion

**Proper DI enables:**
- Clean separation of concerns
- Easy unit testing
- Flexible configuration
- Scalable architecture

Keep your container simple, use Symbols, and test with mocks.
