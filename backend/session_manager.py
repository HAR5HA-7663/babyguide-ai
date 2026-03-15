"""
Session Manager — handles baby profile storage.
Uses Firestore when available, falls back to in-memory store for local dev.
"""

import logging
import os
import uuid
from datetime import datetime
from typing import Optional

logger = logging.getLogger(__name__)


class SessionManager:
    def __init__(self):
        self._use_firestore = False
        self._db = None
        self._memory_store: dict[str, dict] = {}

        if os.environ.get("USE_FIRESTORE", "").lower() == "true":
            try:
                from google.cloud import firestore
                self._db = firestore.AsyncClient()
                self._use_firestore = True
                logger.info("Using Firestore for session storage")
            except Exception as e:
                logger.warning(f"Firestore unavailable, using in-memory store: {e}")
        else:
            logger.info("Using in-memory session store (set USE_FIRESTORE=true for production)")

    async def create_session(self, baby_profile: dict) -> str:
        session_id = str(uuid.uuid4())
        data = {
            "session_id": session_id,
            "baby_profile": baby_profile,
            "created_at": datetime.utcnow().isoformat(),
            "messages": [],
        }

        if self._use_firestore:
            doc_ref = self._db.collection("sessions").document(session_id)
            await doc_ref.set(data)
        else:
            self._memory_store[session_id] = data

        logger.info(f"Created session: {session_id}")
        return session_id

    async def get_session(self, session_id: str) -> Optional[dict]:
        if self._use_firestore:
            doc_ref = self._db.collection("sessions").document(session_id)
            doc = await doc_ref.get()
            return doc.to_dict() if doc.exists else None
        return self._memory_store.get(session_id)

    async def update_session(self, session_id: str, updates: dict):
        if self._use_firestore:
            doc_ref = self._db.collection("sessions").document(session_id)
            await doc_ref.update(updates)
        elif session_id in self._memory_store:
            self._memory_store[session_id].update(updates)

    async def delete_session(self, session_id: str):
        if self._use_firestore:
            doc_ref = self._db.collection("sessions").document(session_id)
            await doc_ref.delete()
        else:
            self._memory_store.pop(session_id, None)

    async def append_message(self, session_id: str, role: str, text: str):
        msg = {"role": role, "text": text, "timestamp": datetime.utcnow().isoformat()}
        if self._use_firestore:
            from google.cloud.firestore import ArrayUnion
            doc_ref = self._db.collection("sessions").document(session_id)
            await doc_ref.update({"messages": ArrayUnion([msg])})
        elif session_id in self._memory_store:
            self._memory_store[session_id].setdefault("messages", []).append(msg)
