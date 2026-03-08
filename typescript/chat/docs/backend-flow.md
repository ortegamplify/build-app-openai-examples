# Flujo Visual del Backend

## Estructura de archivos

```
backend/src/
│
├── main.ts                              ← Punto de entrada
│
├── presentation/                        ← Capa HTTP (Express)
│   ├── app.ts                           ← Express + middlewares + rutas
│   ├── routes/
│   │   ├── conversationRoutes.ts        ← GET/POST /api/conversations
│   │   └── streamRoutes.ts             ← POST /api/conversations/:id/messages
│   └── controllers/
│       ├── ConversationController.ts    ← CRUD
│       └── StreamController.ts         ← SSE streaming
│
└── modules/
    └── conversation/
        ├── domain/                      ← Reglas de negocio puras
        │   ├── Message.ts              ← Value Object
        │   ├── MessageList.ts          ← Colección de Messages
        │   ├── Conversation.ts         ← Entity
        │   ├── ConversationRepository.ts ← Interface (contrato)
        │   └── OpenAIPort.ts           ← Interface (contrato)
        │
        ├── application/                 ← Orquestación
        │   ├── createConversation.ts   ← Use case
        │   ├── sendMessage.ts          ← Use case (streaming)
        │   ├── getConversation.ts      ← Use case
        │   ├── getConversations.ts     ← Use case
        │   └── ConversationFactory.ts  ← Composición de use cases
        │
        └── infrastructure/              ← Implementaciones concretas
            ├── MongoConversationRepository.ts ← MongoDB
            └── OpenAIStreamAdapter.ts         ← OpenAI SDK
```

---

## Flujo 1 — Crear conversación

```
┌─────────────────────────────────────────────────────────────────┐
│ Cliente                                                         │
│   POST /api/conversations                                       │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│ ConversationController.create()           [Presentation]        │
│   llama: ConversationFactory.createConversation()               │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│ createConversation use case               [Application]         │
│   1. Conversation.create(null, MessageList.create())            │
│      → conversación vacía, id=null                              │
│   2. conversationRepository.save(conversation)                  │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│ MongoConversationRepository.save()        [Infrastructure]      │
│   id === null → model.create({ messages: [] })                  │
│   retorna: Conversation.fromPrimitive({ id: "abc123", ... })    │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│ Cliente recibe:                                                 │
│   HTTP 201 { "id": "abc123", "messages": [] }                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Flujo 2 — Enviar mensaje (SSE Streaming)

Este es el flujo más importante. Ocurre en tiempo real, token por token.

```
┌──────────────────────────────────────────────────────────────────────┐
│ Cliente                                                              │
│   POST /api/conversations/abc123/messages                            │
│   Body: { "message": "¿Qué es la arquitectura limpia?" }             │
└────────────────────────────┬─────────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────────┐
│ StreamController.sendMessage()                  [Presentation]       │
│                                                                      │
│   1. Setea headers SSE:                                              │
│      Content-Type: text/event-stream                                 │
│      Cache-Control: no-cache                                         │
│      Connection: keep-alive                                          │
│                                                                      │
│   2. res.flushHeaders()  ← abre la conexión SSE                      │
│                                                                      │
│   3. const stream = ConversationFactory.sendMessage(id, message)     │
│      ↑ esto retorna un AsyncGenerator, NO espera a que termine       │
│                                                                      │
│   4. for await (const token of stream) {                             │
│        res.write(`data: {"token":"${token}"}\n\n`)                   │
│      }  ← cada token llega al cliente en cuanto OpenAI lo genera     │
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
│      → obtiene Conversation con historial                            │
│                                                                      │
│   2. const userMsg = Message.create('user', '¿Qué es...')           │
│      const withUser = conversation.addMessage(userMsg)               │
│      → nueva instancia inmutable                                     │
│                                                                      │
│   3. await repo.save(withUser)                                       │
│      → guarda el mensaje user en MongoDB                             │
│                                                                      │
│   4. const messages = withUser.getMessages().toOpenAIFormat()        │
│      → [{ role: 'user', content: '¿Qué es...' }]                    │
│                                                                      │
│   5. for await (const token of openAI.streamChat(messages)) {        │
│        fullResponse += token                                         │
│        yield token  ← propaga hacia arriba (StreamController)       │
│      }                                                               │
│                                                                      │
│   6. const assistantMsg = Message.create('assistant', fullResponse)  │
│      const final = withUser.addMessage(assistantMsg)                 │
│      await repo.save(final)                                          │
│      → guarda respuesta completa en MongoDB                          │
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

## Flujo de tokens en tiempo real

```
OpenAI API
    │
    │  chunk: "La"
    ▼
OpenAIStreamAdapter.streamChat()
    │  yield "La"
    ▼
sendMessage use case
    │  yield "La"  (acumula en fullResponse)
    ▼
StreamController
    │  res.write('data: {"token":"La"}\n\n')
    ▼
Cliente (navegador)
    │  EventSource recibe: data: {"token":"La"}


    │  chunk: " arquitectura"
    ▼
OpenAIStreamAdapter
    │  yield " arquitectura"
    ▼
sendMessage use case
    │  yield " arquitectura"
    ▼
StreamController
    │  res.write('data: {"token":" arquitectura"}\n\n')
    ▼
Cliente
    ... (continúa hasta el último token)


    │  stream termina
    ▼
StreamController
    │  res.write('data: [DONE]\n\n')
    │  res.end()
    ▼
Cliente
    │  EventSource: recibe [DONE] → cierra o resetea estado
```

---

## Flujo 3 — Listar / obtener conversaciones

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

## Diagrama de capas con dependencias

```
                    ┌─────────────────────────┐
                    │      PRESENTATION       │
                    │  ConversationController  │
                    │  StreamController        │
                    │  Express routes          │
                    └────────────┬────────────┘
                                 │ usa
                                 ▼
                    ┌─────────────────────────┐
                    │      APPLICATION        │
                    │  ConversationFactory     │◄──── compone
                    │  createConversation      │
                    │  sendMessage             │
                    │  getConversation         │
                    │  getConversations        │
                    └────────────┬────────────┘
                                 │ usa interfaces de
                                 ▼
          ┌──────────────────────────────────────────┐
          │                 DOMAIN                   │
          │   Conversation    Message    MessageList  │
          │   ConversationRepository (interface)      │
          │   OpenAIPort (interface)                  │
          └─────────────▲──────────────▲─────────────┘
                        │ implementa   │ implementa
          ┌─────────────┴──┐     ┌─────┴───────────────┐
          │ INFRASTRUCTURE │     │   INFRASTRUCTURE     │
          │ MongoConversati│     │  OpenAIStreamAdapter │
          │ onRepository   │     │                      │
          │   (MongoDB)    │     │   (OpenAI SDK)       │
          └────────────────┘     └──────────────────────┘
```

---

## Principios clave resumidos

| Concepto | Descripción |
|---|---|
| **Inmutabilidad** | Ningún objeto modifica su estado. Cada cambio retorna una nueva instancia |
| **Dependencias hacia adentro** | Domain no importa nada externo. Infrastructure sí importa Domain |
| **Factory = sala de ensamblaje** | Un solo lugar donde se conectan use cases con repositorios |
| **Use cases = funciones puras** | Reciben dependencias como parámetros, fáciles de testear con mocks |
| **Ports & Adapters** | `ConversationRepository` y `OpenAIPort` son "puertos". Mongo y OpenAI SDK son "adaptadores" |
| **fromPrimitive / toPrimitive** | Toda frontera de datos (DB, HTTP) usa serialización explícita |
| **AsyncGenerator** | Permite yield token por token sin bufferizar la respuesta completa |
