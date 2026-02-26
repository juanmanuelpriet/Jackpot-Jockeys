from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime

class WalletBase(BaseModel):
    user_id: int
    balance_total: float
    balance_locked: float

class WalletResponse(WalletBase):
    balance_available: float
    debt_total: float = 0.0 # Placeholder for now

    @classmethod
    def from_orm(cls, wallet_orm):
        return cls(
            user_id=wallet_orm.user_id,
            balance_total=wallet_orm.balance_total,
            balance_locked=wallet_orm.balance_locked,
            balance_available=wallet_orm.balance_total - wallet_orm.balance_locked
        )

class BalanceUpdate(BaseModel):
    new_balance_total: float
    new_balance_locked: float
    new_balance_available: float
