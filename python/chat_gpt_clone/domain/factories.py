from datetime import datetime, timezone
from uuid import uuid4

from domain.entities import Conversation
from domain.value_objects import ConversationId, Message, Role, SessionId


# ---------------------------------------------------------------------------
# Factories — centralizan la lógica de construcción de objetos de dominio.
# Garantizan que los objetos siempre se crean en un estado válido y evitan
# que esa lógica quede dispersa por la aplicación.
# ---------------------------------------------------------------------------

class SessionIdFactory:
    @staticmethod
    def generate() -> SessionId:
        return SessionId(value=str(uuid4()))


class MessageFactory:
    @staticmethod
    def create(role: Role, content: str) -> Message:
        return Message(
            role=role,
            content=content,
            created_at=datetime.now(timezone.utc),
        )

    @classmethod
    def user(cls, content: str) -> Message:
        return cls.create(Role.USER, content)

    @classmethod
    def assistant(cls, content: str) -> Message:
        return cls.create(Role.ASSISTANT, content)


class ConversationFactory:
    @staticmethod
    def create(session_id: SessionId) -> Conversation:
        now = datetime.now(timezone.utc)
        return Conversation(
            id=ConversationId(value=""),  # el repositorio asigna el id real al persistir
            session_id=session_id,
            messages=[],
            created_at=now,
            updated_at=now,
        )
