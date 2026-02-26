from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.db.repository import Repository
from app.core.idempotency import IdempotencyManager
from app.schemas import powers as power_schemas
from app.settings import settings
from app.db import models
from typing import List

router = APIRouter(prefix="/powers", tags=["powers"])

# In-memory catalog for MVP (matching the JSON spec)
POWERS_CATALOG = [
    {"id": "pwr_boost_01", "nombre": "Inyección Adrenalina", "tipo": "buff", "tamano": "pequeño", "costo_usd": 20.0, "objetivo": "otro", "duracion_s": 4.0, "cooldown_s": 5, "telegraph_ms": 200},
    {"id": "pwr_oil_01", "nombre": "Mancha de Aceite", "tipo": "debuff", "tamano": "pequeño", "costo_usd": 30.0, "objetivo": "otro", "duracion_s": 3.0, "cooldown_s": 8, "telegraph_ms": 500},
    {"id": "pwr_stero_turbo", "nombre": "Esteroides Turbo", "tipo": "buff", "tamano": "grande", "costo_usd": 180.0, "objetivo": "otro", "duracion_s": 5.0, "cooldown_s": 20, "telegraph_ms": 800},
]

@router.get("", response_model=List[power_schemas.PowerCatalogItem])
def get_powers_catalog():
    return POWERS_CATALOG

@router.post("/cast", response_model=power_schemas.PowerCastResponse)
def cast_power(
    request: power_schemas.PowerCastRequest,
    user_id: int,
    x_idempotency_key: str = Header(...),
    db: Session = Depends(get_db)
):
    # 1. Idempotency Check
    cached = IdempotencyManager.check_or_reserve(db, user_id, x_idempotency_key, "/powers/cast", request.model_dump())
    if cached: return cached

    # 2. Find Power in Catalog
    power = next((p for p in POWERS_CATALOG if p["id"] == request.power_id), None)
    if not power: raise HTTPException(status_code=404, detail="Power not found")

    # 3. Calculate Scaled Cost
    # Count previous power casts in this race for this user
    cast_count = db.query(models.AuditLog).filter(
        models.AuditLog.user_id == user_id,
        models.AuditLog.action == "POWER_CAST"
        # For MVP, we'd filter by current race_id if available
    ).count()
    
    scaled_cost = power["costo_usd"] * (settings.POWER_COST_SCALING ** cast_count)
    
    # 4. Transactional Cast
    try:
        Repository.apply_power_cast(db, user_id, 0, request.power_id, request.target_id, scaled_cost, x_idempotency_key)
        db.commit()
        
        response = {
            "status": "applied",
            "power_id": request.power_id,
            "target_id": request.target_id,
            "deducted_amount": scaled_cost,
            "telegraph_ms": power["telegraph_ms"]
        }
        
        IdempotencyManager.save_response(db, user_id, x_idempotency_key, "/powers/cast", request.model_dump(), response)
        
        # 5. Broadcast via WS (Would call WS Manager here)
        return response
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
