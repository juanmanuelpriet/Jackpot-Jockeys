import pytest
import asyncio
import httpx
from app.db import models

@pytest.mark.asyncio
async def test_wallet_concurrency(api_client, db_session, setup_race):
    # Setup: Create user with exactly $100
    user = models.User(username="concurrency_user")
    db_session.add(user)
    db_session.commit()
    wallet = models.Wallet(user_id=user.id, balance_total=100.0, balance_locked=0.0)
    db_session.add(wallet)
    db_session.commit()
    
    # Join to get token
    auth_res = await api_client.post("/auth/join", json={"username": user.username, "lobby_id": "TEST"})
    token = auth_res.json()["access_token"]
    
    race, market, _ = setup_race
    
    # Payload for two bets of $60 each (Total $120 > $100)
    payload = {
        "race_id": race.id,
        "market_id": market.id,
        "selection_key": "horse_1",
        "amount": 60.0
    }

    async def send_bet(idx):
        return await api_client.post(
            "/bets", 
            json=payload, 
            headers={"Authorization": f"Bearer {token}", "X-Idempotency-Key": f"conc-key-{idx}"}
        )

    # Launch 2 requests simultaneously
    results = await asyncio.gather(send_bet(1), send_bet(2))

    # One should succeed, one should fail
    statuses = [r.status_code for r in results]
    assert 200 in statuses
    assert 400 in statuses # Insufficient balance for second one

    # Final balance check
    db_session.expire_all()
    final_wallet = db_session.query(models.Wallet).filter(models.Wallet.user_id == user.id).one()
    assert final_wallet.balance_locked == 60.0
    assert final_wallet.balance_total == 100.0
