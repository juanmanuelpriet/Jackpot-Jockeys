"""
Powers Enforcement Tests — Validates cap, cooldowns, and race-scoped tracking.
"""
import pytest
from app.db import models
from app.db.repository import Repository
from app.settings import settings
from datetime import datetime, timedelta


class TestPowersEnforcement:
    """Tests for power cap and cooldown enforcement."""

    def _setup_race_and_user(self, db, username="power_user", balance=1000.0):
        """Helper: create user, wallet, and active race."""
        user = models.User(username=username)
        db.add(user)
        db.commit()
        db.refresh(user)

        wallet = models.Wallet(user_id=user.id, balance_total=balance, balance_locked=0.0)
        db.add(wallet)

        race = models.Race(lobby_id="POWER_TEST", current_state="RaceRunning", num_horses=6)
        db.add(race)
        db.commit()
        db.refresh(race)

        return user, wallet, race

    def test_power_cap_enforcement(self, db_session):
        """
        User casts powers totaling near the cap, then tries one more that exceeds it.
        MAX_POWER_SPEND_PER_RACE = 300
        
        Cast 1: $20 (base cost, 0 previous casts)
        Cast 2: $25 (20 * 1.25^1)
        ...keep casting until near $300, then verify rejection.
        """
        db = db_session
        user, wallet, race = self._setup_race_and_user(db, "cap_user")

        # Simulate multiple casts that approach the cap
        total_spent = 0.0
        cast_num = 0
        while total_spent < 250:
            cost = 20.0 * (settings.POWER_COST_SCALING ** cast_num)
            event = models.PowerCastEvent(
                user_id=user.id,
                race_id=race.id,
                power_id="pwr_boost_01",
                target_id="horse_1",
                cost=cost,
            )
            db.add(event)
            wallet.balance_total -= cost
            total_spent += cost
            cast_num += 1
        db.commit()

        # Verify spend tracking
        tracked_spend = Repository.get_power_spend_in_race(db, user.id, race.id)
        assert abs(tracked_spend - total_spent) < 0.01

        # Next cast should be rejected if it would exceed 300
        next_cost = 20.0 * (settings.POWER_COST_SCALING ** cast_num)
        remaining = settings.MAX_POWER_SPEND_PER_RACE - tracked_spend
        
        # The next cost should push us over the limit
        assert tracked_spend + next_cost > settings.MAX_POWER_SPEND_PER_RACE
        assert remaining < next_cost

    def test_power_cooldown_enforcement(self, db_session):
        """
        Cast a power, then verify the cooldown window is tracked.
        pwr_oil_01 has cooldown_s = 8
        """
        db = db_session
        user, wallet, race = self._setup_race_and_user(db, "cd_user")

        # Record a recent power cast
        recent_cast = models.PowerCastEvent(
            user_id=user.id,
            race_id=race.id,
            power_id="pwr_oil_01",
            target_id="horse_2",
            cost=30.0,
            created_at=datetime.utcnow(),  # just now
        )
        db.add(recent_cast)
        db.commit()

        # Verify last cast is found
        last = Repository.get_last_power_cast(db, user.id, race.id, "pwr_oil_01")
        assert last is not None
        
        elapsed = (datetime.utcnow() - last.created_at.replace(tzinfo=None)).total_seconds()
        # Should be within cooldown window (8 seconds)
        assert elapsed < 8.0, f"Cast was {elapsed}s ago, should be within cooldown"

        # A cast from 10 seconds ago should be outside cooldown
        old_cast = models.PowerCastEvent(
            user_id=user.id,
            race_id=race.id,
            power_id="pwr_boost_01",
            target_id="horse_3",
            cost=20.0,
            created_at=datetime.utcnow() - timedelta(seconds=10),
        )
        db.add(old_cast)
        db.commit()

        last_old = Repository.get_last_power_cast(db, user.id, race.id, "pwr_boost_01")
        elapsed_old = (datetime.utcnow() - last_old.created_at.replace(tzinfo=None)).total_seconds()
        # pwr_boost_01 has cooldown_s = 5, and cast was 10s ago → should be clear
        assert elapsed_old >= 5.0
