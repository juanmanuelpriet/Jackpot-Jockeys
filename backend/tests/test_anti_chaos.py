"""
Anti-Chaos Tests — Validates anti-focus debuff limits.
"""
import pytest
from app.db import models
from app.db.repository import Repository
from app.settings import settings


class TestAntiChaos:
    """Tests for anti-focus rules."""

    def test_anti_focus_debuff_limit(self, db_session):
        """
        A user can cast at most MAX_DEBUFFS_PER_TARGET_PER_USER (3) debuffs
        on the same target in a single race. The 4th should be rejected.
        """
        db = db_session

        user = models.User(username="focus_user")
        db.add(user)
        db.commit()
        db.refresh(user)

        wallet = models.Wallet(user_id=user.id, balance_total=1000.0, balance_locked=0.0)
        db.add(wallet)

        race = models.Race(lobby_id="CHAOS_TEST", current_state="RaceRunning", num_horses=6)
        db.add(race)
        db.commit()
        db.refresh(race)

        target = "horse_3"

        # Cast 3 debuffs on the same target (should all succeed)
        for i in range(settings.MAX_DEBUFFS_PER_TARGET_PER_USER):
            event = models.PowerCastEvent(
                user_id=user.id,
                race_id=race.id,
                power_id="pwr_oil_01",
                target_id=target,
                cost=30.0 * (settings.POWER_COST_SCALING ** i),
            )
            db.add(event)
        db.commit()

        # Count should be at the limit
        count = Repository.count_debuffs_on_target(db, user.id, race.id, target)
        assert count == settings.MAX_DEBUFFS_PER_TARGET_PER_USER

        # A different target should still be allowed
        count_other = Repository.count_debuffs_on_target(db, user.id, race.id, "horse_5")
        assert count_other == 0

    def test_pity_shield_threshold(self, db_session):
        """
        When a target receives >= PITY_SHIELD_THRESHOLD (5) debuffs from all users,
        the pity shield becomes active.
        """
        db = db_session

        race = models.Race(lobby_id="PITY_TEST", current_state="RaceRunning", num_horses=6)
        db.add(race)
        db.commit()
        db.refresh(race)

        target = "horse_2"

        # Create 5 debuffs from different users on the same target
        for i in range(settings.PITY_SHIELD_THRESHOLD):
            user = models.User(username=f"pity_user_{i}")
            db.add(user)
            db.commit()
            db.refresh(user)

            event = models.PowerCastEvent(
                user_id=user.id,
                race_id=race.id,
                power_id="pwr_oil_01",
                target_id=target,
                cost=30.0,
            )
            db.add(event)
        db.commit()

        # Pity shield should now be active
        total = Repository.count_total_debuffs_on_target(db, race.id, target)
        assert total >= settings.PITY_SHIELD_THRESHOLD

        # Effective duration should be reduced
        base_duration = 3.0  # pwr_oil_01's duracion_s
        effective = base_duration * settings.PITY_SHIELD_REDUCTION
        assert effective == 1.5
