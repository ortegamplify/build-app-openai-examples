# Arquitectura del Backend — Chat con OpenAI

## Índice

1. [Visión general](#1-visión-general)
2. [La regla de dependencias](#2-la-regla-de-dependencias)
3. [Capa Domain](#3-capa-domain)
   - [Value Objects](#31-value-objects)
   - [Entities](#32-entities)
   - [Interfaces (puertos)](#33-interfaces-puertos)
4. [Capa Application](#4-capa-application)
   - [Use Cases](#41-use-cases)
   - [Factory Pattern](#42-factory-pattern)
5. [Capa Infrastructure](#5-capa-infrastructure)
   - [Repositorios MongoDB](#51-repositorios-mongodb)
   - [Adaptadores externos](#52-adaptadores-externos)
6. [Capa Presentation](#6-capa-presentation)
7. [Flujo completo: enviar un mensaje](#7-flujo-completo-enviar-un-mensaje)
8. [Decisiones de diseño](#8-decisiones-de-diseño)

---

## 1. Visión general

Este backend implementa **Clean Architecture** organizada en capas concéntricas. La idea central es simple: **el negocio no sabe nada de la tecnología**. MongoDB, OpenAI, Express — todos son detalles que pueden cambiar sin tocar la lógica del chat.

```
┌─────────────────────────────────────────────┐
│              Presentation                   │  ← Express, HTTP, SSE
│  ┌───────────────────────────────────────┐  │
│  │           Application                 │  │  ← Use Cases, Factory
│  │  ┌─────────────────────────────────┐  │  │
│  │  │            Domain               │  │  │  ← Entidades, Reglas
│  │  │                                 │  │  │
│  │  └─────────────────────────────────┘  │  │
│  └───────────────────────────────────────┘  │
│  ┌───────────────────────────────────────┐  │
│  │         Infrastructure                │  │  ← MongoDB, OpenAI SDK
│  └───────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

**Módulos del proyecto:**
```
src/
  modules/
    conversation/          ← único módulo de negocio por ahora
      domain/
      application/
      infrastructure/
  presentation/
    controllers/
    routes/
  main.ts
```

---

## 2. La regla de dependencias

Las dependencias **siempre apuntan hacia adentro**. Nunca al revés.

```
Presentation  →  Application  →  Domain
Infrastructure               →  Domain
```

- **Domain** no importa nada de afuera. Cero dependencias externas.
- **Application** solo importa Domain.
- **Infrastructure** implementa interfaces que Domain define.
- **Presentation** llama a Application (via Factory).

Esto significa que si mañana cambias de MongoDB a PostgreSQL, **solo tocas Infrastructure**. El dominio y los use cases quedan intactos.

---

## 3. Capa Domain

Es el corazón. Contiene las reglas del negocio puras: qué es un mensaje, qué es una conversación, cómo se comportan.

### 3.1 Value Objects

Un Value Object es un objeto **inmutable** que representa un concepto del dominio. No tiene identidad propia — su identidad es su valor.

**Reglas de un Value Object:**
- `private constructor` — nadie crea instancias directamente
- `static create()` — constructor semántico con validaciones
- `static fromPrimitive()` — hidratación desde datos crudos (ej: MongoDB)
- `toPrimitive()` — serialización a datos planos
- `equals()` — comparación por valor, no por referencia
- Cada método que "modifica" retorna una **nueva instancia**

**Ejemplo en este proyecto — `Message.ts`:**

```typescript
export class Message {
  private constructor(
    private readonly role: MessageRole,  // 'user' | 'assistant'
    private readonly content: string,
    private readonly createdAt: Date
  ) {}

  // Construcción nueva (uso normal)
  static create(role: MessageRole, content: string): Message {
    return new Message(role, content, new Date())
  }

  // Hidratación desde MongoDB
  static fromPrimitive(data: { role, content, createdAt }): Message {
    return new Message(data.role, data.content, new Date(data.createdAt))
  }

  // Serialización para guardar
  toPrimitive() {
    return { role: this.role, content: this.content, createdAt: this.createdAt.toISOString() }
  }
}
```

**¿Por qué dos constructores estáticos?**

| Método | Cuándo se usa |
|---|---|
| `create(role, content)` | Crear un mensaje nuevo desde la app |
| `fromPrimitive(data)` | Reconstruir desde MongoDB (ya tiene `createdAt`) |

### 3.2 Entities

Una Entity tiene **identidad** (un `id`). Puede contener Value Objects. En este proyecto, `Conversation` es la única entidad.

```typescript
export class Conversation {
  private constructor(
    private readonly id: string | null,   // null hasta que MongoDB asigna _id
    private readonly messages: MessageList
  ) {}

  // Agregar mensaje devuelve NUEVA instancia (inmutabilidad)
  addMessage(message: Message): Conversation {
    return new Conversation(this.id, this.messages.addMessage(message))
  }
}
```

El `id` es `null` cuando la conversación aún no se ha guardado en MongoDB. Después del primer `save()`, tiene el `_id` de Mongo.

### 3.3 Interfaces (puertos)

El dominio define **qué necesita** sin saber **cómo se implementa**:

```typescript
// ConversationRepository.ts — define el contrato
interface ConversationRepository {
  save(conversation: Conversation): Promise<Conversation>
  findById(id: string): Promise<Conversation | null>
  findAll(): Promise<Conversation[]>
  delete(id: string): Promise<boolean>
}

// OpenAIPort.ts — define el contrato con el LLM
interface OpenAIPort {
  streamChat(messages: { role: string; content: string }[]): AsyncGenerator<string>
}
```

Infrastructure implementa estos contratos. Domain nunca sabe si es Mongo, Postgres, OpenAI o un mock.

---

## 4. Capa Application

Orquesta las operaciones de negocio. Cada use case hace **una sola cosa**.

### 4.1 Use Cases

**Estructura estándar:**

```typescript
interface Props {
  conversationRepository: ConversationRepository  // dependencia inyectada
  // ...otros parámetros
}

export async function miUseCase({ conversationRepository, ... }: Props): Promise<Conversation> {
  // 1. Obtener datos del repositorio
  // 2. Aplicar lógica de dominio
  // 3. Persistir si hay cambios
  // 4. Retornar resultado
}
```

Las dependencias se pasan como parámetros (no como globales, no como singletons). Esto hace que los use cases sean **funciones puras** fáciles de testear.

**Use case con streaming — `sendMessage.ts`:**

```typescript
export async function* sendMessage({ conversationRepository, openAI, conversationId, userMessage }): AsyncGenerator<string> {
  // 1. Buscar conversación
  const conversation = await conversationRepository.findById(conversationId)
  if (!conversation) throw new Error(`Conversation ${conversationId} not found`)

  // 2. Agregar mensaje user, guardar
  const withUser = conversation.addMessage(Message.create('user', userMessage))
  await conversationRepository.save(withUser)

  // 3. Llamar a OpenAI en streaming, yield cada token
  let fullResponse = ''
  for await (const token of openAI.streamChat(withUser.getMessages().toOpenAIFormat())) {
    fullResponse += token
    yield token  // ← llega al cliente en tiempo real vía SSE
  }

  // 4. Guardar respuesta completa del assistant
  const final = withUser.addMessage(Message.create('assistant', fullResponse))
  await conversationRepository.save(final)
}
```

La clave es `async function*` — es un **generador asíncrono** que permite hacer `yield` de cada token conforme llega de OpenAI, sin esperar a que termine la respuesta completa.

### 4.2 Factory Pattern

El Factory es la "sala de ensamblaje". Instancia repositorios y compone use cases:

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

**Los controllers solo conocen el Factory**, nunca instancian repositorios directamente. Esto mantiene la Presentation limpia.

---

## 5. Capa Infrastructure

Implementa los contratos del dominio con tecnología concreta.

### 5.1 Repositorios MongoDB

```typescript
export class MongoConversationRepository implements ConversationRepository {
  async save(conversation: Conversation): Promise<Conversation> {
    const primitive = conversation.toPrimitive()

    if (primitive.id === null) {
      // Nueva conversación → insertOne
      const doc = await model.create({ messages: primitive.messages })
      return Conversation.fromPrimitive({ id: doc._id.toString(), messages: primitive.messages })
    }

    // Conversación existente → updateOne
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

**Patrón clave:** el repositorio siempre convierte entre el modelo de Mongoose (plano) y el objeto de dominio (`Conversation`). Los use cases nunca ven documentos de Mongo.

### 5.2 Adaptadores externos

```typescript
// OpenAIStreamAdapter.ts
export class OpenAIStreamAdapter implements OpenAIPort {
  async *streamChat(messages): AsyncGenerator<string> {
    const stream = await client.chat.completions.create({
      model: this.model,
      messages,
      stream: true,  // ← activa streaming
    })

    for await (const chunk of stream) {
      const token = chunk.choices[0]?.delta?.content
      if (token) yield token  // ← propaga token por token
    }
  }
}
```

---

## 6. Capa Presentation

Express actúa como "adaptador de entrada". Traduce HTTP → use cases y use cases → HTTP.

**Controllers estándar (CRUD):**
```typescript
// POST /api/conversations
async create(req, res) {
  const conversation = await ConversationFactory.createConversation()
  res.status(201).json(conversation.toPrimitive())
}
```

**Controller SSE (streaming):**
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

El formato SSE es texto plano. Cada evento es:
```
data: {"token":"Hola"}\n\n
data: {"token":" ¿cómo"}\n\n
data: {"token":" estás?"}\n\n
data: [DONE]\n\n
```

---

## 7. Flujo completo: enviar un mensaje

Ver `backend-flow.md` para el diagrama visual completo.

**Resumen de capas atravesadas:**

```
Cliente HTTP
    ↓ POST /api/conversations/:id/messages { message: "Hola" }
StreamController          [Presentation]
    ↓ ConversationFactory.sendMessage(id, message)
ConversationFactory       [Application - composición]
    ↓ sendMessage({ repo, openAI, id, message })
sendMessage use case      [Application - lógica]
    ↓ repo.findById(id)
MongoConversationRepository [Infrastructure]
    ↓ Conversation.fromPrimitive(doc)
Conversation / Message    [Domain]
    ↑ retorna entidad de dominio
sendMessage use case
    ↓ openAI.streamChat(messages)
OpenAIStreamAdapter       [Infrastructure]
    ↓ yield token por token
sendMessage use case
    ↑ yield token por token
StreamController
    ↑ res.write('data: {"token":"..."}\n\n')
Cliente HTTP (SSE)
```

---

## 8. Decisiones de diseño

| Decisión | Alternativa descartada | Razón |
|---|---|---|
| Factory para DI | tsyringe / decorators | Más simple, sin magia, fácil de entender |
| Mongoose | MongoDB driver nativo | Schema validation, métodos convenientes |
| SSE para streaming | WebSockets | Unidireccional es suficiente, más simple |
| Generadores async (`function*`) | Callbacks / EventEmitter | Composable, legible, nativo en TS |
| Entidades inmutables | Mutación directa | Predecibles, sin efectos colaterales ocultos |
| `id: null` antes de guardar | UUID generado en app | Delegar al DB evita colisiones |
