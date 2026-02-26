from pydantic import BaseModel
from typing import List, Optional

class PowerCatalogItem(BaseModel):
    id: str
    nombre: str
    tipo: str # buff, debuff, global
    tamano: str # pequeno, grande
    costo_usd: float
    objetivo: str
    duracion_s: float
    cooldown_s: float

class PowerCastRequest(BaseModel):
    power_id: str
    target_id: str # Horse or Global

class PowerCastResponse(BaseModel):
    status: str
    power_id: str
    target_id: str
    deducted_amount: float
    telegraph_ms: int
