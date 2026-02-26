from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional

class BetCreate(BaseModel):
    race_id: int
    market_id: int
    selection_key: str
    amount: float = Field(gt=0, le=500)

class BetResponse(BaseModel):
    id: int
    user_id: int
    market_id: int
    selection_key: str
    amount: float
    status: str
    created_at: datetime

class BetCancelResponse(BaseModel):
    refunded_amount: float
    fee_charged: float
    new_balance: float
