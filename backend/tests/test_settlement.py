"""
Settlement Tests — Validates parimutuel payout logic for Win/Place/Show.
"""
import pytest
from app.db import models
from app.db.repository import Repository


class TestSettlement:
    """Tests for Repository.settle_race()"""

    def _setup_race_with_bets(self, db, market_type="Win", bets_config=None):
        """
        Helper: create a race, market, selections, users, wallets, and bets.
        
        bets_config: list of dicts like:
            [{"username": "u1", "selection": "horse_1", "amount": 100}, ...]
        """
        # Create race
        race = models.Race(lobby_id="SETTLE_TEST", current_state="Settling", num_horses=6)
        db.add(race)
        db.commit()
        db.refresh(race)

        # Create market
        market = models.Market(race_id=race.id, type=market_type, status="Closed", rake_pct=0.10)
        db.add(market)
        db.commit()
        db.refresh(market)

        # Create selections for 6 horses
        selections = {}
        for i in range(1, 7):
            sel = models.MarketSelection(market_id=market.id, selection_key=f"horse_{i}", pool_amount=0.0)
            db.add(sel)
            selections[f"horse_{i}"] = sel
        db.commit()

        # Create users, wallets, and bets
        users = {}
        if bets_config:
            for bc in bets_config:
                user = models.User(username=bc["username"])
                db.add(user)
                db.commit()
                db.refresh(user)

                wallet = models.Wallet(user_id=user.id, balance_total=1000.0, balance_locked=0.0)
                db.add(wallet)
                db.commit()

                # Place bet
                bet = models.Bet(
                    user_id=user.id,
                    market_id=market.id,
                    selection_key=bc["selection"],
                    amount=bc["amount"],
                    status="Active",
                )
                db.add(bet)
                
                # Lock the amount
                wallet.balance_locked += bc["amount"]
                selections[bc["selection"]].pool_amount += bc["amount"]
                
                users[bc["username"]] = {"user": user, "wallet": wallet, "bet": bet}
            
            db.commit()

        return race, market, selections, users

    def test_settlement_win_payout(self, db_session):
        """
        3 players bet on Win market:
        - u1 bets $100 on horse_1 (winner)
        - u2 bets $100 on horse_1 (winner)
        - u3 bets $200 on horse_2 (loser)
        
        Total pool = $400, rake 10% → net pool = $360
        Winning pool (horse_1) = $200
        u1 payout = (100/200) * 360 = $180
        u2 payout = (100/200) * 360 = $180
        u3 payout = $0 (lost)
        """
        db = db_session
        race, market, selections, users = self._setup_race_with_bets(db, "Win", [
            {"username": "settle_u1", "selection": "horse_1", "amount": 100.0},
            {"username": "settle_u2", "selection": "horse_1", "amount": 100.0},
            {"username": "settle_u3", "selection": "horse_2", "amount": 200.0},
        ])

        placements = [
            {"horse_id": "horse_1", "position": 1, "finish_time_ms": 55000},
            {"horse_id": "horse_2", "position": 2, "finish_time_ms": 57000},
            {"horse_id": "horse_3", "position": 3, "finish_time_ms": 59000},
            {"horse_id": "horse_4", "position": 4, "finish_time_ms": 60000},
            {"horse_id": "horse_5", "position": 5, "finish_time_ms": 62000},
            {"horse_id": "horse_6", "position": 6, "finish_time_ms": 65000},
        ]

        summary = Repository.settle_race(db, race.id, placements)
        db.commit()

        # Verify payouts
        assert "Win" in summary
        win_payouts = summary["Win"]
        
        # Find each user's result
        u1_result = next(p for p in win_payouts if p["user_id"] == users["settle_u1"]["user"].id)
        u2_result = next(p for p in win_payouts if p["user_id"] == users["settle_u2"]["user"].id)
        u3_result = next(p for p in win_payouts if p["user_id"] == users["settle_u3"]["user"].id)

        assert u1_result["payout"] == 180.0
        assert u1_result["status"] == "Won"
        assert u2_result["payout"] == 180.0
        assert u2_result["status"] == "Won"
        assert u3_result["payout"] == 0
        assert u3_result["status"] == "Lost"

        # Verify wallet balances
        db.expire_all()
        w1 = db.query(models.Wallet).filter(models.Wallet.user_id == users["settle_u1"]["user"].id).one()
        w3 = db.query(models.Wallet).filter(models.Wallet.user_id == users["settle_u3"]["user"].id).one()
        
        # u1: started 1000, locked 100, won 180 → net gain = +80 → total = 1080, locked = 0
        assert w1.balance_total == 1080.0
        assert w1.balance_locked == 0.0
        
        # u3: started 1000, locked 200, lost → total = 800, locked = 0
        assert w3.balance_total == 800.0
        assert w3.balance_locked == 0.0

    def test_settlement_place_show(self, db_session):
        """
        Place market: top 2 positions win.
        u1 bets $100 on horse_1 (1st) → wins
        u2 bets $100 on horse_2 (2nd) → wins
        u3 bets $100 on horse_3 (3rd) → loses in Place, would win in Show
        
        Total pool = $300, net = $270
        Winning pool (horse_1 + horse_2) = $200
        u1 payout = (100/200) * 270 = $135
        u2 payout = (100/200) * 270 = $135
        """
        db = db_session
        race, market, selections, users = self._setup_race_with_bets(db, "Place", [
            {"username": "place_u1", "selection": "horse_1", "amount": 100.0},
            {"username": "place_u2", "selection": "horse_2", "amount": 100.0},
            {"username": "place_u3", "selection": "horse_3", "amount": 100.0},
        ])

        placements = [
            {"horse_id": "horse_1", "position": 1, "finish_time_ms": 55000},
            {"horse_id": "horse_2", "position": 2, "finish_time_ms": 57000},
            {"horse_id": "horse_3", "position": 3, "finish_time_ms": 59000},
            {"horse_id": "horse_4", "position": 4, "finish_time_ms": 60000},
            {"horse_id": "horse_5", "position": 5, "finish_time_ms": 62000},
            {"horse_id": "horse_6", "position": 6, "finish_time_ms": 65000},
        ]

        summary = Repository.settle_race(db, race.id, placements)
        db.commit()

        place_payouts = summary["Place"]
        u1_res = next(p for p in place_payouts if p["user_id"] == users["place_u1"]["user"].id)
        u2_res = next(p for p in place_payouts if p["user_id"] == users["place_u2"]["user"].id)
        u3_res = next(p for p in place_payouts if p["user_id"] == users["place_u3"]["user"].id)

        assert u1_res["status"] == "Won"
        assert u2_res["status"] == "Won"
        assert u3_res["status"] == "Lost"
        assert u1_res["payout"] == 135.0
        assert u2_res["payout"] == 135.0

    def test_settlement_no_winners(self, db_session):
        """
        Nobody bet on the actual winner → all bets refunded.
        """
        db = db_session
        race, market, selections, users = self._setup_race_with_bets(db, "Win", [
            {"username": "refund_u1", "selection": "horse_3", "amount": 100.0},
            {"username": "refund_u2", "selection": "horse_4", "amount": 150.0},
        ])

        # horse_1 wins, but nobody bet on horse_1
        placements = [
            {"horse_id": "horse_1", "position": 1, "finish_time_ms": 55000},
            {"horse_id": "horse_2", "position": 2, "finish_time_ms": 57000},
            {"horse_id": "horse_3", "position": 3, "finish_time_ms": 59000},
            {"horse_id": "horse_4", "position": 4, "finish_time_ms": 60000},
            {"horse_id": "horse_5", "position": 5, "finish_time_ms": 62000},
            {"horse_id": "horse_6", "position": 6, "finish_time_ms": 65000},
        ]

        summary = Repository.settle_race(db, race.id, placements)
        db.commit()

        win_payouts = summary["Win"]
        for p in win_payouts:
            assert p["status"] == "Refunded"

        # Verify wallets are unlocked but not charged
        db.expire_all()
        w1 = db.query(models.Wallet).filter(models.Wallet.user_id == users["refund_u1"]["user"].id).one()
        w2 = db.query(models.Wallet).filter(models.Wallet.user_id == users["refund_u2"]["user"].id).one()
        
        assert w1.balance_total == 1000.0  # No loss
        assert w1.balance_locked == 0.0    # Unlocked
        assert w2.balance_total == 1000.0
        assert w2.balance_locked == 0.0
