from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.db import models
from app.db.repository import Repository
from app.core.race_engine import engines, RaceEngine
from app.core.race_sim import simulate_race, placements_to_dicts
from app.api.auth import require_admin
from app.settings import settings
import asyncio
import random
import string

router = APIRouter(prefix="/admin", tags=["admin"])


def _generate_join_code(length: int = 6) -> str:
    """Generate a random join code (uppercase letters + digits, excluding ambiguous chars)."""
    chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # No I/O/0/1 for readability
    return "".join(random.choices(chars, k=length))


@router.post("/lobby")
def create_lobby(
    name: str = "Sala Principal",
    max_players: int = 8,
    admin: dict = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Create a new lobby with a join code for QR display."""
    lobby_id = f"LOBBY_{_generate_join_code(4)}"
    join_code = _generate_join_code(6)
    
    # Ensure uniqueness
    while db.query(models.Lobby).filter(models.Lobby.join_code == join_code).first():
        join_code = _generate_join_code(6)
    
    lobby = models.Lobby(
        id=lobby_id,
        join_code=join_code,
        name=name,
        host_user_id=admin["user_id"],
        max_players=max_players,
        status="Waiting",
    )
    db.add(lobby)
    
    # Create initial race for this lobby
    race = models.Race(lobby_id=lobby_id, current_state="Lobby")
    db.add(race)
    db.commit()
    db.refresh(race)
    
    lobby.current_race_id = race.id
    db.commit()
    
    return {
        "lobby_id": lobby_id,
        "join_code": join_code,
        "name": name,
        "max_players": max_players,
        "status": "Waiting",
        "race_id": race.id,
    }


@router.post("/race/start/{lobby_id}")
async def start_race_engine(
    lobby_id: str,
    admin: dict = Depends(require_admin),
    db: Session = Depends(get_db),
):
    race = db.query(models.Race).filter(
        models.Race.lobby_id == lobby_id,
        models.Race.current_state != "Ended",
    ).first()
    if not race:
        raise HTTPException(status_code=404, detail="Race/Lobby not found")
    
    if lobby_id in engines:
        return {"message": "Engine already running", "race_id": race.id}
    
    # Create markets for this race if none exist
    existing_markets = db.query(models.Market).filter(models.Market.race_id == race.id).count()
    if existing_markets == 0:
        Repository.create_markets_for_race(
            db, race.id, race.num_horses or settings.DEFAULT_NUM_HORSES, settings.RAKE_PCT
        )
    
    # Start engine
    engine = RaceEngine(lobby_id)
    engines[lobby_id] = engine
    asyncio.create_task(engine.run())
    
    race.current_state = "BettingOpen"
    race.state_version += 1
    db.commit()
    
    return {"message": f"Race engine started for lobby {lobby_id}", "race_id": race.id}


@router.post("/race/stop/{lobby_id}")
async def stop_race_engine(
    lobby_id: str,
    admin: dict = Depends(require_admin),
):
    if lobby_id in engines:
        del engines[lobby_id]
        return {"message": "Engine stopped"}
    return {"message": "Engine not running"}


@router.post("/race/settle/{race_id}")
def manual_settle(
    race_id: int,
    admin: dict = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Manual settlement override — admin can force settle a race."""
    race = db.query(models.Race).filter(models.Race.id == race_id).first()
    if not race:
        raise HTTPException(status_code=404, detail="Race not found")
    if race.settled_at is not None:
        raise HTTPException(status_code=400, detail="Race already settled")

    # Run sim
    horse_ids = [f"horse_{i}" for i in range(1, (race.num_horses or 6) + 1)]
    seed = race.race_seed or f"manual_{race_id}"
    placements = simulate_race(seed, horse_ids)
    placements_data = placements_to_dicts(placements)

    # Close markets if still open
    Repository.close_markets_for_race(db, race.id)
    db.commit()

    # Settle
    summary = Repository.settle_race(db, race.id, placements_data)
    race.current_state = "Results"
    db.commit()

    return {"settled": True, "race_id": race_id, "placements": placements_data, "summary": summary}


@router.post("/race/next/{lobby_id}")
def next_race(
    lobby_id: str,
    admin: dict = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Admin dashboard: create the next race for a lobby after the previous one ended."""
    lobby = db.query(models.Lobby).filter(models.Lobby.id == lobby_id).first()
    if not lobby:
        raise HTTPException(status_code=404, detail="Lobby not found")

    # Ensure there are no active races
    active_race = db.query(models.Race).filter(
        models.Race.lobby_id == lobby_id,
        models.Race.current_state != "Ended",
    ).first()

    if active_race:
        # If it's in Results, we can move it to Ended
        if active_race.current_state in ["Results", "Settling"]:
            active_race.current_state = "Ended"
            active_race.state_version += 1
            db.commit()
        else:
            raise HTTPException(status_code=400, detail=f"Cannot start next race. Current race is in state {active_race.current_state}")

    # Create new race
    race = models.Race(lobby_id=lobby_id, current_state="Lobby")
    db.add(race)
    db.commit()
    db.refresh(race)

    lobby.current_race_id = race.id
    db.commit()

    # Create markets for the new race automatically
    try:
        Repository.create_markets_for_race(
            db, race.id, race.num_horses or settings.DEFAULT_NUM_HORSES, settings.RAKE_PCT
        )
    except Exception as e:
        # Handle case where markets already exist or config fails, non-fatal for creation
        print(f"Failed to auto-create markets: {e}")

    # Start the engine automatically so it goes to BettingOpen
    if lobby_id in engines:
        del engines[lobby_id] # Clean up old engine just in case
        
    engine = RaceEngine(lobby_id)
    engines[lobby_id] = engine
    asyncio.create_task(engine.run())
    
    race.current_state = "BettingOpen"
    race.state_version += 1
    db.commit()

    return {"message": f"Next race created and started for lobby {lobby_id}", "race_id": race.id}


@router.get("/lobby/{lobby_id}/state")
def get_lobby_state(
    lobby_id: str,
    admin: dict = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Admin dashboard: full lobby state with players, balances, race info."""
    # Get all users in this lobby (who have a token with this lobby_id)
    # For MVP: get all users and their wallets
    race = db.query(models.Race).filter(
        models.Race.lobby_id == lobby_id,
        models.Race.current_state != "Ended",
    ).order_by(models.Race.created_at.desc()).first()

    if not race:
        raise HTTPException(status_code=404, detail="Lobby not found")

    # Get all users with wallets
    users = db.query(models.User).join(models.Wallet).all()
    players = []
    for u in users:
        w = u.wallet
        players.append({
            "user_id": u.id,
            "username": u.username,
            "role": u.role,
            "balance_total": w.balance_total if w else 0,
            "balance_locked": w.balance_locked if w else 0,
            "balance_available": (w.balance_total - w.balance_locked) if w else 0,
        })

    # Time remaining
    from datetime import datetime
    time_remaining_ms = 0
    if race.current_state == "BettingOpen" and race.state_entered_at:
        elapsed = (datetime.now() - race.state_entered_at.replace(tzinfo=None)).total_seconds()
        time_remaining_ms = max(0, int((60 - elapsed) * 1000))

    return {
        "lobby_id": lobby_id,
        "players": players,
        "current_race": {
            "race_id": race.id,
            "state": race.current_state,
            "state_version": race.state_version,
            "time_remaining_ms": time_remaining_ms,
            "race_seed": race.race_seed,
        },
        "engine_running": lobby_id in engines,
    }
