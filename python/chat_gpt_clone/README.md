# ChatGPT Clone

Clon funcional de una interfaz de chat usando la API de OpenAI, Flask y MongoDB. Implementa streaming de respuestas via Server-Sent Events (SSE) y persistencia de conversaciones por sesion de navegador.

## Stack

- **Backend:** Python 3.12, Flask 3.x
- **AI:** OpenAI API (`gpt-3.5-turbo`, streaming)
- **Base de datos:** MongoDB (via pymongo)
- **Frontend:** Vanilla JS, Tailwind CSS (CDN), sin paso de build
- **Arquitectura:** DDD en capas (domain / application / infrastructure / presentation)

---

## Requisitos previos

- Python 3.10+
- MongoDB corriendo localmente (o URI remota)
- API key de OpenAI

---

## Instalacion

```bash
# 1. Clonar / entrar al directorio
cd chat_gpt_clone

# 2. Crear y activar entorno virtual
python -m venv venv
source venv/bin/activate        # Linux/macOS
# venv\Scripts\activate         # Windows

# 3. Instalar dependencias
pip install -r requirements.txt

# 4. Configurar variables de entorno
cp .env.example .env
# Editar .env con tus valores reales
```

### Variables de entorno (`.env`)

| Variable | Requerida | Default | Descripcion |
|----------|-----------|---------|-------------|
| `API_KEY_OPENAI` | Si | — | API key de OpenAI |
| `MONGODB_URI` | No | `mongodb://localhost:27017` | URI de conexion a MongoDB |
| `MONGODB_DB` | No | `chat_gpt_clone` | Nombre de la base de datos |
| `SECRET_KEY` | No | `dev-secret-change-me` | Clave para firmar cookies de Flask |

`config.py` lanza `ValueError` al arrancar si `API_KEY_OPENAI` no esta definida.

---

## Ejecucion

```bash
source venv/bin/activate
python app.py
# o alternativamente:
flask run
```

La app estara disponible en `http://127.0.0.1:5000`.

---

## Rutas

| Metodo | Ruta | Descripcion |
|--------|------|-------------|
| `GET` | `/` | Interfaz de chat |
| `GET` | `/history` | Historial de conversaciones guardadas |
| `GET` | `/stream?msg=<texto>` | Endpoint SSE — recibe el mensaje del usuario y devuelve la respuesta en streaming |
| `GET` | `/api/conversations` | Lista conversaciones (JSON, hasta 100) |
| `GET` | `/api/conversations/<id>` | Detalle de una conversacion con todos sus mensajes (JSON) |

---

## Como funciona

### Flujo de un mensaje

```
Browser                Flask /stream               ChatService          MongoDB           OpenAI
  |                        |                           |                   |                |
  |-- GET /stream?msg= --->|                           |                   |                |
  |                        |-- get_session_id() ------>|                   |                |
  |                        |-- get_or_create_conv() -->|-- find_by_id() -->|                |
  |                        |                           |<-- conversation --|                |
  |                        |-- record_user_message() ->|-- append_msg() -->|                |
  |                        |-- get_messages_for_model()-->              <--messages--|      |
  |                        |                           |                   |                |
  |                        |-- chat.completions.create(stream=True) ------------------>    |
  |<-- data: {"delta":""} -|<----------------------------------------------- chunk -------|
  |<-- data: {"delta":""} -|<----------------------------------------------- chunk -------|
  |<-- event: done --------|                           |                   |                |
  |                        |-- record_assistant_msg()->|-- append_msg() -->|                |
```

### Streaming SSE

El endpoint `/stream` usa `Response(generate(), content_type="text/event-stream")` con `@stream_with_context`. Cada token de OpenAI se serializa como:

```
data: {"delta": "token"}

```

Al finalizar el stream se envia `event: done\ndata: {}\n\n` y la respuesta completa se persiste en MongoDB.

El frontend usa la API nativa `EventSource` para consumir el stream:

```js
const source = new EventSource('/stream?msg=' + encodeURIComponent(msg));
source.onmessage = (e) => { answer += JSON.parse(e.data).delta; };
source.addEventListener('done', () => source.close());
```

### Identidad de sesion

Cada navegador recibe una cookie de sesion Flask que contiene:
- `chat_session_id`: UUID generado al primer acceso, identifica al usuario/navegador
- `conversation_id`: ObjectId de MongoDB de la conversacion activa

Si la cookie no existe o el `conversation_id` ya no existe en MongoDB, se crea una nueva conversacion automaticamente.

---

## Arquitectura (DDD en capas)

El proyecto sigue una arquitectura de dominio (DDD) con separacion estricta de responsabilidades:

```
app.py                     Presentacion + composition root
config.py                  Carga de variables de entorno

domain/
  value_objects.py         SessionId, ConversationId, Message, Role
                           Son @dataclass(frozen=True): inmutables, igualdad por valor
  entities.py              Conversation: tiene identidad propia (ConversationId)
  repository.py            ConversationRepository: interfaz abstracta (ABC / puerto)
  factories.py             SessionIdFactory, MessageFactory, ConversationFactory
                           Centralizan la construccion garantizando estado valido

application/
  chat_service.py          Orquesta casos de uso: no sabe nada de HTTP ni de MongoDB
                           Delega persistencia al repositorio via la interfaz abstracta

infrastructure/
  mongodb_repository.py    MongoConversationRepository: implementacion concreta del puerto
                           Traduce entre documentos BSON y objetos de dominio

templates/
  index.html               UI de chat (Vanilla JS + SSE)
  history.html             Visor de historial (server-rendered con Jinja2)
```

### Por que esta estructura

- El **dominio** no tiene dependencias externas (ni Flask, ni pymongo, ni openai)
- La **aplicacion** (`ChatService`) solo depende del puerto abstracto (`ConversationRepository`), no de MongoDB
- La **infraestructura** implementa el puerto; si se quisiera cambiar de MongoDB a Postgres, solo cambia esta capa
- `app.py` actua como composition root: instancia las dependencias concretas y las inyecta

---

## Esquema MongoDB

Coleccion: `conversations`

```json
{
  "_id": "ObjectId",
  "session_id": "uuid-string",
  "messages": [
    {
      "role": "user",
      "content": "Hola, como estas?",
      "created_at": "ISODate"
    },
    {
      "role": "assistant",
      "content": "Hola! Estoy bien, gracias por preguntar...",
      "created_at": "ISODate"
    }
  ],
  "created_at": "ISODate",
  "updated_at": "ISODate"
}
```

Los mensajes se almacenan como array embebido dentro del documento de la conversacion. Cada llamada a `append_message()` usa `$push` en el array y actualiza `updated_at` con `$set`.

---

## Dependencias

```
Flask>=3.0.0
openai>=1.0.0
python-dotenv>=1.0.0
pymongo>=4.6.0
```
