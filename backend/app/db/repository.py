"""Repository — All DB operations with transactional locking.

MONEY ROUNDING POLICY (MVP with Float):
  Every money calculation is rounded to 2 decimal places via _r().
  This prevents phantom-cent accumulation across many races.
  Residual < $0.01 is absorbed as house rounding (implicit rake).
  P2 migration: replace Float with Numeric(12,2) in all money columns.

updated_at POLICY:
  Wallet.updated_at uses SQLAlchemy's onupdate=func.now(),
  which fires at the application layer on every UPDATE.
  No DB trigger needed.
"""
from sqlalchemy.orm import Session
from sqlalchemy import select, update, func
from app.db import models
from typing import Optional, Dict, Any, List
import json
from datetime import datetime


def _r(value: float) -> float:
    """Round money to 2 decimal places. Every money mutation MUST use this."""
    return round(value, 2)


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
            
            # 4. Update balances (rounded)
            wallet.balance_locked = _r(wallet.balance_locked + amount)
            selection.pool_amount = _r(selection.pool_amount + amount)
            
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
            
            fee = _r(bet.amount * cancel_fee_pct)
            refund = _r(bet.amount - fee)
            
            # Update records (rounded)
            wallet.balance_total = _r(wallet.balance_total - fee)
            wallet.balance_locked = _r(wallet.balance_locked - bet.amount)
            selection.pool_amount = _r(selection.pool_amount - bet.amount)
            bet.status = "Canceled"
            
            Repository.create_audit_log(db, bet.user_id, "BET_CANCELED", {"balance_total": -fee, "balance_locked": -bet.amount}, {"fee": fee, "bet_id": bet_id})
            
            return refund

    @staticmethod
    def apply_power_cast(db: Session, user_id: int, race_id: int, power_id: str, target_id: str, cost: float, idempotency_key: str, effective_duration_s: float = None):
        with db.begin_nested():
            wallet = Repository.get_user_wallet_with_lock(db, user_id)
            if not wallet or (wallet.balance_total - wallet.balance_locked) < cost:
                raise ValueError("Insufficient balance for power")
            
            # Update wallet
            wallet.balance_total = _r(wallet.balance_total - cost)
            
            # Create PowerCastEvent record
            event = models.PowerCastEvent(
                user_id=user_id,
                race_id=race_id,
                power_id=power_id,
                target_id=target_id,
                cost=cost,
                effective_duration_s=effective_duration_s,
            )
            db.add(event)
            
            Repository.create_audit_log(
                db, user_id, "POWER_CAST", 
                {"balance_total": -cost}, 
                {"power_id": power_id, "target_id": target_id, "cost": cost, "race_id": race_id}, 
                idempotency_key
            )
            
            return event

    # ── Market Lifecycle ──────────────────────────────────────────

    @staticmethod
    def create_markets_for_race(db: Session, race_id: int, num_horses: int, rake_pct: float = 0.10):
        """Auto-create Win/Place/Show markets with selections for each horse."""
        market_types = ["Win", "Place", "Show"]
        horse_ids = [f"horse_{i}" for i in range(1, num_horses + 1)]
        
        created_markets = []
        for mtype in market_types:
            market = models.Market(race_id=race_id, type=mtype, status="Open", rake_pct=rake_pct)
            db.add(market)
            db.flush()  # Get market.id
            
            for horse_id in horse_ids:
                selection = models.MarketSelection(
                    market_id=market.id,
                    selection_key=horse_id,
                    pool_amount=0.0,
                )
                db.add(selection)
            
            created_markets.append(market)
        
        return created_markets

    @staticmethod
    def close_markets_for_race(db: Session, race_id: int):
        """Close all open markets for a race (called at BettingOpen → RaceRunning)."""
        now = datetime.utcnow()
        markets = db.query(models.Market).filter(
            models.Market.race_id == race_id,
            models.Market.status == "Open",
        ).all()
        for m in markets:
            m.status = "Closed"
            m.closed_at = now
        return len(markets)

    # ── Settlement ────────────────────────────────────────────────

    @staticmethod
    def settle_race(db: Session, race_id: int, placements: List[dict]):
        """
        Full parimutuel settlement.
        
        Args:
            placements: list of {"horse_id": str, "position": int, "finish_time_ms": int}
                        sorted by position ascending.
        
        Returns:
            dict with summary {market_type: [{user_id, bet_id, payout}]}
        """
        from app.core.race_sim import Placement  # type hint only
        
        now = datetime.utcnow()
        
        # 1. Persist placements
        for p in placements:
            result = models.RaceResult(
                race_id=race_id,
                horse_id=p["horse_id"],
                position=p["position"],
                finish_time_ms=p["finish_time_ms"],
            )
            db.add(result)
        
        # 2. Build placement lookup
        placement_map = {p["horse_id"]: p["position"] for p in placements}
        
        # 3. Settle each market
        markets = db.query(models.Market).filter(
            models.Market.race_id == race_id,
            models.Market.status == "Closed",
        ).all()
        
        settlement_summary = {}
        
        for market in markets:
            selections = db.query(models.MarketSelection).filter(
                models.MarketSelection.market_id == market.id,
            ).with_for_update().all()
            
            bets = db.query(models.Bet).filter(
                models.Bet.market_id == market.id,
                models.Bet.status == "Active",
            ).all()
            
            if not bets:
                market.status = "Settled"
                continue
            
            # Determine winning keys based on market type
            winning_keys = set()
            if market.type == "Win":
                winning_keys = {p["horse_id"] for p in placements if p["position"] == 1}
            elif market.type == "Place":
                winning_keys = {p["horse_id"] for p in placements if p["position"] <= 2}
            elif market.type == "Show":
                winning_keys = {p["horse_id"] for p in placements if p["position"] <= 3}
            
            # Pool calculations (rounded)
            total_pool = _r(sum(s.pool_amount for s in selections))
            net_pool = _r(total_pool * (1 - market.rake_pct))
            winning_pool = sum(
                s.pool_amount for s in selections 
                if s.selection_key in winning_keys
            )
            
            market_payouts = []
            
            if winning_pool == 0:
                # Nobody bet on any winner → refund all bets
                for bet in bets:
                    bet.status = "Refunded"
                    bet.payout_amount = bet.amount
                    bet.settled_at = now
                    
                    wallet = Repository.get_user_wallet_with_lock(db, bet.user_id)
                    wallet.balance_locked = _r(wallet.balance_locked - bet.amount)
                    # balance_total stays same (refund = unlock only)
                    
                    Repository.create_audit_log(
                        db, bet.user_id, "SETTLEMENT_REFUND",
                        {"balance_locked": -bet.amount},
                        {"bet_id": bet.id, "market_type": market.type, "reason": "no_winning_bets"},
                    )
                    market_payouts.append({"user_id": bet.user_id, "bet_id": bet.id, "payout": bet.amount, "status": "Refunded"})
            else:
                for bet in bets:
                    wallet = Repository.get_user_wallet_with_lock(db, bet.user_id)
                    
                    if bet.selection_key in winning_keys:
                        # Payout: proportional share of net pool
                        payout = _r((bet.amount / winning_pool) * net_pool)
                        bet.payout_amount = payout
                        bet.status = "Won"
                        bet.settled_at = now
                        
                        # Unlock the locked amount and add the payout (rounded)
                        wallet.balance_locked = _r(wallet.balance_locked - bet.amount)
                        wallet.balance_total = _r(wallet.balance_total + (payout - bet.amount))
                        wallet.lifetime_earned = _r(wallet.lifetime_earned + payout)
                        
                        Repository.create_audit_log(
                            db, bet.user_id, "SETTLEMENT_PAYOUT",
                            {"balance_total": payout - bet.amount, "balance_locked": -bet.amount},
                            {"bet_id": bet.id, "market_type": market.type, "payout": payout, "position": placement_map.get(bet.selection_key)},
                        )
                        market_payouts.append({"user_id": bet.user_id, "bet_id": bet.id, "payout": payout, "status": "Won"})
                    else:
                        bet.payout_amount = 0
                        bet.status = "Lost"
                        bet.settled_at = now
                        
                        # Lose the locked amount
                        wallet.balance_locked = _r(wallet.balance_locked - bet.amount)
                        wallet.balance_total = _r(wallet.balance_total - bet.amount)
                        
                        Repository.create_audit_log(
                            db, bet.user_id, "SETTLEMENT_LOSS",
                            {"balance_total": -bet.amount, "balance_locked": -bet.amount},
                            {"bet_id": bet.id, "market_type": market.type},
                        )
                        market_payouts.append({"user_id": bet.user_id, "bet_id": bet.id, "payout": 0, "status": "Lost"})
                    
                    wallet.lifetime_wagered = _r(wallet.lifetime_wagered + bet.amount)
            
            market.status = "Settled"
            settlement_summary[market.type] = market_payouts
        
        # Mark race as settled
        race = db.query(models.Race).filter(models.Race.id == race_id).first()
        if race:
            race.settled_at = now
        
        return settlement_summary

    # ── Power Tracking (for enforcement) ──────────────────────────

    @staticmethod
    def get_power_spend_in_race(db: Session, user_id: int, race_id: int) -> float:
        """Total cost of powers cast by user in this race."""
        result = db.query(func.coalesce(func.sum(models.PowerCastEvent.cost), 0.0)).filter(
            models.PowerCastEvent.user_id == user_id,
            models.PowerCastEvent.race_id == race_id,
        ).scalar()
        return float(result)

    @staticmethod
    def get_last_power_cast(db: Session, user_id: int, race_id: int, power_id: str):
        """Get the most recent cast of a specific power by user in this race."""
        return db.query(models.PowerCastEvent).filter(
            models.PowerCastEvent.user_id == user_id,
            models.PowerCastEvent.race_id == race_id,
            models.PowerCastEvent.power_id == power_id,
        ).order_by(models.PowerCastEvent.created_at.desc()).first()

    @staticmethod
    def get_power_cast_count_in_race(db: Session, user_id: int, race_id: int) -> int:
        """Total number of power casts by user in this race (for cost scaling)."""
        return db.query(models.PowerCastEvent).filter(
            models.PowerCastEvent.user_id == user_id,
            models.PowerCastEvent.race_id == race_id,
        ).count()

    @staticmethod
    def count_debuffs_on_target(db: Session, user_id: int, race_id: int, target_id: str) -> int:
        """Count debuffs cast by this user on this target in this race (anti-focus)."""
        return db.query(models.PowerCastEvent).filter(
            models.PowerCastEvent.user_id == user_id,
            models.PowerCastEvent.race_id == race_id,
            models.PowerCastEvent.target_id == target_id,
        ).count()

    @staticmethod
    def count_total_debuffs_on_target(db: Session, race_id: int, target_id: str) -> int:
        """Count ALL debuffs on a target in this race from ALL users (pity shield)."""
        return db.query(models.PowerCastEvent).filter(
            models.PowerCastEvent.race_id == race_id,
            models.PowerCastEvent.target_id == target_id,
        ).count()
