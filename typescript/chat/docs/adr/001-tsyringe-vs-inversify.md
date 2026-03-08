# ADR 001: Tsyringe vs Inversify for Dependency Injection

**Status**: Accepted

**Date**: 2026-03-08

## Context

We need a Dependency Injection container for TypeScript that:
- Supports decorator-based registration
- Integrates with tsconfig `experimentalDecorators` and `emitDecoratorMetadata`
- Minimizes learning curve for developers
- Has minimal bundle size impact
- Is actively maintained

Two main contenders: **tsyringe** (Microsoft) and **Inversify**.

## Decision

**We chose tsyringe**.

## Rationale

### tsyringe Advantages
1. **Microsoft-backed**: Part of TypeScript ecosystem, better long-term support
2. **Lighter weight**: Smaller bundle size (~8KB vs ~50KB)
3. **Simpler API**: Less boilerplate than Inversify
4. **Symbol-based tokens**: More type-safe than string-based
5. **Reflect-metadata integration**: Native support for decorator reflection

### Comparison
| Feature | tsyringe | Inversify |
|---------|----------|-----------|
| Bundle Size | ~8KB | ~50KB |
| Learning Curve | Low | Medium |
| Type Safety | High | High |
| Decorator Support | Yes | Yes |
| Symbol Tokens | Yes | Limited |
| Active Maintenance | Yes | Yes |

## Implementation Details

```typescript
// tokens.ts - Symbol-based DI tokens
export const TOKENS = {
  ConversationRepo: Symbol('IConversationRepository'),
  EventStore: Symbol('IEventStore'),
};

// container.ts - Registration
container.register(TOKENS.ConversationRepo, {
  useClass: MongoConversationRepository,
});

// Usage in handlers
@injectable()
export class SomeHandler {
  constructor(
    @inject(TOKENS.ConversationRepo)
    private readonly repo: IConversationRepository,
  ) {}
}
```

## Consequences

### Positive
- Easy to add new handlers without modifying container
- Symbol-based tokens prevent runtime name collisions
- Minimal configuration
- Type-safe dependency resolution

### Negative
- Requires `experimentalDecorators` in tsconfig
- Less powerful than Inversify for complex scenarios
- Smaller community than inversify

## Alternatives Considered

1. **Manual DI Factory**: More verbose, harder to maintain at scale
2. **Inversify**: Over-engineered for our use case, larger bundle
3. **Native dependency management**: Not suitable for complex DI graphs
