from app.db.database import SessionLocal
from app.db import models
import httpx
import asyncio

async def diagnose():
    db = SessionLocal()
    try:
        # 1. Clean and Setup
        db.query(models.Bet).delete()
        db.query(models.Market).delete()
        db.query(models.Race).delete()
        db.query(models.User).delete()
        
        user = models.User(username="diag_user")
        db.add(user)
        db.commit()
        db.refresh(user)
        
        race = models.Race(lobby_id="DIAG", current_state="BettingOpen")
        db.add(race)
        db.commit()
        db.refresh(race)
        
        market = models.Market(race_id=race.id, type="Win")
        db.add(market)
        db.commit()
        db.refresh(market)
        
        selection = models.MarketSelection(market_id=market.id, selection_key="horse_1")
        db.add(selection)
        
        wallet = models.Wallet(user_id=user.id, balance_total=1000.0)
        db.add(wallet)
        db.commit()

        print(f"DEBUG: user_id={user.id}, race_id={race.id}, market_id={market.id}")

        async with httpx.AsyncClient(base_url="http://localhost:8000") as client:
            # Join to get token
            join_res = await client.post("/auth/join", json={"username": user.username, "lobby_id": "DIAG"})
            token = join_res.json()["access_token"]
            
            # Place bet
            payload = {
                "race_id": race.id,
                "market_id": market.id,
                "selection_key": "horse_1",
                "amount": 50.0
            }
            res = await client.post(
                "/bets", 
                json=payload, 
                headers={"Authorization": f"Bearer {token}", "X-Idempotency-Key": "diag-key"}
            )
            print(f"STATUS: {res.status_code}")
            print(f"RESPONSE: {res.text}")
            
    finally:
        db.close()

if __name__ == "__main__":
    asyncio.run(diagnose())
