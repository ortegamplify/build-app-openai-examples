from dataclasses import dataclass, field
from datetime import datetime
from typing import List

from domain.value_objects import ConversationId, Message, SessionId


# ---------------------------------------------------------------------------
# Entidad — tiene identidad propia (ConversationId).
# A diferencia de un value object, dos conversaciones con el mismo contenido
# NO son iguales si tienen distinto id.
# ---------------------------------------------------------------------------

@dataclass
class Conversation:
    id: ConversationId
    session_id: SessionId
    messages: List[Message]
    created_at: datetime
    updated_at: datetime

    def to_openai_messages(self) -> List[dict]:
        return [msg.to_openai_dict() for msg in self.messages]
