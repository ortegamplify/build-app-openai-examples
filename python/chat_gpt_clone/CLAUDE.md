# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Activate virtual environment (required before running any Python commands)
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run the development server
python app.py
# or
flask run
```

## Environment Setup

Copy `.env.example` to `.env` and fill in values:

```
API_KEY_OPENAI=your_openai_api_key
MONGODB_URI=mongodb://localhost:27017
MONGODB_DB=chat_gpt_clone
SECRET_KEY=change_this_in_production
```

`config.py` reads these at startup and raises `ValueError` if `API_KEY_OPENAI` is missing.

## Architecture

Layered DDD-style architecture. `app.py` is the entry point and wires dependencies together (composition root).

```
app.py                          # Flask routes + dependency wiring
config.py                       # Env var loading
application/
  chat_service.py               # Use-case orchestration (no HTTP, no DB knowledge)
domain/
  entities.py                   # Conversation (has identity, not a value object)
  value_objects.py              # SessionId, ConversationId, Message, Role (frozen dataclasses)
  repository.py                 # Abstract port — ConversationRepository (ABC)
  factories.py                  # SessionIdFactory, MessageFactory, ConversationFactory
infrastructure/
  mongodb_repository.py         # Concrete adapter — MongoConversationRepository
templates/
  index.html                    # Chat UI (Vanilla JS + EventSource SSE)
  history.html                  # Conversation history viewer
```

## Request Flow

1. Browser submits text → `GET /stream?msg=...`
2. `app.py` resolves/creates `SessionId` (UUID stored in Flask session cookie)
3. `ChatService.get_or_create_conversation()` finds or creates a MongoDB document
4. User message is saved via `ChatService.record_user_message()`
5. Full conversation history is fetched and sent to OpenAI (`gpt-3.5-turbo`, streaming, `max_tokens=1024`)
6. Tokens are streamed to the browser via Server-Sent Events (SSE) as `data: {"delta": "..."}` frames
7. On stream completion, a `event: done` frame is sent and the full reply is persisted

## Session / Conversation Identity

- Flask session (cookie) holds `chat_session_id` (UUID string) and `conversation_id` (MongoDB ObjectId as string)
- Each browser session maps to one active conversation
- A new conversation is created automatically if none exists or the stored id is invalid

## Domain Patterns

- **Value Objects** (`value_objects.py`): `SessionId`, `ConversationId`, `Message` are `@dataclass(frozen=True)` — equality by value, immutable
- **Entity** (`entities.py`): `Conversation` has identity via `ConversationId`; two conversations with the same content but different ids are NOT equal
- **Repository port** (`repository.py`): abstract ABC interface — the domain declares what it needs without knowing how it's implemented
- **Factories** (`factories.py`): centralize object construction, guarantee valid initial state (`MessageFactory.user()`, `MessageFactory.assistant()`, etc.)
- **Application Service** (`chat_service.py`): orchestrates use cases; no HTTP or DB knowledge; delegates persistence to the repository

## MongoDB Schema (`conversations` collection)

```json
{
  "_id": "ObjectId",
  "session_id": "string (UUID)",
  "messages": [
    { "role": "user|assistant", "content": "string", "created_at": "datetime" }
  ],
  "created_at": "datetime",
  "updated_at": "datetime"
}
```

`find_all()` sorts by `updated_at` descending. `append_message()` uses `$push` + `$set updated_at`.

## Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Chat UI |
| GET | `/history` | Conversation history viewer (server-rendered) |
| GET | `/stream?msg=` | SSE streaming endpoint |
| GET | `/api/conversations` | List conversations (JSON, limit 100) |
| GET | `/api/conversations/<id>` | Conversation detail with full messages (JSON) |

## Frontend

- Vanilla JS, no build step
- `EventSource` for SSE consumption
- Tailwind CSS via CDN (`@tailwindcss/browser@4`)
- UI language is Spanish
- Chat bubbles: user = indigo-600 (right-aligned), assistant = gray-700 (left-aligned)
- Input + submit button disabled during streaming to prevent double-sends
