import pytest
import websockets
import json
import asyncio
from conftest import WS_URL

@pytest.mark.asyncio
async def test_websocket_snapshot_hydration(auth_token, setup_race):
    # Connect to WS
    uri = f"{WS_URL}?token={auth_token}"
    
    async with websockets.connect(uri) as ws:
        # Request Snapshot
        await ws.send(json.dumps({"type": "GET_STATE_SNAPSHOT"}))
        
        # Must receive snapshot within 2 seconds
        response = await asyncio.wait_for(ws.recv(), timeout=2.0)
        data = json.loads(response)
        
        assert data["event_name"] == "STATE_SNAPSHOT"
        assert "current_state" in data
        assert "state_version" in data
        assert data["current_state"] == "BettingOpen"
