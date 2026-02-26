from sqlalchemy.orm import Session
from sqlalchemy import select, update
from app.db import models
from typing import Optional, Dict, Any
import json

class Repository:
    @staticmethod
    def get_user_wallet_with_lock(db: Session, user_id: int):
        """Gets a wallet with SELECT FOR UPDATE to prevent race conditions."""
        return db.query(models.Wallet).filter(models.Wallet.user_id == user_id).with_for_update().first()

    @staticmethod
    def get_market_selection_with_lock(db: Session, selection_id: int):
        """Gets a market selection with SELECT FOR UPDATE."""
        return db.query(models.MarketSelection).filter(models.MarketSelection.id == selection_id).with_for_update().first()

    @staticmethod
    def get_idempotency_key(db: Session, user_id: int, key: str, endpoint: str):
        return db.query(models.IdempotencyKey).filter(
            models.IdempotencyKey.user_id == user_id,
            models.IdempotencyKey.key == key,
            models.IdempotencyKey.endpoint == endpoint
        ).first()

    @staticmethod
    def create_audit_log(db: Session, user_id: Optional[int], action: str, delta: Dict[str, Any], meta: Dict[str, Any], i_key: Optional[str] = None):
        log = models.AuditLog(
            user_id=user_id,
            action=action,
            delta_json=delta,
            metadata_json=meta,
            idempotency_key=i_key
        )
        db.add(log)
        return log

    @staticmethod
    def apply_bet(db: Session, user_id: int, market_id: int, selection_key: str, amount: float, idempotency_key: str):
        with db.begin_nested(): # Atomic transaction within the session
            # 1. Check idempotency
            # 2. Lock wallet
            wallet = Repository.get_user_wallet_with_lock(db, user_id)
            if not wallet or (wallet.balance_total - wallet.balance_locked) < amount:
                raise ValueError("Insufficient balance")
            
            # 3. Lock market selection
            selection = db.query(models.MarketSelection).filter(
                models.MarketSelection.market_id == market_id,
                models.MarketSelection.selection_key == selection_key
            ).with_for_update().first()
            
            if not selection:
                raise ValueError("Selection not found")
            
            # 4. Update balances
            wallet.balance_locked += amount
            selection.pool_amount += amount
            
            # 5. Create bet record
            bet = models.Bet(
                user_id=user_id,
                market_id=market_id,
                selection_key=selection_key,
                amount=amount
            )
            db.add(bet)
            
            # 6. Audit
            Repository.create_audit_log(db, user_id, "BET_PLACED", {"balance_locked": amount}, {"market_id": market_id, "selection": selection_key}, idempotency_key)
            
            return bet

    @staticmethod
    def cancel_bet(db: Session, bet_id: int, cancel_fee_pct: float):
        with db.begin_nested():
            bet = db.query(models.Bet).filter(models.Bet.id == bet_id).with_for_update().first()
            if not bet or bet.status != "Active":
                raise ValueError("Bet not found or already processed")
            
            wallet = Repository.get_user_wallet_with_lock(db, bet.user_id)
            selection = db.query(models.MarketSelection).filter(
                models.MarketSelection.market_id == bet.market_id,
                models.MarketSelection.selection_key == bet.selection_key
            ).with_for_update().first()
            
            fee = bet.amount * cancel_fee_pct
            refund = bet.amount - fee
            
            # Update records
            wallet.balance_total -= fee
            wallet.balance_locked -= bet.amount
            selection.pool_amount -= bet.amount # Remove full amount from pool
            bet.status = "Canceled"
            
            Repository.create_audit_log(db, bet.user_id, "BET_CANCELED", {"balance_total": -fee, "balance_locked": -bet.amount}, {"fee": fee, "bet_id": bet_id})
            
            return refund

    @staticmethod
    def apply_power_cast(db: Session, user_id: int, race_id: int, power_id: str, target_id: str, cost: float, idempotency_key: str):
        with db.begin_nested():
            wallet = Repository.get_user_wallet_with_lock(db, user_id)
            if not wallet or (wallet.balance_total - wallet.balance_locked) < cost:
                raise ValueError("Insufficient balance for power")
            
            # Update wallet
            wallet.balance_total -= cost
            
            # Create power event record
            # models.PowerEvent (Need to ensure this model exists or add it)
            # For MVP, we can just record in audit log or a simple power_events table
            
            Repository.create_audit_log(
                db, user_id, "POWER_CAST", 
                {"balance_total": -cost}, 
                {"power_id": power_id, "target_id": target_id, "cost": cost}, 
                idempotency_key
            )
            
            return cost
