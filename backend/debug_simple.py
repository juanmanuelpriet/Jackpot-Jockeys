import httpx
import asyncio

async def test():
    async with httpx.AsyncClient(base_url="http://localhost:8000") as client:
        # Join
        res = await client.post("/auth/join", json={"username": "test_user", "lobby_id": "TEST"})
        data = res.json()
        token = data["access_token"]
        print(f"Token: {token}")
        
        # We need a race and market. Let's create them via admin if possible, 
        # or just use the fact that auth/join created a race.
        # But we need a market for the bet.
        
        # Let's just try the bet and see the 422 detail
        payload = {"race_id": 1, "market_id": 1, "selection_key": "h1", "amount": 10.0}
        headers = {"Authorization": f"Bearer {token}", "X-Idempotency-Key": "key1"}
        res = await client.post("/bets", json=payload, headers=headers)
        print(f"Status: {res.status_code}")
        print(f"Body: {res.text}")

if __name__ == "__main__":
    asyncio.run(test())
