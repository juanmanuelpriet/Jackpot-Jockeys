import pytest
import httpx
from datetime import datetime

@pytest.mark.asyncio
async def test_bet_idempotency_success(api_client, auth_token, setup_race):
    headers = {
        "Authorization": f"Bearer {auth_token}",
        "X-Idempotency-Key": "same-key-1"
    }
    race, market, selection = setup_race
    
    bet_payload = {
        "race_id": race.id,
        "market_id": market.id,
        "selection_key": "horse_1",
        "amount": 50.0
    }

    # First attempt
    res1 = await api_client.post("/bets", json=bet_payload, headers=headers)
    if res1.status_code != 200:
        print(f"DEBUG FAIL: {res1.status_code} - {res1.text}")
    assert res1.status_code == 200
    id1 = res1.json()["id"]

    # Second attempt (Duplicate)
    res2 = await api_client.post("/bets", json=bet_payload, headers=headers)
    assert res2.status_code == 200
    assert res2.json()["id"] == id1 # Same result

@pytest.mark.asyncio
async def test_bet_idempotency_mismatch(api_client, auth_token, setup_race):
    headers = {
        "Authorization": f"Bearer {auth_token}",
        "X-Idempotency-Key": "mismatch-key-1"
    }
    race, market, selection = setup_race
    
    # First attempt
    res1 = await api_client.post("/bets", json={
        "race_id": race.id, "market_id": market.id, "selection_key": "horse_1", "amount": 50.0
    }, headers=headers)
    assert res1.status_code == 200

    # Second attempt with DIFFERENT body
    res2 = await api_client.post("/bets", json={
        "race_id": race.id, "market_id": market.id, "selection_key": "horse_1", "amount": 100.0
    }, headers=headers)
    assert res2.status_code == 409
    assert "reused with different request body" in res2.text
