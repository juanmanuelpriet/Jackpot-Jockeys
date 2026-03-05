"""
Race Engine — Async state machine that drives race lifecycle.

Orchestrates: Lobby → BettingOpen → RaceRunning → Settling → Results → (next race)
Integrates: market creation, market closure, race sim, and settlement.
"""
import asyncio
import uuid
from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.db.database import SessionLocal
from app.db import models
from app.db.repository import Repository
from app.core.race_sim import simulate_race, placements_to_dicts, DEFAULT_HORSES
from app.ws.manager import manager
from app.settings import settings
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
            "Results": 20,
        }

    async def run(self):
        while True:
            with SessionLocal() as db:
                race = db.query(models.Race).filter(
                    models.Race.lobby_id == self.lobby_id
                ).first()
                if not race:
                    break

                current_state = race.current_state

                if current_state == "BettingOpen":
                    await self._handle_betting(race, db)
                elif current_state == "RaceRunning":
                    await self._handle_race(race, db)
                elif current_state == "Settling":
                    await self._handle_settling(race, db)
                elif current_state == "Results":
                    await self._handle_results(race, db)
                else:
                    await asyncio.sleep(5)  # Idle in Lobby

    async def _handle_betting(self, race, db):
        """Broadcast time remaining. Auto-transition when time runs out."""
        elapsed = (datetime.now() - race.state_entered_at.replace(tzinfo=None)).total_seconds()
        remaining = max(0, self.state_durations["BettingOpen"] - elapsed)

        await manager.broadcast(self.lobby_id, {
            "event_name": "STATE_SYNC",
            "current_state": "BettingOpen",
            "time_remaining_ms": int(remaining * 1000),
            "state_version": race.state_version,
        })

        if remaining <= 0:
            # Close all markets before transitioning
            Repository.close_markets_for_race(db, race.id)
            db.commit()
            self._transition(race, "RaceRunning", db)
        else:
            await asyncio.sleep(1)

    async def _handle_race(self, race, db):
        """Generate race seed if not set, then transition to Settling."""
        if not race.race_seed:
            race.race_seed = uuid.uuid4().hex[:16]
            db.commit()

        # Broadcast race is running
        await manager.broadcast(self.lobby_id, {
            "event_name": "STATE_SYNC",
            "current_state": "RaceRunning",
            "race_seed": race.race_seed,
            "state_version": race.state_version,
        })

        # Simulate race duration (stub: instant, but we wait a bit for effect)
        await asyncio.sleep(2)
        self._transition(race, "Settling", db)

    async def _handle_settling(self, race, db):
        """
        Run race sim, settle all markets, broadcast results.
        This is the core money-moving operation.
        """
        # 1. Run the deterministic sim
        horse_ids = [f"horse_{i}" for i in range(1, (race.num_horses or 6) + 1)]
        seed = race.race_seed or uuid.uuid4().hex[:16]
        placements = simulate_race(seed, horse_ids)
        placements_data = placements_to_dicts(placements)

        # 2. Settle all markets (atomic)
        try:
            settlement_summary = Repository.settle_race(db, race.id, placements_data)
            db.commit()
        except Exception as e:
            db.rollback()
            print(f"ERROR in settlement for race {race.id}: {e}")
            settlement_summary = {}

        # 3. Broadcast settlement result
        await manager.broadcast(self.lobby_id, {
            "event_name": "SETTLEMENT_COMPLETE",
            "race_id": race.id,
            "placements": placements_data,
            "payouts": settlement_summary,
            "state_version": race.state_version,
        })

        self._transition(race, "Results", db)

    async def _handle_results(self, race, db):
        """Show results, then start a new race cycle."""
        await asyncio.sleep(20)

        # Create a NEW race for the next cycle (same lobby)
        new_race = models.Race(
            lobby_id=self.lobby_id,
            current_state="BettingOpen",
            num_horses=race.num_horses or settings.DEFAULT_NUM_HORSES,
        )
        db.add(new_race)
        db.commit()
        db.refresh(new_race)

        # Create markets for the new race
        Repository.create_markets_for_race(
            db, new_race.id, new_race.num_horses, settings.RAKE_PCT
        )
        db.commit()

        # Mark old race as ended
        race.ended_at = func.now()
        race.current_state = "Ended"
        db.commit()

        # Broadcast new race
        await manager.broadcast(self.lobby_id, {
            "event_name": "RACE_STATE_CHANGED",
            "new_state": "BettingOpen",
            "race_id": new_race.id,
            "state_version": new_race.state_version,
        })

    def _transition(self, race, next_state, db):
        race.current_state = next_state
        race.state_entered_at = func.now()
        race.state_version += 1
        db.commit()
        # Broadcast transition
        asyncio.create_task(manager.broadcast(self.lobby_id, {
            "event_name": "RACE_STATE_CHANGED",
            "new_state": next_state,
            "state_version": race.state_version,
        }))


# Global dictionary to keep track of engine tasks per lobby
engines: Dict[str, RaceEngine] = {}
