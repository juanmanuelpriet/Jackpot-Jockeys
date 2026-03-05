from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session
from datetime import datetime
from app.db.database import get_db
from app.db.repository import Repository
from app.core.idempotency import IdempotencyManager
from app.schemas import powers as power_schemas
from app.settings import settings
from app.db import models
from app.api.auth import get_current_user, get_current_user_with_role
from app.ws.manager import broadcast_power_telegraph, broadcast_power_applied, send_balance_update
from typing import List

router = APIRouter(prefix="/powers", tags=["powers"])

# In-memory catalog for MVP (matching the JSON spec)
POWERS_CATALOG = [
    {"id": "pwr_boost_01", "nombre": "Inyección Adrenalina", "tipo": "buff", "tamano": "pequeño", "costo_usd": 20.0, "objetivo": "otro", "duracion_s": 4.0, "cooldown_s": 5, "telegraph_ms": 200},
    {"id": "pwr_oil_01", "nombre": "Mancha de Aceite", "tipo": "debuff", "tamano": "pequeño", "costo_usd": 30.0, "objetivo": "otro", "duracion_s": 3.0, "cooldown_s": 8, "telegraph_ms": 500},
    {"id": "pwr_stero_turbo", "nombre": "Esteroides Turbo", "tipo": "buff", "tamano": "grande", "costo_usd": 180.0, "objetivo": "otro", "duracion_s": 5.0, "cooldown_s": 20, "telegraph_ms": 800},
]


def _get_current_race_id(db: Session, user_id: int) -> int:
    """Get the current active race ID for the user's lobby.
    For MVP, find the latest race that isn't ended."""
    race = db.query(models.Race).filter(
        models.Race.current_state.in_(["BettingOpen", "RaceRunning", "Settling"]),
    ).order_by(models.Race.created_at.desc()).first()
    if not race:
        raise HTTPException(status_code=400, detail="No active race found")
    return race.id


@router.get("", response_model=List[power_schemas.PowerCatalogItem])
def get_powers_catalog():
    return POWERS_CATALOG


@router.post("/cast", response_model=power_schemas.PowerCastResponse)
async def cast_power(
    request: power_schemas.PowerCastRequest,
    user_id: int = Depends(get_current_user),
    token_data: dict = Depends(get_current_user_with_role),
    x_idempotency_key: str = Header(...),
    db: Session = Depends(get_db),
):
    # 1. Idempotency Check
    cached = IdempotencyManager.check_or_reserve(db, user_id, x_idempotency_key, "/powers/cast", request.model_dump())
    if cached:
        return cached

    # 2. Find Power in Catalog
    power = next((p for p in POWERS_CATALOG if p["id"] == request.power_id), None)
    if not power:
        raise HTTPException(status_code=404, detail="Power not found")

    # 3. Get current race
    current_race_id = _get_current_race_id(db, user_id)

    # 4. Calculate Scaled Cost (race-scoped cast count)
    cast_count = Repository.get_power_cast_count_in_race(db, user_id, current_race_id)
    scaled_cost = power["costo_usd"] * (settings.POWER_COST_SCALING ** cast_count)

    # 5. ENFORCE: MAX_POWER_SPEND_PER_RACE cap
    total_spent = Repository.get_power_spend_in_race(db, user_id, current_race_id)
    if total_spent + scaled_cost > settings.MAX_POWER_SPEND_PER_RACE:
        remaining = max(0, settings.MAX_POWER_SPEND_PER_RACE - total_spent)
        raise HTTPException(
            status_code=400,
            detail=f"Excede cap de ${settings.MAX_POWER_SPEND_PER_RACE}/carrera. Gastado: ${total_spent:.2f}, Costo: ${scaled_cost:.2f}, Disponible: ${remaining:.2f}"
        )

    # 6. ENFORCE: Cooldown
    last_cast = Repository.get_last_power_cast(db, user_id, current_race_id, request.power_id)
    if last_cast:
        elapsed = (datetime.utcnow() - last_cast.created_at.replace(tzinfo=None)).total_seconds()
        cooldown = power["cooldown_s"]
        if elapsed < cooldown:
            remaining_cd = cooldown - elapsed
            raise HTTPException(
                status_code=400,
                detail=f"Cooldown activo: espera {remaining_cd:.1f}s para usar {power['nombre']}"
            )

    # 7. ENFORCE: Anti-focus (debuffs only)
    if power["tipo"] == "debuff":
        debuff_count = Repository.count_debuffs_on_target(db, user_id, current_race_id, request.target_id)
        if debuff_count >= settings.MAX_DEBUFFS_PER_TARGET_PER_USER:
            raise HTTPException(
                status_code=400,
                detail=f"Anti-focus: máximo {settings.MAX_DEBUFFS_PER_TARGET_PER_USER} debuffs por target por carrera"
            )

    # 8. Calculate effective duration (pity shield check)
    effective_duration = power["duracion_s"]
    pity_active = False
    if power["tipo"] == "debuff":
        total_debuffs = Repository.count_total_debuffs_on_target(db, current_race_id, request.target_id)
        if total_debuffs >= settings.PITY_SHIELD_THRESHOLD:
            effective_duration *= settings.PITY_SHIELD_REDUCTION
            pity_active = True

    # 9. Transactional Cast
    try:
        event = Repository.apply_power_cast(
            db, user_id, current_race_id, request.power_id, request.target_id,
            scaled_cost, x_idempotency_key, effective_duration,
        )
        db.commit()
        
        response = {
            "status": "applied",
            "power_id": request.power_id,
            "target_id": request.target_id,
            "deducted_amount": scaled_cost,
            "telegraph_ms": power["telegraph_ms"],
            "effective_duration_s": effective_duration,
            "pity_shield_active": pity_active,
        }
        
        IdempotencyManager.save_response(db, user_id, x_idempotency_key, "/powers/cast", request.model_dump(mode='json'), response)
        
        # 10. WS Broadcasts
        lobby_id = token_data.get("lobby_id")
        if lobby_id:
            await broadcast_power_telegraph(lobby_id, user_id, request.power_id, request.target_id, power["telegraph_ms"])
            await broadcast_power_applied(lobby_id, request.power_id, request.target_id, effective_duration, pity_active)
            wallet = db.query(models.Wallet).filter(models.Wallet.user_id == user_id).first()
            if wallet:
                await send_balance_update(lobby_id, user_id, wallet.balance_total, wallet.balance_locked)
        
        return response
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
