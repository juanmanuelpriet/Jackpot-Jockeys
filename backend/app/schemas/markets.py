from pydantic import BaseModel
from typing import List, Dict

class SelectionSchema(BaseModel):
    selection_key: str
    pool_amount: float

class MarketResponse(BaseModel):
    id: int
    type: str
    status: str
    selections: List[SelectionSchema]
    odds: Dict[str, float] = {}

class RaceMarketsResponse(BaseModel):
    race_id: int
    markets: List[MarketResponse]
