from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.db import models
from app.schemas import markets as market_schemas
from typing import List

router = APIRouter(prefix="/markets", tags=["markets"])

@router.get("/{race_id}", response_model=market_schemas.RaceMarketsResponse)
def get_markets(race_id: int, db: Session = Depends(get_db)):
    markets = db.query(models.Market).filter(models.Market.race_id == race_id).all()
    
    response_markets = []
    for m in markets:
        selections = db.query(models.MarketSelection).filter(models.MarketSelection.market_id == m.id).all()
        
        # Calculate simple parimutuel odds
        total_pool = sum(s.pool_amount for s in selections)
        rake_multiplier = (1 - m.rake_pct)
        net_pool = total_pool * rake_multiplier
        
        odds = {}
        for s in selections:
            if s.pool_amount > 0:
                odds[s.selection_key] = round(net_pool / s.pool_amount, 2)
            else:
                odds[s.selection_key] = 1.0 # Default/Initial odds
        
        response_markets.append({
            "id": m.id,
            "type": m.type,
            "status": m.status,
            "selections": selections,
            "odds": odds
        })
        
    return {"race_id": race_id, "markets": response_markets}
