from fastapi import APIRouter, Depends, HTTPException, Header, status
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.db import models
from app.db.repository import Repository
from app.core.idempotency import IdempotencyManager
from app.schemas import bets as bet_schemas
from app.settings import settings
from app.api.auth import get_current_user
from typing import Optional

router = APIRouter(prefix="/bets", tags=["bets"])

@router.post("", response_model=bet_schemas.BetResponse)
def place_bet(
    bet_data: bet_schemas.BetCreate, 
    user_id: int = Depends(get_current_user),
    x_idempotency_key: str = Header(...),
    db: Session = Depends(get_db)
):
    # 1. Check Idempotency
    cached_response = IdempotencyManager.check_or_reserve(db, user_id, x_idempotency_key, "/bets", bet_data.model_dump())
    if cached_response:
        return cached_response

    # 2. Execute Transactional Bet
    try:
        bet = Repository.apply_bet(
            db, user_id, bet_data.market_id, bet_data.selection_key, bet_data.amount, x_idempotency_key
        )
        db.commit()
        
        response = bet_schemas.BetResponse(
            id=bet.id,
            user_id=bet.user_id,
            market_id=bet.market_id,
            selection_key=bet.selection_key,
            amount=bet.amount,
            status=bet.status,
            created_at=bet.created_at
        )
        
        # 3. Save for Idempotency
        IdempotencyManager.save_response(db, user_id, x_idempotency_key, "/bets", bet_data.model_dump(mode='json'), response.model_dump(mode='json'))
        
        return response
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        db.rollback()
        print(f"ERROR in place_bet: {str(e)}") # Log for docker
        raise HTTPException(status_code=500, detail="Internal server error")

@router.delete("/{bet_id}", response_model=bet_schemas.BetCancelResponse)
def cancel_bet(bet_id: int, user_id: int = Depends(get_current_user), db: Session = Depends(get_db)):
    # Note: Idempotency is less critical for DELETE but good to have
    try:
        # Check if cutoff reached (T-10s) - simplified for MVP
        # In real scenario, check race.state and time_remaining
        
        refund = Repository.cancel_bet(db, bet_id, settings.CANCEL_FEE)
        db.commit()
        
        wallet = db.query(models.Wallet).filter(models.Wallet.user_id == user_id).first()
        
        return {
            "refunded_amount": refund,
            "fee_charged": refund / (1 - settings.CANCEL_FEE) * settings.CANCEL_FEE,
            "new_balance": wallet.balance_total
        }
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
