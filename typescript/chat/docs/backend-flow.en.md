# Backend Visual Flow

## File structure

```
backend/src/
│
├── main.ts                              ← Entry point
│
├── presentation/                        ← HTTP layer (Express)
│   ├── app.ts                           ← Express + middlewares + routes
│   ├── routes/
│   │   ├── conversationRoutes.ts        ← GET/POST /api/conversations
│   │   └── streamRoutes.ts              ← POST /api/conversations/:id/messages
│   └── controllers/
│       ├── ConversationController.ts    ← CRUD
│       └── StreamController.ts          ← SSE streaming
│
└── modules/
    └── conversation/
        ├── domain/                      ← Pure business rules
        │   ├── Message.ts               ← Value Object
        │   ├── MessageList.ts           ← Collection of Messages
        │   ├── Conversation.ts          ← Entity
        │   ├── ConversationRepository.ts ← Interface (contract)
        │   └── OpenAIPort.ts            ← Interface (contract)
        │
        ├── application/                 ← Orchestration
        │   ├── createConversation.ts    ← Use case
        │   ├── sendMessage.ts           ← Use case (streaming)
        │   ├── getConversation.ts       ← Use case
        │   ├── getConversations.ts      ← Use case
        │   └── ConversationFactory.ts   ← Use case composition
        │
        └── infrastructure/              ← Concrete implementations
            ├── MongoConversationRepository.ts ← MongoDB
            └── OpenAIStreamAdapter.ts         ← OpenAI SDK
```

---

## Flow 1 - Create conversation

```
┌─────────────────────────────────────────────────────────────────┐
│ Client                                                          │
│   POST /api/conversations                                       │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│ ConversationController.create()           [Presentation]        │
│   calls: ConversationFactory.createConversation()               │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│ createConversation use case               [Application]         │
│   1. Conversation.create(null, MessageList.create())            │
│      → empty conversation, id=null                              │
│   2. conversationRepository.save(conversation)                  │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│ MongoConversationRepository.save()        [Infrastructure]      │
│   id === null → model.create({ messages: [] })                 │
│   returns: Conversation.fromPrimitive({ id: "abc123", ... })   │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│ Client receives:                                                │
│   HTTP 201 { "id": "abc123", "messages": [] }                │
└─────────────────────────────────────────────────────────────────┘
```

---

## Flow 2 - Send message (SSE Streaming)

This is the most important flow. It happens in real time, token by token.

```
┌──────────────────────────────────────────────────────────────────────┐
│ Client                                                               │
│   POST /api/conversations/abc123/messages                            │
│   Body: { "message": "What is clean architecture?" }               │
└────────────────────────────┬─────────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────────┐
│ StreamController.sendMessage()                  [Presentation]       │
│                                                                      │
│   1. Sets SSE headers:                                               │
│      Content-Type: text/event-stream                                 │
│      Cache-Control: no-cache                                         │
│      Connection: keep-alive                                          │
│                                                                      │
│   2. res.flushHeaders()  ← opens SSE connection                      │
│                                                                      │
│   3. const stream = ConversationFactory.sendMessage(id, message)     │
│      ↑ this returns an AsyncGenerator, it does NOT wait to finish    │
│                                                                      │
│   4. for await (const token of stream) {                             │
│        res.write(`data: {"token":"${token}"}\n\n`)                │
│      }  ← each token reaches client as soon as OpenAI generates it   │
│                                                                      │
│   5. res.write('data: [DONE]\n\n')                                   │
│      res.end()                                                       │
└────────────────────────────┬─────────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────────┐
│ sendMessage use case                            [Application]        │
│                                                                      │
│   1. repo.findById("abc123")                                         │
│      → gets Conversation with history                                │
│                                                                      │
│   2. const userMsg = Message.create('user', 'What is...')           │
│      const withUser = conversation.addMessage(userMsg)              │
│      → new immutable instance                                        │
│                                                                      │
│   3. await repo.save(withUser)                                      │
│      → saves user message in MongoDB                                │
│                                                                      │
│   4. const messages = withUser.getMessages().toOpenAIFormat()       │
│      → [{ role: 'user', content: 'What is...' }]                    │
│                                                                      │
│   5. for await (const token of openAI.streamChat(messages)) {       │
│        fullResponse += token                                         │
│        yield token  ← propagates upward (StreamController)           │
│      }                                                               │
│                                                                      │
│   6. const assistantMsg = Message.create('assistant', fullResponse) │
│      const final = withUser.addMessage(assistantMsg)                │
│      await repo.save(final)                                         │
│      → saves full response in MongoDB                               │
└──────────┬─────────────────────────────────────────────────────┬─────┘
           │                                                     │
           ▼                                                     ▼
┌─────────────────────────┐                  ┌────────────────────────────┐
│ MongoConversationRepo   │                  │ OpenAIStreamAdapter        │
│    [Infrastructure]     │                  │    [Infrastructure]        │
│                         │                  │                            │
│  findById → lean doc    │                  │  client.chat.completions   │
│  → fromPrimitive()      │                  │    .create({ stream:true })│
│                         │                  │                            │
│  save → findByIdAndUp.. │                  │  for await chunk of stream │
│                         │                  │    yield chunk.delta.cont. │
└─────────────────────────┘                  └────────────────────────────┘
```

---

## Real-time token flow

```
OpenAI API
    │
    │  chunk: "Clean"
    ▼
OpenAIStreamAdapter.streamChat()
    │  yield "Clean"
    ▼
sendMessage use case
    │  yield "Clean"  (accumulates in fullResponse)
    ▼
StreamController
    │  res.write('data: {"token":"Clean"}\n\n')
    ▼
Client (browser)
    │  EventSource receives: data: {"token":"Clean"}


    │  chunk: " architecture"
    ▼
OpenAIStreamAdapter
    │  yield " architecture"
    ▼
sendMessage use case
    │  yield " architecture"
    ▼
StreamController
    │  res.write('data: {"token":" architecture"}\n\n')
    ▼
Client
    ... (continues until the last token)


    │  stream ends
    ▼
StreamController
    │  res.write('data: [DONE]\n\n')
    │  res.end()
    ▼
Client
    │  EventSource: receives [DONE] → closes or resets state
```

---

## Flow 3 - List / get conversations

```
GET /api/conversations
        ↓
ConversationController.findAll()
        ↓
ConversationFactory.getConversations()
        ↓
getConversations use case
        ↓
MongoConversationRepository.findAll()
        ↓
model.find().lean()
        ↓
docs.map(doc => Conversation.fromPrimitive({ id, messages }))
        ↓
conversations.map(c => c.toPrimitive())
        ↓
HTTP 200 [{ id, messages }, ...]
```

---

## Layer diagram with dependencies

```
                    ┌─────────────────────────┐
                    │      PRESENTATION       │
                    │  ConversationController │
                    │  StreamController       │
                    │  Express routes         │
                    └────────────┬────────────┘
                                 │ uses
                                 ▼
                    ┌─────────────────────────┐
                    │      APPLICATION        │
                    │  ConversationFactory    │◄──── composes
                    │  createConversation     │
                    │  sendMessage            │
                    │  getConversation        │
                    │  getConversations       │
                    └────────────┬────────────┘
                                 │ uses interfaces from
                                 ▼
          ┌──────────────────────────────────────────┐
          │                 DOMAIN                   │
          │   Conversation    Message    MessageList │
          │   ConversationRepository (interface)     │
          │   OpenAIPort (interface)                 │
          └─────────────▲──────────────▲─────────────┘
                        │ implements   │ implements
          ┌─────────────┴──┐     ┌─────┴───────────────┐
          │ INFRASTRUCTURE │     │   INFRASTRUCTURE    │
          │ MongoConversati│     │  OpenAIStreamAdapter│
          │ onRepository   │     │                     │
          │   (MongoDB)    │     │   (OpenAI SDK)      │
          └────────────────┘     └─────────────────────┘
```

---

## Key principles summary

| Concept | Description |
|---|---|
| **Immutability** | No object mutates its own state. Every change returns a new instance |
| **Inward dependencies** | Domain imports nothing external. Infrastructure imports Domain |
| **Factory = assembly room** | A single place where use cases are wired to repositories |
| **Use cases = pure functions** | They receive dependencies as parameters, easy to test with mocks |
| **Ports & Adapters** | `ConversationRepository` and `OpenAIPort` are ports. Mongo and OpenAI SDK are adapters |
| **fromPrimitive / toPrimitive** | Every data boundary (DB, HTTP) uses explicit serialization |
| **AsyncGenerator** | Enables yielding token by token without buffering the entire response |
