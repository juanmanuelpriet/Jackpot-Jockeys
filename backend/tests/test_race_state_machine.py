import pytest
import httpx
from app.db import models

@pytest.mark.asyncio
async def test_race_lifecycle_via_admin(api_client, setup_race, db_session):
    race, _, _ = setup_race
    lobby_id = race.lobby_id
    
    # 1. Start Engine via Admin
    res_start = await api_client.post(f"/admin/race/start/{lobby_id}")
    assert res_start.status_code == 200
    assert "started" in res_start.json()["message"]

    # 2. Check DB state changed
    db_session.expire_all()
    updated_race = db_session.query(models.Race).filter(models.Race.lobby_id == lobby_id).one()
    assert updated_race.current_state == "BettingOpen"
    
    # 3. Stop Engine
    res_stop = await api_client.post(f"/admin/race/stop/{lobby_id}")
    assert res_stop.status_code == 200
