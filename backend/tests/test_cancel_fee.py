import pytest
import httpx
from app.db import models
from app.settings import settings

@pytest.mark.asyncio
async def test_bet_cancel_fee_impact(api_client, auth_token, setup_race, db_session, clean_db):
    headers = {"Authorization": f"Bearer {auth_token}"}
    race, market, selection = setup_race
    
    # 1. Place bet of $100
    bet_payload = {
        "race_id": race.id,
        "market_id": market.id,
        "selection_key": "horse_1",
        "amount": 100.0
    }
    place_res = await api_client.post("/bets", json=bet_payload, headers={**headers, "X-Idempotency-Key": "cancel-test-1"})
    bet_id = place_res.json()["id"]

    # 2. Cancel bet
    # In reality, delete might need auth too, for MVP we use user_id query param or similar
    # Assuming user_id=1 for the newly joined user in cleanup
    user = db_session.query(models.User).order_by(models.User.id.desc()).first()
    cancel_res = await api_client.delete(f"/bets/{bet_id}", params={"user_id": user.id})
    assert cancel_res.status_code == 200
    
    data = cancel_res.json()
    assert data["refunded_amount"] == 95.0 # $100 * (1 - 0.05)
    assert data["fee_charged"] == 5.0
    
    # 3. Verify total balance in DB
    db_session.expire_all()
    wallet = db_session.query(models.Wallet).filter(models.Wallet.user_id == user.id).one()
    assert wallet.balance_total == 995.0 # Initial $1000 - $5 fee
    assert wallet.balance_locked == 0.0
