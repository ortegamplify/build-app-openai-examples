from abc import ABC, abstractmethod
from typing import List, Optional

from domain.entities import Conversation
from domain.value_objects import ConversationId, Message, SessionId


# ---------------------------------------------------------------------------
# Puerto (interfaz) del repositorio — el dominio declara QUÉ necesita sin
# saber CÓMO está implementado. La infraestructura provee el adaptador.
# ---------------------------------------------------------------------------

class ConversationRepository(ABC):

    @abstractmethod
    def find_by_id(self, conversation_id: ConversationId) -> Optional[Conversation]:
        ...

    @abstractmethod
    def create(self, session_id: SessionId) -> ConversationId:
        ...

    @abstractmethod
    def append_message(self, conversation_id: ConversationId, message: Message) -> None:
        ...

    @abstractmethod
    def find_all(self, limit: int = 50) -> List[Conversation]:
        ...
