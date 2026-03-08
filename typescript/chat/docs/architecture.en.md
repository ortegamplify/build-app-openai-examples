# Backend Architecture - OpenAI Chat

## Table of Contents

1. [Overview](#1-overview)
2. [Dependency rule](#2-dependency-rule)
3. [Domain layer](#3-domain-layer)
   - [Value Objects](#31-value-objects)
   - [Entities](#32-entities)
   - [Interfaces (ports)](#33-interfaces-ports)
4. [Application layer](#4-application-layer)
   - [Use Cases](#41-use-cases)
   - [Factory Pattern](#42-factory-pattern)
5. [Infrastructure layer](#5-infrastructure-layer)
   - [MongoDB repositories](#51-mongodb-repositories)
   - [External adapters](#52-external-adapters)
6. [Presentation layer](#6-presentation-layer)
7. [Full flow: sending a message](#7-full-flow-sending-a-message)
8. [Design decisions](#8-design-decisions)

---

## 1. Overview

This backend implements **Clean Architecture** organized in concentric layers. The core idea is simple: **the business does not know anything about technology**. MongoDB, OpenAI, Express - they are all details that can change without touching chat logic.

```
┌─────────────────────────────────────────────┐
│              Presentation                   │  ← Express, HTTP, SSE
│  ┌───────────────────────────────────────┐  │
│  │           Application                 │  │  ← Use Cases, Factory
│  │  ┌─────────────────────────────────┐  │  │
│  │  │            Domain               │  │  │  ← Entities, Rules
│  │  │                                 │  │  │
│  │  └─────────────────────────────────┘  │  │
│  └───────────────────────────────────────┘  │
│  ┌───────────────────────────────────────┐  │
│  │         Infrastructure                │  │  ← MongoDB, OpenAI SDK
│  └───────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

**Project modules:**
```
src/
  modules/
    conversation/          ← only business module for now
      domain/
      application/
      infrastructure/
  presentation/
    controllers/
    routes/
  main.ts
```

---

## 2. Dependency rule

Dependencies **always point inward**. Never the other way around.

```
Presentation  →  Application  →  Domain
Infrastructure               →  Domain
```

- **Domain** imports nothing from outside. Zero external dependencies.
- **Application** only imports Domain.
- **Infrastructure** implements interfaces defined by Domain.
- **Presentation** calls Application (through Factory).

This means that if you switch from MongoDB to PostgreSQL tomorrow, **you only touch Infrastructure**. Domain and use cases stay intact.

---

## 3. Domain layer

This is the core. It contains pure business rules: what a message is, what a conversation is, and how they behave.

### 3.1 Value Objects

A Value Object is an **immutable** object that represents a domain concept. It has no identity of its own - its identity is its value.

**Value Object rules:**
- `private constructor` - nobody creates instances directly
- `static create()` - semantic constructor with validations
- `static fromPrimitive()` - hydration from raw data (for example: MongoDB)
- `toPrimitive()` - serialization to plain data
- `equals()` - compare by value, not by reference
- Every method that "changes" state returns a **new instance**

**Example in this project - `Message.ts`:**

```typescript
export class Message {
  private constructor(
    private readonly role: MessageRole,  // 'user' | 'assistant'
    private readonly content: string,
    private readonly createdAt: Date
  ) {}

  // New creation (normal usage)
  static create(role: MessageRole, content: string): Message {
    return new Message(role, content, new Date())
  }

  // Hydration from MongoDB
  static fromPrimitive(data: { role, content, createdAt }): Message {
    return new Message(data.role, data.content, new Date(data.createdAt))
  }

  // Serialization for persistence
  toPrimitive() {
    return { role: this.role, content: this.content, createdAt: this.createdAt.toISOString() }
  }
}
```

**Why two static constructors?**

| Method | When to use |
|---|---|
| `create(role, content)` | Create a new message from the app |
| `fromPrimitive(data)` | Rebuild from MongoDB (already has `createdAt`) |

### 3.2 Entities

An Entity has **identity** (an `id`). It can contain Value Objects. In this project, `Conversation` is the only entity.

```typescript
export class Conversation {
  private constructor(
    private readonly id: string | null,   // null until MongoDB assigns _id
    private readonly messages: MessageList
  ) {}

  // Adding a message returns a NEW instance (immutability)
  addMessage(message: Message): Conversation {
    return new Conversation(this.id, this.messages.addMessage(message))
  }
}
```

`id` is `null` while the conversation has not been saved in MongoDB yet. After the first `save()`, it contains Mongo's `_id`.

### 3.3 Interfaces (ports)

The domain defines **what it needs** without knowing **how it is implemented**:

```typescript
// ConversationRepository.ts - defines the contract
interface ConversationRepository {
  save(conversation: Conversation): Promise<Conversation>
  findById(id: string): Promise<Conversation | null>
  findAll(): Promise<Conversation[]>
  delete(id: string): Promise<boolean>
}

// OpenAIPort.ts - defines the contract with the LLM
interface OpenAIPort {
  streamChat(messages: { role: string; content: string }[]): AsyncGenerator<string>
}
```

Infrastructure implements these contracts. Domain never knows if it is Mongo, Postgres, OpenAI, or a mock.

---

## 4. Application layer

It orchestrates business operations. Each use case does **one thing**.

### 4.1 Use Cases

**Standard structure:**

```typescript
interface Props {
  conversationRepository: ConversationRepository  // injected dependency
  // ...other parameters
}

export async function miUseCase({ conversationRepository, ... }: Props): Promise<Conversation> {
  // 1. Get data from repository
  // 2. Apply domain logic
  // 3. Persist if there are changes
  // 4. Return result
}
```

Dependencies are passed as parameters (not globals, not singletons). This makes use cases **pure functions** that are easy to test.

**Use case with streaming - `sendMessage.ts`:**

```typescript
export async function* sendMessage({ conversationRepository, openAI, conversationId, userMessage }): AsyncGenerator<string> {
  // 1. Find conversation
  const conversation = await conversationRepository.findById(conversationId)
  if (!conversation) throw new Error(`Conversation ${conversationId} not found`)

  // 2. Add user message, save
  const withUser = conversation.addMessage(Message.create('user', userMessage))
  await conversationRepository.save(withUser)

  // 3. Call OpenAI with streaming, yield each token
  let fullResponse = ''
  for await (const token of openAI.streamChat(withUser.getMessages().toOpenAIFormat())) {
    fullResponse += token
    yield token  // ← reaches the client in real time via SSE
  }

  // 4. Save full assistant response
  const final = withUser.addMessage(Message.create('assistant', fullResponse))
  await conversationRepository.save(final)
}
```

The key is `async function*` - it is an **async generator** that lets you `yield` each token as it arrives from OpenAI, without waiting for the full response to finish.

### 4.2 Factory Pattern

The Factory is the "assembly room." It instantiates repositories and composes use cases:

```typescript
// ConversationFactory.ts
const ConversationFactory = {
  createConversation: () =>
    createConversation({ conversationRepository: new MongoConversationRepository() }),

  sendMessage: (conversationId: string, userMessage: string) =>
    sendMessage({
      conversationId,
      userMessage,
      conversationRepository: new MongoConversationRepository(),
      openAI: new OpenAIStreamAdapter(),
    }),
  // ...
}
```

**Controllers only know the Factory**, they never instantiate repositories directly. This keeps Presentation clean.

---

## 5. Infrastructure layer

It implements domain contracts using concrete technology.

### 5.1 MongoDB repositories

```typescript
export class MongoConversationRepository implements ConversationRepository {
  async save(conversation: Conversation): Promise<Conversation> {
    const primitive = conversation.toPrimitive()

    if (primitive.id === null) {
      // New conversation → insertOne
      const doc = await model.create({ messages: primitive.messages })
      return Conversation.fromPrimitive({ id: doc._id.toString(), messages: primitive.messages })
    }

    // Existing conversation → updateOne
    await model.findByIdAndUpdate(primitive.id, { messages: primitive.messages })
    return conversation
  }

  async findById(id: string): Promise<Conversation | null> {
    const doc = await model.findById(id).lean()
    if (!doc) return null
    return Conversation.fromPrimitive({ id: doc._id.toString(), messages: doc.messages })
  }
}
```

**Key pattern:** the repository always converts between the Mongoose model (plain) and the domain object (`Conversation`). Use cases never see Mongo documents.

### 5.2 External adapters

```typescript
// OpenAIStreamAdapter.ts
export class OpenAIStreamAdapter implements OpenAIPort {
  async *streamChat(messages): AsyncGenerator<string> {
    const stream = await client.chat.completions.create({
      model: this.model,
      messages,
      stream: true,  // ← enables streaming
    })

    for await (const chunk of stream) {
      const token = chunk.choices[0]?.delta?.content
      if (token) yield token  // ← propagate token by token
    }
  }
}
```

---

## 6. Presentation layer

Express acts as an "input adapter." It translates HTTP → use cases and use cases → HTTP.

**Standard controllers (CRUD):**
```typescript
// POST /api/conversations
async create(req, res) {
  const conversation = await ConversationFactory.createConversation()
  res.status(201).json(conversation.toPrimitive())
}
```

**SSE controller (streaming):**
```typescript
// POST /api/conversations/:id/messages
async sendMessage(req, res) {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.flushHeaders()

  const stream = ConversationFactory.sendMessage(id, message)

  for await (const token of stream) {
    res.write(`data: ${JSON.stringify({ token })}\n\n`)
  }

  res.write('data: [DONE]\n\n')
  res.end()
}
```

SSE format is plain text. Each event is:
```
data: {"token":"Hello"}\n\n
data: {"token":" how"}\n\n
data: {"token":" are you?"}\n\n
data: [DONE]\n\n
```

---

## 7. Full flow: sending a message

See `backend-flow.md` for the full visual diagram.

**Layer-by-layer summary:**

```
HTTP client
    ↓ POST /api/conversations/:id/messages { message: "Hello" }
StreamController          [Presentation]
    ↓ ConversationFactory.sendMessage(id, message)
ConversationFactory       [Application - composition]
    ↓ sendMessage({ repo, openAI, id, message })
sendMessage use case      [Application - logic]
    ↓ repo.findById(id)
MongoConversationRepository [Infrastructure]
    ↓ Conversation.fromPrimitive(doc)
Conversation / Message    [Domain]
    ↑ returns domain entity
sendMessage use case
    ↓ openAI.streamChat(messages)
OpenAIStreamAdapter       [Infrastructure]
    ↓ yield token by token
sendMessage use case
    ↑ yield token by token
StreamController
    ↑ res.write('data: {"token":"..."}\n\n')
HTTP client (SSE)
```

---

## 8. Design decisions

| Decision | Alternative discarded | Reason |
|---|---|---|
| Factory for DI | `tsyringe` / decorators | Simpler, no magic, easier to understand |
| Mongoose | Native MongoDB driver | Schema validation, convenient methods |
| SSE for streaming | WebSockets | One-way is enough, simpler |
| Async generators (`function*`) | Callbacks / EventEmitter | Composable, readable, native in TS |
| Immutable entities | Direct mutation | Predictable, no hidden side effects |
| `id: null` before save | App-generated UUID | Delegating to DB avoids collisions |
