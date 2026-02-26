from pydantic import BaseModel
from typing import Any, Optional
from datetime import datetime

class WSEvent(BaseModel):
    event_name: str
    lobby_id: str
    race_id: Optional[int] = None
    ts: datetime = Field(default_factory=datetime.now)
    state_version: int
    payload: Any

class StateSyncPayload(BaseModel):
    current_state: str
    time_remaining_ms: int

class OddsUpdatePayload(BaseModel):
    selections: dict[str, float]
