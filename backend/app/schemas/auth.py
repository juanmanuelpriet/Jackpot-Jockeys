from pydantic import BaseModel
from typing import Optional

class UserJoin(BaseModel):
    username: str
    lobby_id: str

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    username: Optional[str] = None
    user_id: Optional[int] = None
