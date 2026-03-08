from datetime import datetime, timezone
from typing import List, Optional

from bson import ObjectId
from pymongo import MongoClient
from pymongo.collection import Collection

from domain.entities import Conversation
from domain.factories import ConversationFactory
from domain.repository import ConversationRepository
from domain.value_objects import ConversationId, Message, Role, SessionId


class MongoConversationRepository(ConversationRepository):

    def __init__(self, uri: str, db_name: str) -> None:
        client = MongoClient(uri)
        self._col: Collection = client[db_name]["conversations"]

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _parse_oid(value: str) -> Optional[ObjectId]:
        try:
            return ObjectId(value)
        except Exception:
            return None

    def _to_entity(self, doc: dict) -> Conversation:
        messages = [
            Message(
                role=Role(msg["role"]),
                content=msg["content"],
                created_at=msg.get("created_at", datetime.now(timezone.utc)),
            )
            for msg in doc.get("messages", [])
        ]
        return Conversation(
            id=ConversationId(value=str(doc["_id"])),
            session_id=SessionId(value=doc.get("session_id", "")),
            messages=messages,
            created_at=doc.get("created_at"),
            updated_at=doc.get("updated_at"),
        )

    # ------------------------------------------------------------------
    # ConversationRepository interface
    # ------------------------------------------------------------------

    def find_by_id(self, conversation_id: ConversationId) -> Optional[Conversation]:
        oid = self._parse_oid(conversation_id.value)
        if not oid:
            return None
        doc = self._col.find_one({"_id": oid})
        return self._to_entity(doc) if doc else None

    def create(self, session_id: SessionId) -> ConversationId:
        conversation = ConversationFactory.create(session_id)
        doc = {
            "session_id": conversation.session_id.value,
            "messages": [],
            "created_at": conversation.created_at,
            "updated_at": conversation.updated_at,
        }
        result = self._col.insert_one(doc)
        return ConversationId(value=str(result.inserted_id))

    def append_message(self, conversation_id: ConversationId, message: Message) -> None:
        oid = self._parse_oid(conversation_id.value)
        if not oid:
            return
        now = datetime.now(timezone.utc)
        self._col.update_one(
            {"_id": oid},
            {
                "$push": {"messages": message.to_document()},
                "$set": {"updated_at": now},
            },
        )

    def find_all(self, limit: int = 50) -> List[Conversation]:
        docs = self._col.find({}).sort("updated_at", -1).limit(limit)
        return [self._to_entity(doc) for doc in docs]
