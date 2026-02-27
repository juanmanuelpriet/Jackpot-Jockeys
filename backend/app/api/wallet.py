from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.db import models
from app.schemas import wallet as wallet_schemas
from app.api.auth import get_current_user

router = APIRouter(prefix="/wallet", tags=["wallet"])

@router.get("", response_model=wallet_schemas.WalletResponse)
def get_wallet(user_id: int = Depends(get_current_user), db: Session = Depends(get_db)):
    wallet = db.query(models.Wallet).filter(models.Wallet.user_id == user_id).first()
    if not wallet:
        return {"user_id": user_id, "balance_total": 0, "balance_locked": 0, "balance_available": 0}
    
    return wallet_schemas.WalletResponse.from_orm(wallet)
