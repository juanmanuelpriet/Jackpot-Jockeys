"""
Race Engine — Async state machine that drives race lifecycle.

Orchestrates: Lobby → BettingOpen → RaceRunning → Settling → Results → (next race)
Now integrates real tick-based simulation via RaceSimulation.
"""
import asyncio
import uuid
from datetime import datetime
from dataclasses import asdict
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.db.database import SessionLocal
from app.db import models
from app.db.repository import Repository
from app.core.world import generate_world
from app.core.simulation import RaceSimulation
from app.ws.manager import manager
from app.settings import settings
from typing import Optional, Dict


class RaceEngine:
    def __init__(self, lobby_id: str):
        self.lobby_id = lobby_id
        self.task: Optional[asyncio.Task] = None
        self.simulation: Optional[RaceSimulation] = None
        self.powers_queue: asyncio.Queue = asyncio.Queue()
        self.state_durations = {
            "Lobby": 0,
            "BettingOpen": 60,
            "RaceRunning": 0,  # driven by simulation now
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
                    await asyncio.sleep(5)

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
        """Start real tick-based simulation and wait for it to finish."""
        if not race.race_seed:
            race.race_seed = uuid.uuid4().hex[:16]
            db.commit()

        if not self.simulation:
            # Generate world and start simulation
            world = generate_world(race.race_seed, race.num_horses or 6)

            # Store world config hash
            race.race_seed = world.seed  # may have been re-seeded by sanity checks
            db.commit()

            self.simulation = RaceSimulation(
                world=world,
                lobby_id=self.lobby_id,
                powers_queue=self.powers_queue,
                broadcast_fn=manager.broadcast,
            )

            # Run simulation as background task
            asyncio.create_task(self.simulation.run())

            # Broadcast that we're running
            await manager.broadcast(self.lobby_id, {
                "event_name": "STATE_SYNC",
                "current_state": "RaceRunning",
                "race_seed": race.race_seed,
                "state_version": race.state_version,
            })

        if self.simulation.is_finished():
            # Save replay log
            try:
                race.replay_log = self.simulation.get_replay_log()
                db.commit()
            except Exception as e:
                print(f"Warning: Could not save replay log: {e}")

            self._transition(race, "Settling", db)
        else:
            await asyncio.sleep(0.1)

    async def _handle_settling(self, race, db):
        """Use simulation placements for settlement."""
        if self.simulation:
            placements = self.simulation.get_placements()
            placements_data = [asdict(p) for p in placements]
        else:
            # Fallback to old stub if simulation wasn't run
            from app.core.race_sim import simulate_race, placements_to_dicts
            horse_ids = [f"horse_{i}" for i in range(1, (race.num_horses or 6) + 1)]
            seed = race.race_seed or uuid.uuid4().hex[:16]
            old_placements = simulate_race(seed, horse_ids)
            placements_data = placements_to_dicts(old_placements)

        try:
            settlement_summary = Repository.settle_race(db, race.id, placements_data)
            db.commit()
        except Exception as e:
            db.rollback()
            print(f"ERROR in settlement for race {race.id}: {e}")
            settlement_summary = {}

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

        new_race = models.Race(
            lobby_id=self.lobby_id,
            current_state="BettingOpen",
            num_horses=race.num_horses or settings.DEFAULT_NUM_HORSES,
        )
        db.add(new_race)
        db.commit()
        db.refresh(new_race)

        Repository.create_markets_for_race(
            db, new_race.id, new_race.num_horses, settings.RAKE_PCT
        )
        db.commit()

        race.ended_at = func.now()
        race.current_state = "Ended"
        db.commit()

        # Reset simulation for next race
        self.simulation = None
        self.powers_queue = asyncio.Queue()

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
        asyncio.create_task(manager.broadcast(self.lobby_id, {
            "event_name": "RACE_STATE_CHANGED",
            "new_state": next_state,
            "state_version": race.state_version,
        }))


# Global dictionary to keep track of engine tasks per lobby
engines: Dict[str, RaceEngine] = {}
