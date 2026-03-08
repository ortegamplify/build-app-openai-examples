import json

from flask import Flask, Response, render_template, request, session, stream_with_context
from openai import OpenAI

import config
from application.chat_service import ChatService
from domain.factories import SessionIdFactory
from domain.value_objects import ConversationId, SessionId
from infrastructure.mongodb_repository import MongoConversationRepository

# ---------------------------------------------------------------------------
# Wiring — composición de dependencias
# ---------------------------------------------------------------------------

openai_client = OpenAI(api_key=config.API_KEY)
repository = MongoConversationRepository(config.MONGODB_URI, config.MONGODB_DB)
chat_service = ChatService(repository)

app = Flask(__name__)
app.secret_key = config.SECRET_KEY


# ---------------------------------------------------------------------------
# Helpers de sesión Flask
# ---------------------------------------------------------------------------

def get_session_id() -> SessionId:
    raw = session.get("chat_session_id")
    if not raw:
        sid = SessionIdFactory.generate()
        session["chat_session_id"] = sid.value
        return sid
    return SessionId(value=raw)


def get_conversation_id(session_id: SessionId) -> ConversationId:
    cid = chat_service.get_or_create_conversation(
        session_id=session_id,
        conversation_id_str=session.get("conversation_id"),
    )
    session["conversation_id"] = cid.value
    return cid


# ---------------------------------------------------------------------------
# Rutas
# ---------------------------------------------------------------------------

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/history")
def history_page():
    conversations = chat_service.list_conversations(limit=50)
    rows = [
        {
            "id": str(c.id),
            "session_id": str(c.session_id),
            "updated_at": c.updated_at,
            "message_count": len(c.messages),
            "last_message": (c.messages[-1].content[:120] if c.messages else ""),
        }
        for c in conversations
    ]
    return render_template("history.html", conversations=rows)


@app.route("/api/conversations")
def conversations_list():
    conversations = chat_service.list_conversations(limit=100)
    return {
        "items": [
            {
                "id": str(c.id),
                "session_id": str(c.session_id),
                "created_at": c.created_at.isoformat() if c.created_at else None,
                "updated_at": c.updated_at.isoformat() if c.updated_at else None,
                "message_count": len(c.messages),
            }
            for c in conversations
        ]
    }


@app.route("/api/conversations/<conversation_id>")
def conversation_detail(conversation_id: str):
    conversation = chat_service.get_conversation(conversation_id)
    if not conversation:
        return {"error": "Conversation not found"}, 404

    return {
        "id": str(conversation.id),
        "session_id": str(conversation.session_id),
        "created_at": conversation.created_at.isoformat() if conversation.created_at else None,
        "updated_at": conversation.updated_at.isoformat() if conversation.updated_at else None,
        "messages": [
            {
                "role": msg.role.value,
                "content": msg.content,
                "created_at": msg.created_at.isoformat() if msg.created_at else None,
            }
            for msg in conversation.messages
        ],
    }


@app.route("/stream")
def stream_bot_response():
    user_text = request.args.get("msg", "").strip()
    if not user_text:
        return "Mensaje vacío.", 400

    session_id = get_session_id()
    conversation_id = get_conversation_id(session_id)

    chat_service.record_user_message(conversation_id, user_text)
    messages_for_model = chat_service.get_messages_for_model(conversation_id)

    @stream_with_context
    def generate():
        assistant_parts = []
        try:
            stream = openai_client.chat.completions.create(
                model="gpt-3.5-turbo",
                messages=messages_for_model,
                max_tokens=1024,
                temperature=1,
                stream=True,
            )
            for chunk in stream:
                delta = chunk.choices[0].delta.content if chunk.choices else None
                if delta:
                    assistant_parts.append(delta)
                    yield f"data: {json.dumps({'delta': delta}, ensure_ascii=False)}\n\n"
        except Exception:
            yield f"event: error\ndata: {json.dumps({'message': 'No se pudo generar la respuesta.'}, ensure_ascii=False)}\n\n"
            return

        full_answer = "".join(assistant_parts)
        if full_answer:
            chat_service.record_assistant_message(conversation_id, full_answer)

        yield "event: done\ndata: {}\n\n"

    response = Response(generate(), content_type="text/event-stream")
    response.headers["Cache-Control"] = "no-cache"
    response.headers["X-Accel-Buffering"] = "no"
    response.headers["Connection"] = "keep-alive"
    return response


if __name__ == "__main__":
    app.run()
