from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query, Depends
from app.ws.manager import manager
from jose import jwt
from app.settings import settings
from app.db.database import SessionLocal
from app.db import models

router = APIRouter()

@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, token: str = Query(...)):
    try:
        # 1. Validate Token (Simple version for MVP)
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.ALGORITHM])
        user_id = payload.get("user_id")
        lobby_id = payload.get("lobby_id")
        
        if not lobby_id:
            await websocket.close(code=1008)
            return

        await manager.connect(lobby_id, websocket)
        
        # 2. Listen for commands
        try:
            while True:
                data = await websocket.receive_json()
                if data.get("type") == "GET_STATE_SNAPSHOT":
                    # Hydrate client with current state
                    with SessionLocal() as db:
                        race = db.query(models.Race).filter(models.Race.lobby_id == lobby_id).first()
                        if race:
                            await websocket.send_json({
                                "event_name": "STATE_SNAPSHOT",
                                "race_id": race.id,
                                "current_state": race.current_state,
                                "state_version": race.state_version
                                # Add more hydration data here
                            })
        except WebSocketDisconnect:
            manager.disconnect(lobby_id, websocket)
            
    except Exception as e:
        await websocket.close(code=1008)
