from dataclasses import dataclass
from datetime import datetime
from enum import Enum


class Role(Enum):
    USER = "user"
    ASSISTANT = "assistant"


# ---------------------------------------------------------------------------
# Value Objects — inmutables gracias a frozen=True.
# Dos instancias con los mismos datos son iguales (igualdad por valor, no por
# referencia), lo que los distingue de las entidades.
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class SessionId:
    value: str

    def __str__(self) -> str:
        return self.value


@dataclass(frozen=True)
class ConversationId:
    value: str

    def __str__(self) -> str:
        return self.value


@dataclass(frozen=True)
class Message:
    role: Role
    content: str
    created_at: datetime

    def to_openai_dict(self) -> dict:
        return {"role": self.role.value, "content": self.content}

    def to_document(self) -> dict:
        return {
            "role": self.role.value,
            "content": self.content,
            "created_at": self.created_at,
        }
