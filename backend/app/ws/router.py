"""
WebSocket Router — handles connections, auth, snapshot hydration, and message routing.
"""
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from jose import jwt, JWTError
from sqlalchemy.orm import Session
from app.db.database import SessionLocal
from app.db import models
from app.settings import settings
from app.ws.manager import manager
from datetime import datetime
import json

router = APIRouter()


def _get_snapshot(db: Session, lobby_id: str, user_id: int) -> dict:
    """Build full state snapshot for client hydration."""
    race = db.query(models.Race).filter(
        models.Race.lobby_id == lobby_id,
        models.Race.current_state != "Ended",
    ).order_by(models.Race.created_at.desc()).first()

    if not race:
        return {"event_name": "STATE_SNAPSHOT", "error": "No active race"}

    # Time remaining
    time_remaining_ms = 0
    if race.current_state == "BettingOpen" and race.state_entered_at:
        elapsed = (datetime.now() - race.state_entered_at.replace(tzinfo=None)).total_seconds()
        time_remaining_ms = max(0, int((60 - elapsed) * 1000))

    # Markets + pools + odds
    markets_data = []
    markets = db.query(models.Market).filter(models.Market.race_id == race.id).all()
    for m in markets:
        selections = db.query(models.MarketSelection).filter(
            models.MarketSelection.market_id == m.id,
        ).all()

        total_pool = sum(s.pool_amount for s in selections)
        odds = {}
        for s in selections:
            if total_pool > 0 and s.pool_amount > 0:
                net_pool = total_pool * (1 - m.rake_pct)
                odds[s.selection_key] = round(net_pool / s.pool_amount, 2)
            else:
                odds[s.selection_key] = 0

        markets_data.append({
            "id": m.id,
            "type": m.type,
            "status": m.status,
            "selections": [{"key": s.selection_key, "pool": s.pool_amount} for s in selections],
            "odds": odds,
        })

    # Wallet
    wallet = db.query(models.Wallet).filter(models.Wallet.user_id == user_id).first()
    wallet_data = {
        "balance_total": wallet.balance_total if wallet else 0,
        "balance_locked": wallet.balance_locked if wallet else 0,
        "balance_available": round((wallet.balance_total - wallet.balance_locked), 2) if wallet else 0,
    }

    # User's active bets
    active_bets = db.query(models.Bet).filter(
        models.Bet.user_id == user_id,
        models.Bet.market_id.in_([m.id for m in markets]),
    ).all()
    my_bets = [
        {"id": b.id, "market_id": b.market_id, "selection": b.selection_key, "amount": b.amount, "status": b.status}
        for b in active_bets
    ]

    # Placements (if in Results state)
    placements = None
    if race.current_state in ("Results", "Settling"):
        results = db.query(models.RaceResult).filter(
            models.RaceResult.race_id == race.id,
        ).order_by(models.RaceResult.position).all()
        if results:
            placements = [
                {"horse_id": r.horse_id, "position": r.position, "finish_time_ms": r.finish_time_ms}
                for r in results
            ]

    return {
        "event_name": "STATE_SNAPSHOT",
        "lobby_id": race.lobby_id,
        "race_id": race.id,
        "current_state": race.current_state,
        "state_version": race.state_version,
        "time_remaining_ms": time_remaining_ms,
        "num_horses": race.num_horses or 6,
        "markets": markets_data,
        "wallet": wallet_data,
        "my_bets": my_bets,
        "placements": placements,
    }


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    # Extract token from query params
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=4001, reason="Missing token")
        return

    # Validate JWT
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.ALGORITHM])
        user_id = payload.get("user_id")
        lobby_id = payload.get("lobby_id")
        username = payload.get("sub", f"User {user_id}")
        role = payload.get("role", "player")

        if not user_id or not lobby_id:
            print(f"WS manual close -> Missing user_id ({user_id}) or lobby_id ({lobby_id}) in token payload")
            await websocket.close(code=4002, reason="Invalid token payload")
            return
    except JWTError as e:
        print(f"WS manual close -> JWTError: {e}")
        await websocket.close(code=4003, reason="Invalid token")
        return

    # Connect
    await manager.connect(lobby_id, user_id, websocket)

    # Broadcast join if player
    if role == "player":
        await manager.broadcast(lobby_id, {
            "event_name": "PLAYER_JOINED",
            "user_id": user_id,
            "username": username
        })

    try:
        while True:
            data = await websocket.receive_text()
            try:
                message = json.loads(data)
            except json.JSONDecodeError:
                await websocket.send_text(json.dumps({"error": "Invalid JSON"}))
                continue

            msg_type = message.get("type")

            if msg_type == "GET_STATE_SNAPSHOT":
                db = SessionLocal()
                try:
                    snapshot = _get_snapshot(db, lobby_id, user_id)
                    await websocket.send_text(json.dumps(snapshot, default=str))
                finally:
                    db.close()
            elif msg_type == "PING":
                await websocket.send_text(json.dumps({"event_name": "PONG"}))
            else:
                await websocket.send_text(json.dumps({
                    "event_name": "ERROR",
                    "detail": f"Unknown message type: {msg_type}",
                }))

    except WebSocketDisconnect:
        manager.disconnect(lobby_id, websocket)
        if role == "player":
            await manager.broadcast(lobby_id, {
                "event_name": "PLAYER_LEFT",
                "user_id": user_id,
                "username": username
            })
    except Exception as e:
        print(f"WS error in lobby {lobby_id} user {user_id}: {e}")
        import traceback
        traceback.print_exc()
        manager.disconnect(lobby_id, websocket)
        if role == "player":
            await manager.broadcast(lobby_id, {
                "event_name": "PLAYER_LEFT",
                "user_id": user_id,
                "username": username
            })
