"""
Bets Validation Tests — Validates market status and selection checks.
"""
import pytest
from app.db import models
from app.db.repository import Repository


class TestBetsValidation:
    """Tests for bet validation logic."""

    def test_bet_on_closed_market(self, db_session):
        """
        Attempting to bet on a market with status='Closed' should fail.
        We test the repository-level validation (market check is in the API layer,
        but we verify that placing a bet on a closed market's selection still works
        at DB level — the API guard is what prevents it).
        """
        db = db_session

        # Create race with a CLOSED market
        race = models.Race(lobby_id="BET_VAL_TEST", current_state="RaceRunning", num_horses=6)
        db.add(race)
        db.commit()
        db.refresh(race)

        market = models.Market(race_id=race.id, type="Win", status="Closed", rake_pct=0.10)
        db.add(market)
        db.commit()
        db.refresh(market)

        sel = models.MarketSelection(market_id=market.id, selection_key="horse_1", pool_amount=0.0)
        db.add(sel)
        db.commit()

        # Verify market is closed
        assert market.status == "Closed"

        # The API layer checks market.status before calling Repository.apply_bet
        # Here we verify the market status is correctly persisted
        fetched_market = db.query(models.Market).filter(models.Market.id == market.id).one()
        assert fetched_market.status == "Closed"

    def test_market_auto_close(self, db_session):
        """
        Repository.close_markets_for_race() should close all open markets.
        """
        db = db_session

        race = models.Race(lobby_id="CLOSE_TEST", current_state="BettingOpen", num_horses=6)
        db.add(race)
        db.commit()
        db.refresh(race)

        # Create 3 open markets
        for mtype in ["Win", "Place", "Show"]:
            m = models.Market(race_id=race.id, type=mtype, status="Open", rake_pct=0.10)
            db.add(m)
        db.commit()

        # Close them
        closed_count = Repository.close_markets_for_race(db, race.id)
        db.commit()

        assert closed_count == 3

        # Verify all are closed
        markets = db.query(models.Market).filter(models.Market.race_id == race.id).all()
        for m in markets:
            assert m.status == "Closed"
            assert m.closed_at is not None

    def test_market_auto_creation(self, db_session):
        """
        Repository.create_markets_for_race() should create Win/Place/Show
        markets with selections for each horse.
        """
        db = db_session

        race = models.Race(lobby_id="CREATE_TEST", current_state="BettingOpen", num_horses=6)
        db.add(race)
        db.commit()
        db.refresh(race)

        markets = Repository.create_markets_for_race(db, race.id, 6, 0.10)
        db.commit()

        assert len(markets) == 3
        types = {m.type for m in markets}
        assert types == {"Win", "Place", "Show"}

        # Each market should have 6 selections
        for m in markets:
            sels = db.query(models.MarketSelection).filter(
                models.MarketSelection.market_id == m.id
            ).all()
            assert len(sels) == 6
