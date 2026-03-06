from fastapi import APIRouter, Depends, HTTPException, Header, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from jose import jwt, JWTError
from app.settings import settings
from app.db.database import get_db
from app.db import models
from app.schemas import auth as auth_schemas
from typing import Optional

router = APIRouter(tags=["auth"])
security = HTTPBearer()


def _decode_token(token: str) -> dict:
    """Decode and validate a JWT token, returning the payload."""
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.ALGORITHM])
        return payload
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Could not validate credentials")


def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> int:
    """Returns user_id from JWT. Use as dependency for player+admin routes."""
    payload = _decode_token(credentials.credentials)
    user_id: int = payload.get("user_id")
    if user_id is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    return user_id


def get_current_user_with_role(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    """Returns full token payload {user_id, role, lobby_id}. For role checking."""
    payload = _decode_token(credentials.credentials)
    user_id = payload.get("user_id")
    if user_id is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    return {
        "user_id": user_id,
        "role": payload.get("role", "player"),
        "lobby_id": payload.get("lobby_id"),
        "username": payload.get("sub"),
    }


def require_admin(token_data: dict = Depends(get_current_user_with_role)) -> dict:
    """Dependency that requires admin role. Use for admin-only routes."""
    if token_data["role"] != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return token_data


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.JWT_SECRET, algorithm=settings.ALGORITHM)


@router.post("/join", response_model=auth_schemas.JoinResponse)
def join_lobby(user_data: auth_schemas.UserJoin, db: Session = Depends(get_db)):
    """Register / login and join a lobby. Creates user + wallet if needed."""
    if not user_data.username or not user_data.username.strip():
        raise HTTPException(status_code=400, detail="Username required")

    # Resolve lobby_id: client can send join_code (from QR) or direct lobby_id
    # Public join: mobile sends join_code → backend resolves to lobby_id
    # Direct join: used when lobby_id is already known
    lobby_id = user_data.lobby_id
    if user_data.join_code:
        lobby = db.query(models.Lobby).filter(models.Lobby.join_code == user_data.join_code).first()
        if not lobby:
            raise HTTPException(status_code=404, detail=f"Lobby with join code '{user_data.join_code}' not found")
        lobby_id = lobby.id
    elif lobby_id:
        # Check if formal Lobby exists (optional in MVP: fall back to string-based)
        lobby = db.query(models.Lobby).filter(models.Lobby.id == lobby_id).first()
        # If no formal lobby, still works with string-based lobby_id for backward compat

    if not lobby_id:
        raise HTTPException(status_code=400, detail="lobby_id or join_code required")

    user = db.query(models.User).filter(models.User.username == user_data.username).first()
    if not user:
        role = user_data.role if user_data.role in ("player", "admin") else "player"
        user = models.User(username=user_data.username, role=role)
        db.add(user)
        db.commit()
        db.refresh(user)
        
        wallet = models.Wallet(user_id=user.id, balance_total=1000.0, balance_locked=0.0)
        db.add(wallet)
        db.commit()
    else:
        # Ensure returning users have a wallet
        wallet = db.query(models.Wallet).filter(models.Wallet.user_id == user.id).first()
        if not wallet:
            wallet = models.Wallet(user_id=user.id, balance_total=1000.0, balance_locked=0.0)
            db.add(wallet)
            db.commit()
    
    # Find or create lobby race
    race = db.query(models.Race).filter(
        models.Race.lobby_id == lobby_id,
        models.Race.current_state != "Ended",
    ).first()
    if not race:
        race = models.Race(lobby_id=lobby_id, current_state="Lobby")
        db.add(race)
        db.commit()

    access_token = create_access_token(
        data={
            "sub": user.username,
            "user_id": user.id,
            "lobby_id": lobby_id,
            "role": user.role,
        }
    )
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user_id": user.id,
        "username": user.username,
        "role": user.role,
        "lobby_id": lobby_id,
    }


@router.post("/refresh", response_model=auth_schemas.Token)
def refresh_token(token_data: dict = Depends(get_current_user_with_role)):
    """Issue a new JWT with extended expiration. Requires valid existing token."""
    new_token = create_access_token(
        data={
            "sub": token_data["username"],
            "user_id": token_data["user_id"],
            "lobby_id": token_data["lobby_id"],
            "role": token_data["role"],
        }
    )
    return {"access_token": new_token, "token_type": "bearer"}
