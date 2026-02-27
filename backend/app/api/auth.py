from fastapi import APIRouter, Depends, HTTPException, Header, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from jose import jwt
from app.settings import settings
from app.db.database import get_db
from app.db import models
from app.schemas import auth as auth_schemas
from typing import Optional

router = APIRouter(tags=["auth"])
security = HTTPBearer()

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.ALGORITHM])
        user_id: int = payload.get("user_id")
        if user_id is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
        return user_id
    except jwt.JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Could not validate credentials")

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.JWT_SECRET, algorithm=settings.ALGORITHM)
    return encoded_jwt

@router.post("/join", response_model=auth_schemas.Token)
def join_lobby(user_data: auth_schemas.UserJoin, db: Session = Depends(get_db)):
    # Simple logic for MVP: Create user and wallet if not exists
    user = db.query(models.User).filter(models.User.username == user_data.username).first()
    if not user:
        user = models.User(username=user_data.username)
        db.add(user)
        db.commit()
        db.refresh(user)
        
        # Create initial wallet
        wallet = models.Wallet(user_id=user.id, balance_total=1000.0, balance_locked=0.0)
        db.add(wallet)
        db.commit()
    
    # Check if lobby/race exists (or create a default one for MVP)
    race = db.query(models.Race).filter(models.Race.lobby_id == user_data.lobby_id).first()
    if not race:
        race = models.Race(lobby_id=user_data.lobby_id, current_state="Lobby")
        db.add(race)
        db.commit()

    access_token = create_access_token(
        data={"sub": user.username, "user_id": user.id, "lobby_id": user_data.lobby_id}
    )
    return {"access_token": access_token, "token_type": "bearer"}
