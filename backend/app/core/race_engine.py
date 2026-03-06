"""
Race Engine — Async state machine that drives race lifecycle.

Orchestrates: Lobby → BettingOpen → RaceRunning → Settling → Results → (next race)
Integrates tick-based simulation, lap/checkpoint markets, and mini-settlement.
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
from app.core.world import generate_world, WorldConfig
from app.core.simulation import RaceSimulation
from app.ws.manager import manager
from app.settings import settings
from typing import Optional, Dict, List


class RaceEngine:
    def __init__(self, lobby_id: str):
        self.lobby_id = lobby_id
        self.task: Optional[asyncio.Task] = None
        self.simulation: Optional[RaceSimulation] = None
        self.powers_queue: asyncio.Queue = asyncio.Queue()
        self.world: Optional[WorldConfig] = None
        self._lap_markets: Dict[str, int] = {}  # "LapWinner_1" → market_id
        self._closed_markets: set = set()        # market IDs already closed
        self._settled_markets: set = set()       # market IDs already settled
        self.state_durations = {
            "Lobby": 0,
            "BettingOpen": 60,
            "RaceRunning": 0,
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
            # Close standard markets (Win/Place/Show) before transitioning
            Repository.close_markets_for_race(db, race.id)
            # Note: Lap/checkpoint markets stay open during the race
            # They close based on closure zones
            db.commit()
            self._transition(race, "RaceRunning", db)
        else:
            await asyncio.sleep(1)

    async def _handle_race(self, race, db):
        """Start real tick-based simulation with lap markets and monitor closure zones."""
        if not race.race_seed:
            race.race_seed = uuid.uuid4().hex[:16]
            db.commit()

        if not self.simulation:
            # Generate world and start simulation
            self.world = generate_world(race.race_seed, race.num_horses or 6)

            # Store world config hash
            race.race_seed = self.world.seed
            race.world_config_hash = self.world.config_hash
            db.commit()

            # Create lap/checkpoint markets (they open at race start)
            checkpoint_idxs = [
                s.id for s in self.world.segments if s.is_checkpoint
            ]
            lap_markets = Repository.create_lap_markets(
                db, race.id, self.world.num_horses,
                self.world.laps, checkpoint_idxs, settings.RAKE_PCT
            )
            db.commit()

            # Index lap markets for closure zone tracking
            for m in lap_markets:
                self._lap_markets[m.type] = m.id

            self.simulation = RaceSimulation(
                world=self.world,
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
                "lap_markets": list(self._lap_markets.keys()),
                "state_version": race.state_version,
            })

        # Check closure zones & mini-settlement
        if self.simulation and self.world and not self.simulation.is_finished():
            await self._check_closure_zones(race, db)

        if self.simulation and self.simulation.is_finished():
            # Save replay log
            try:
                race.replay_log = self.simulation.get_replay_log()
                db.commit()
            except Exception as e:
                print(f"Warning: Could not save replay log: {e}")

            self._transition(race, "Settling", db)
        else:
            await asyncio.sleep(0.1)

    async def _check_closure_zones(self, race, db):
        """Check if any lap/checkpoint markets should close and mini-settle."""
        if not self.simulation or not self.world:
            return

        horses = self.simulation.horses
        if not horses:
            return

        leader = max(horses, key=lambda h: h.pos_mm)
        leader_pos = leader.pos_mm
        track_len = self.world.track_length_mm

        for market_type, market_id in list(self._lap_markets.items()):
            if market_id in self._closed_markets:
                continue

            if market_type.startswith("LapWinner_"):
                lap_num = int(market_type.split("_")[1])
                # Close at 90% of lap completion
                close_at_mm = track_len * lap_num * 900 // 1000
                if leader_pos >= close_at_mm:
                    Repository.close_market_by_id(db, market_id)
                    self._closed_markets.add(market_id)
                    db.commit()
                    await manager.broadcast(self.lobby_id, {
                        "event_name": "MARKET_CLOSED",
                        "market_type": market_type,
                        "market_id": market_id,
                    })

            elif market_type.startswith("CheckpointLeader_"):
                cp_idx = int(market_type.split("_")[1])
                cp_mm = self.world.segment_start_mm[cp_idx]
                # Close when leader is 10% before checkpoint
                close_at_mm = cp_mm - (cp_mm * 100 // 1000) if cp_mm > 0 else 0
                lap_pos = leader_pos % track_len
                if lap_pos >= close_at_mm and close_at_mm > 0:
                    Repository.close_market_by_id(db, market_id)
                    self._closed_markets.add(market_id)
                    db.commit()
                    await manager.broadcast(self.lobby_id, {
                        "event_name": "MARKET_CLOSED",
                        "market_type": market_type,
                        "market_id": market_id,
                    })

        # Check for lap/checkpoint completion → mini-settlement
        for event in self.simulation.events:
            if event.event_name != "LAP_CHECKPOINT_EVENT":
                continue
            if event.tick > self.simulation.tick - 5:  # only recent events
                horse_id = event.data.get("horse_id", "")
                is_lap = event.data.get("is_lap_complete", False)

                if is_lap:
                    lap = event.data.get("lap", 0)
                    mtype = f"LapWinner_{lap}"
                else:
                    cp_idx = event.data.get("checkpoint_segment_idx", 0)
                    mtype = f"CheckpointLeader_{cp_idx}"

                market_id = self._lap_markets.get(mtype)
                if market_id and market_id not in self._settled_markets:
                    # Mini-settle: the first horse to reach is the winner
                    try:
                        summary = Repository.mini_settle_market(db, market_id, horse_id)
                        if summary:
                            self._settled_markets.add(market_id)
                            db.commit()
                            await manager.broadcast(self.lobby_id, {
                                "event_name": "MINI_SETTLEMENT_COMPLETE",
                                "market_type": mtype,
                                "winner": horse_id,
                                "payouts": summary.get("payouts", []),
                                "state_version": race.state_version,
                            })
                    except Exception as e:
                        db.rollback()
                        print(f"Mini-settlement error for {mtype}: {e}")

    async def _handle_settling(self, race, db):
        """Use simulation placements for final settlement."""
        if self.simulation:
            placements = self.simulation.get_placements()
            # Convert to dict, map finish_tick → finish_time_ms for compat
            placements_data = []
            for p in placements:
                d = asdict(p)
                d["finish_time_ms"] = d.pop("finish_tick", 0) * 50  # 50ms per tick
                placements_data.append(d)
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
        self.world = None
        self.powers_queue = asyncio.Queue()
        self._lap_markets = {}
        self._closed_markets = set()
        self._settled_markets = set()

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
