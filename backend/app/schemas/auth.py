from pydantic import BaseModel
from typing import Optional

class UserJoin(BaseModel):
    username: str
    lobby_id: Optional[str] = None   # Direct lobby ID (known clients)
    join_code: Optional[str] = None  # QR/manual join code (mobile clients)
    role: Optional[str] = "player"   # "player" or "admin"

class Token(BaseModel):
    access_token: str
    token_type: str

class JoinResponse(BaseModel):
    access_token: str
    token_type: str
    user_id: int
    username: str
    role: str
    lobby_id: str

class TokenData(BaseModel):
    username: Optional[str] = None
    user_id: Optional[int] = None
    role: Optional[str] = "player"
