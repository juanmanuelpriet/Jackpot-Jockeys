import asyncio
import requests
import json
import websockets
from datetime import datetime

# Config
BASE_URL = "http://localhost:8000"
WS_URL = "ws://localhost:8000/ws"

def test_api():
    print("--- Testing API ---")
    
    # 1. Join Lobby
    print("1. Joining Lobby...")
    res = requests.post(f"{BASE_URL}/auth/join", json={"username": "test_user", "lobby_id": "LBY1"})
    data = res.json()
    token = data["access_token"]
    print(f"Token: {token[:20]}...")

    # 2. Get Wallet
    print("2. Getting Wallet...")
    res = requests.get(f"{BASE_URL}/wallet", params={"user_id": 1})
    print(f"Wallet: {res.json()}")

    # 3. Place Bet with Idempotency
    print("3. Placing Bet (Idempotency Test)...")
    bet_payload = {
        "race_id": 1,
        "market_id": 1,
        "selection_key": "horse_1",
        "amount": 100
    }
    headers = {"X-Idempotency-Key": "unique-key-1"}
    
    # First attempt
    res1 = requests.post(f"{BASE_URL}/bets", json=bet_payload, headers=headers)
    print(f"Attempt 1 Result: {res1.status_code}")
    
    # Second attempt (should be same response)
    res2 = requests.post(f"{BASE_URL}/bets", json=bet_payload, headers=headers)
    print(f"Attempt 2 Result: {res2.status_code} (Should be same)")
    
    # Mismatch attempt
    headers["X-Idempotency-Key"] = "unique-key-1"
    bet_payload["amount"] = 200 # Different body
    res3 = requests.post(f"{BASE_URL}/bets", json=bet_payload, headers=headers)
    print(f"Mismatch Result: {res3.status_code} (Should be 409)")

async def test_ws():
    print("--- Testing WebSockets ---")
    # Need to join first to get token
    res = requests.post(f"{BASE_URL}/auth/join", json={"username": "ws_user", "lobby_id": "LBY1"})
    token = res.json()["access_token"]
    
    async with websockets.connect(f"{WS_URL}?token={token}") as websocket:
        print("Connected to WS")
        
        # Request Snapshot
        print("Requesting State Snapshot...")
        await websocket.send(json.dumps({"type": "GET_STATE_SNAPSHOT"}))
        
        response = await websocket.recv()
        print(f"Snapshot received: {response}")

if __name__ == "__main__":
    test_api()
    # To run WS test, use: asyncio.run(test_ws())
