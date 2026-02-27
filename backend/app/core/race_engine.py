import asyncio
from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.db.database import SessionLocal
from app.db import models
from app.ws.manager import manager
from typing import Optional, Dict

class RaceEngine:
    def __init__(self, lobby_id: str):
        self.lobby_id = lobby_id
        self.task: Optional[asyncio.Task] = None
        self.state_durations = {
            "Lobby": 0,
            "BettingOpen": 60,
            "RaceRunning": 120,
            "Settling": 5,
            "Results": 20
        }

    async def run(self):
        while True:
            with SessionLocal() as db:
                race = db.query(models.Race).filter(models.Race.lobby_id == self.lobby_id).first()
                if not race: break
                
                current_state = race.current_state
                
                # State logic
                if current_state == "BettingOpen":
                    await self._handle_betting(race, db)
                elif current_state == "RaceRunning":
                    await self._handle_race(race, db)
                elif current_state == "Settling":
                    await self._handle_settling(race, db)
                elif current_state == "Results":
                    await self._handle_results(race, db)
                else:
                    await asyncio.sleep(5) # Idle in Lobby
            
    async def _handle_betting(self, race, db):
        # Broadcast time remaining
        elapsed = (datetime.now() - race.state_entered_at.replace(tzinfo=None)).total_seconds()
        remaining = max(0, self.state_durations["BettingOpen"] - elapsed)
        
        await manager.broadcast(self.lobby_id, {
            "event_name": "STATE_SYNC",
            "current_state": "BettingOpen",
            "time_remaining_ms": int(remaining * 1000),
            "state_version": race.state_version
        })
        
        if remaining <= 0:
            self._transition(race, "RaceRunning", db)
        else:
            await asyncio.sleep(1)

    async def _handle_race(self, race, db):
        # Simulating race progress
        await asyncio.sleep(2)
        self._transition(race, "Settling", db)

    async def _handle_settling(self, race, db):
        # Calculate winners and update bets (Placeholder)
        await asyncio.sleep(5)
        self._transition(race, "Results", db)

    async def _handle_results(self, race, db):
        await asyncio.sleep(20)
        self._transition(race, "BettingOpen", db) # Start next loop

    def _transition(self, race, next_state, db):
        race.current_state = next_state
        race.state_entered_at = func.now()
        race.state_version += 1
        db.commit()
        # Broadcast transition
        asyncio.create_task(manager.broadcast(self.lobby_id, {
            "event_name": "RACE_STATE_CHANGED",
            "new_state": next_state,
            "state_version": race.state_version
        }))

# Global dictionary to keep track of engine tasks per lobby
engines: Dict[str, RaceEngine] = {}
