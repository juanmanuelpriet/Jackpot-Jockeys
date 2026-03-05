from fastapi import APIRouter, Depends, HTTPException, Header, status
from sqlalchemy.orm import Session
from datetime import datetime
from app.db.database import get_db
from app.db import models
from app.db.repository import Repository
from app.core.idempotency import IdempotencyManager
from app.schemas import bets as bet_schemas
from app.settings import settings
from app.api.auth import get_current_user, get_current_user_with_role
from app.ws.manager import broadcast_bet_placed, broadcast_bet_canceled, send_balance_update, broadcast_odds_update
from typing import Optional

router = APIRouter(prefix="/bets", tags=["bets"])

# Cutoff: reject bets in the last 10 seconds of BettingOpen
BET_CUTOFF_SECONDS = 10
BETTING_DURATION_SECONDS = 60


def _compute_odds(db: Session, market: models.Market) -> dict:
    """Compute current parimutuel odds for a market."""
    selections = db.query(models.MarketSelection).filter(
        models.MarketSelection.market_id == market.id,
    ).all()
    total_pool = sum(s.pool_amount for s in selections)
    odds = {}
    for s in selections:
        if total_pool > 0 and s.pool_amount > 0:
            odds[s.selection_key] = round(total_pool * (1 - market.rake_pct) / s.pool_amount, 2)
        else:
            odds[s.selection_key] = 0
    return odds


@router.post("", response_model=bet_schemas.BetResponse)
async def place_bet(
    bet_data: bet_schemas.BetCreate, 
    user_id: int = Depends(get_current_user),
    token_data: dict = Depends(get_current_user_with_role),
    x_idempotency_key: str = Header(...),
    db: Session = Depends(get_db),
):
    # 1. Check Idempotency
    cached_response = IdempotencyManager.check_or_reserve(db, user_id, x_idempotency_key, "/bets", bet_data.model_dump())
    if cached_response:
        return cached_response

    # 2. Validate market is open
    market = db.query(models.Market).filter(models.Market.id == bet_data.market_id).first()
    if not market:
        raise HTTPException(status_code=400, detail="Market not found")
    if market.status != "Open":
        raise HTTPException(status_code=400, detail=f"Market is {market.status}, not accepting bets")

    # 3. Validate selection exists
    valid_selection = db.query(models.MarketSelection).filter(
        models.MarketSelection.market_id == market.id,
        models.MarketSelection.selection_key == bet_data.selection_key,
    ).first()
    if not valid_selection:
        raise HTTPException(status_code=400, detail=f"Invalid selection '{bet_data.selection_key}' for market {market.type}")

    # 4. Cutoff T-10s
    race = db.query(models.Race).filter(models.Race.id == market.race_id).first()
    lobby_id = race.lobby_id if race else None
    if race and race.current_state == "BettingOpen" and race.state_entered_at:
        elapsed = (datetime.now() - race.state_entered_at.replace(tzinfo=None)).total_seconds()
        remaining = BETTING_DURATION_SECONDS - elapsed
        if remaining < BET_CUTOFF_SECONDS:
            raise HTTPException(
                status_code=400,
                detail=f"Betting cutoff: less than {BET_CUTOFF_SECONDS}s remaining ({remaining:.1f}s left)"
            )

    # 5. Execute Transactional Bet
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
        
        IdempotencyManager.save_response(db, user_id, x_idempotency_key, "/bets", bet_data.model_dump(mode='json'), response.model_dump(mode='json'))
        
        # 6. WS Broadcasts
        if lobby_id:
            await broadcast_bet_placed(lobby_id, user_id, market.type, bet_data.selection_key, bet_data.amount)
            odds = _compute_odds(db, market)
            await broadcast_odds_update(lobby_id, market.id, market.type, odds)
            wallet = db.query(models.Wallet).filter(models.Wallet.user_id == user_id).first()
            if wallet:
                await send_balance_update(lobby_id, user_id, wallet.balance_total, wallet.balance_locked)
        
        return response
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        db.rollback()
        print(f"ERROR in place_bet: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.delete("/{bet_id}", response_model=bet_schemas.BetCancelResponse)
async def cancel_bet(
    bet_id: int,
    user_id: int = Depends(get_current_user),
    token_data: dict = Depends(get_current_user_with_role),
    db: Session = Depends(get_db),
):
    try:
        refund = Repository.cancel_bet(db, bet_id, settings.CANCEL_FEE)
        db.commit()
        
        wallet = db.query(models.Wallet).filter(models.Wallet.user_id == user_id).first()
        
        # WS Broadcast
        lobby_id = token_data.get("lobby_id")
        if lobby_id:
            await broadcast_bet_canceled(lobby_id, user_id, bet_id, refund)
            if wallet:
                await send_balance_update(lobby_id, user_id, wallet.balance_total, wallet.balance_locked)
        
        return {
            "refunded_amount": refund,
            "fee_charged": round(refund / (1 - settings.CANCEL_FEE) * settings.CANCEL_FEE, 2),
            "new_balance": wallet.balance_total
        }
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
