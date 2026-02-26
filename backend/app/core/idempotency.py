from sqlalchemy.orm import Session
from app.db import models
from app.db.repository import Repository
from fastapi import HTTPException, status
import hashlib
import json
from typing import Any

class IdempotencyManager:
    @staticmethod
    def get_request_hash(payload: Any) -> str:
        payload_str = json.dumps(payload, sort_keys=True)
        return hashlib.sha256(payload_str.encode()).hexdigest()

    @staticmethod
    def check_or_reserve(db: Session, user_id: int, key: str, endpoint: str, payload: Any):
        request_hash = IdempotencyManager.get_request_hash(payload)
        
        # Check if key exists
        existing = Repository.get_idempotency_key(db, user_id, key, endpoint)
        if existing:
            if existing.request_hash != request_hash:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Idempotency key reused with different request body"
                )
            return existing.response_json
        
        return None

    @staticmethod
    def save_response(db: Session, user_id: int, key: str, endpoint: str, payload: Any, response_json: Any):
        request_hash = IdempotencyManager.get_request_hash(payload)
        new_key = models.IdempotencyKey(
            user_id=user_id,
            key=key,
            endpoint=endpoint,
            request_hash=request_hash,
            response_json=response_json
        )
        db.add(new_key)
        db.commit()
