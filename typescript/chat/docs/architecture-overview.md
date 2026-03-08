# ChatGPT Clone - Architecture Overview

## Project Overview

This is a full-stack ChatGPT clone built with TypeScript, implementing **Domain-Driven Design (DDD)** with **Clean Architecture** principles. The backend uses **CQRS** (Command Query Responsibility Segregation) and **Event Sourcing**, while the frontend leverages **Next.js 16** with **React 19** and **Zustand** for state management.

## Technology Stack

### Backend
- **Runtime**: Node.js + TypeScript
- **Framework**: Express.js
- **Database**: MongoDB
- **ORM/ODM**: Mongoose
- **DI Container**: tsyringe
- **Logging**: Winston
- **Validation**: Zod
- **External API**: OpenAI API for chat completions

### Frontend
- **Framework**: Next.js 16 (App Router)
- **UI Library**: React 19
- **Styling**: Tailwind CSS 4
- **State Management**: Zustand
- **Markdown Rendering**: react-markdown + remark-gfm
- **Validation**: Zod

## Architecture Layers

### 1. Domain Layer (`src/domain/`)
The heart of the system. Contains:
- **Entities**: `Conversation` aggregate root
- **Value Objects**: `Message`, `ConversationId`, `MessageId`, `Role`
- **Domain Events**: `ConversationCreated`, `MessageAdded`, `AssistantReplied`
- **Ports (Interfaces)**: `IConversationRepository`, `IEventStore`

Follows strict DDD principles:
- Aggregates maintain invariants
- Value objects ensure immutability
- Domain events capture state changes
- Ports define contracts for external dependencies

### 2. Application Layer (`src/application/`)
Orchestrates domain logic and coordinates use cases:
- **CQRS Pattern**:
  - `CommandBus`: Routes commands to handlers
  - `QueryBus`: Routes queries to handlers
  - `EventBus`: Publishes domain events for side effects
- **Command Handlers**: `CreateConversationHandler`, `SendMessageHandler`
- **Query Handlers**: `GetConversationHandler`, `GetAllConversationsHandler`
- **Ports**: `IOpenAIPort` for external AI service

Uses in-memory buses (no external library) for simplicity.

### 3. Infrastructure Layer (`src/infrastructure/`)
Implements domain ports and external integrations:
- **Persistence**:
  - `MongoConversationRepository`: Saves aggregate snapshots
  - `MongoEventStore`: Append-only log of domain events
  - Models: `ConversationModel`, `EventStoreModel`
- **External Services**:
  - `OpenAIAdapter`: Implements `IOpenAIPort`, streams chat completions
- **Dependency Injection**:
  - `tokens.ts`: Symbol-based DI tokens
  - `container.ts`: tsyringe configuration

MongoDB uses dual-write pattern:
- **conversations**: Current state (fast reads)
- **domain_events**: Audit log + replay capability

### 4. Presentation Layer (`src/presentation/`)
HTTP API and request handling:
- **Controllers**:
  - `ConversationController`: CRUD operations
  - `StreamController`: SSE streaming for real-time tokens
- **Routes**:
  - `POST /api/conversations`: Create conversation
  - `GET /api/conversations`: List all conversations
  - `GET /api/conversations/:id`: Fetch single conversation
  - `POST /api/stream`: Stream assistant messages via SSE
- **Middleware**: CORS, error handling

### 5. Shared Layer (`src/shared/`)
Cross-cutting domain and application abstractions:
- **Domain**:
  - `AggregateRoot`: Base class with domain event tracking
  - `Entity`, `ValueObject`: Base classes
  - `UniqueId`: UUID wrapper for strongly-typed IDs
  - `DomainEvent`: Event interface
- **Application**:
  - `ICommand`, `IQuery`: CQRS interfaces
  - `ICommandHandler<C, R>`, `IQueryHandler<Q, R>`: Handler interfaces
  - `Result<T, E>`: Monad for error handling

## Key Patterns

### CQRS (Command Query Responsibility Segregation)
```
User Request
    ↓
Express Controller
    ↓
CommandBus / QueryBus
    ↓
Handler (executes command/query)
    ↓
Domain / Repository / External Service
    ↓
Response
```

### Event Sourcing (Partial)
- Domain aggregates emit events when state changes
- Events are saved to `domain_events` collection (immutable log)
- `conversations` collection stores current state (snapshot)
- Enables audit trail, event replay, and temporal queries

### SSE Streaming Flow
```
POST /api/stream {conversationId, message}
    ↓
SendMessageCommand
    ↓
1. Load conversation aggregate
2. Aggregate.addUserMessage() → MessageAdded event
3. Save events to event store
4. OpenAI.streamCompletion() → AsyncGenerator<string>
5. For each chunk: res.write(`data: {delta}\n\n`)
6. Aggregate.addAssistantMessage() → AssistantReplied event
7. Final save to repository + event store
    ↓
Client receives SSE stream, updates UI in real-time
```

## Data Models

### Conversation
```typescript
{
  _id: string (UUID)
  title: string
  messages: Message[]
  createdAt: Date
  updatedAt: Date
}
```

### Message
```typescript
{
  id: string (UUID)
  role: "user" | "assistant" | "system"
  content: string
  createdAt: Date
}
```

### Domain Event
```typescript
{
  aggregateId: string
  aggregateType: string
  eventType: string
  eventVersion: number
  payload: { ... }
  occurredAt: Date
}
```

## Running the Application

### Backend Setup
```bash
cd backend
npm install
cp .env.example .env
# Configure .env with MongoDB URI and OpenAI API key
npm run dev
```

### Frontend Setup
```bash
cd frontend
npm install
npm run dev
```

Access the app at `http://localhost:3000`

## Testing the API

### Create Conversation
```bash
curl -X POST http://localhost:3001/api/conversations \
  -H "Content-Type: application/json" \
  -d '{"title": "Test Chat"}'
```

### List Conversations
```bash
curl http://localhost:3001/api/conversations
```

### Stream Message
```bash
curl -X POST http://localhost:3001/api/stream \
  -H "Content-Type: application/json" \
  -d '{"conversationId": "...", "message": "Hello!"}'
```

## Future Enhancements

1. **Real Event Sourcing**: Full event-based persistence, no snapshots
2. **SAGAS**: Multi-step workflows for complex operations
3. **View Models**: Denormalized read models for queries
4. **WebSockets**: Replace SSE with full-duplex WebSocket support
5. **Authentication**: User-based conversation isolation
6. **Rate Limiting**: API quota management
7. **Caching**: Redis for conversation history, OpenAI response cache
