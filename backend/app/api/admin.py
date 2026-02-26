from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.db import models
from app.core.race_engine import engines, RaceEngine
import asyncio

router = APIRouter(prefix="/admin", tags=["admin"])

@router.post("/race/start/{lobby_id}")
async def start_race_engine(lobby_id: str, db: Session = Depends(get_db)):
    race = db.query(models.Race).filter(models.Race.lobby_id == lobby_id).first()
    if not race:
        raise HTTPException(status_code=404, detail="Race/Lobby not found")
    
    if lobby_id in engines:
        return {"message": "Engine already running"}
    
    # Initialize and start the engine task
    engine = RaceEngine(lobby_id)
    engines[lobby_id] = engine
    asyncio.create_task(engine.run())
    
    # Set state to BettingOpen
    race.current_state = "BettingOpen"
    race.state_version += 1
    db.commit()
    
    return {"message": f"Race engine started for lobby {lobby_id}"}

@router.post("/race/stop/{lobby_id}")
async def stop_race_engine(lobby_id: str):
    if lobby_id in engines:
        # In a real app, we'd cancel the task safely
        del engines[lobby_id]
        return {"message": "Engine stopped"}
    return {"message": "Engine not running"}
