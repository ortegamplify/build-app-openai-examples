from typing import List, Optional

from domain.factories import MessageFactory
from domain.repository import ConversationRepository
from domain.value_objects import ConversationId, SessionId


# ---------------------------------------------------------------------------
# Servicio de aplicación — orquesta los casos de uso coordinando el dominio
# y el repositorio. No contiene lógica de negocio propia; eso pertenece al
# dominio. No sabe nada de HTTP ni de MongoDB.
# ---------------------------------------------------------------------------

class ChatService:

    def __init__(self, repository: ConversationRepository) -> None:
        self._repo = repository

    def get_or_create_conversation(
        self,
        session_id: SessionId,
        conversation_id_str: Optional[str],
    ) -> ConversationId:
        if conversation_id_str:
            cid = ConversationId(value=conversation_id_str)
            if self._repo.find_by_id(cid) is not None:
                return cid
        return self._repo.create(session_id)

    def get_messages_for_model(self, conversation_id: ConversationId) -> List[dict]:
        conversation = self._repo.find_by_id(conversation_id)
        if not conversation:
            return []
        return conversation.to_openai_messages()

    def record_user_message(self, conversation_id: ConversationId, content: str) -> None:
        self._repo.append_message(conversation_id, MessageFactory.user(content))

    def record_assistant_message(self, conversation_id: ConversationId, content: str) -> None:
        self._repo.append_message(conversation_id, MessageFactory.assistant(content))

    def list_conversations(self, limit: int = 50) -> list:
        return self._repo.find_all(limit=limit)

    def get_conversation(self, conversation_id_str: str):
        cid = ConversationId(value=conversation_id_str)
        return self._repo.find_by_id(cid)
