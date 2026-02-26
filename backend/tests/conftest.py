import pytest
import asyncio
import httpx
from sqlalchemy.orm import Session
from app.db.database import SessionLocal, Base, engine
from app.db import models
from app.settings import settings
from datetime import datetime

# URL points to the local server (assuming docker compose is running or local uvicorn)
BASE_URL = "http://localhost:8000"
WS_URL = "ws://localhost:8000/ws"

@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()

@pytest.fixture(scope="function")
def db_session():
    """Provides a clean database session for each test."""
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()

@pytest.fixture(scope="function")
def clean_db():
    """Wipes critical tables before/after tests."""
    # Note: In a production-like test, we might use a separate database schema
    session = SessionLocal()
    session.query(models.Bet).delete()
    session.query(models.MarketSelection).delete()
    session.query(models.Market).delete()
    session.query(models.Race).delete()
    session.query(models.Wallet).delete()
    session.query(models.User).delete()
    session.query(models.IdempotencyKey).delete()
    session.query(models.AuditLog).delete()
    session.commit()
    session.close()

@pytest.fixture
async def api_client():
    async with httpx.AsyncClient(base_url=BASE_URL, timeout=10.0) as client:
        yield client

@pytest.fixture
async def auth_token(api_client):
    """Joins a lobby and returns a JWT token."""
    response = await api_client.post("/auth/join", json={
        "username": f"test_user_{datetime.now().timestamp()}",
        "lobby_id": "TEST_LOBBY"
    })
    return response.json()["access_token"]

@pytest.fixture
def setup_race(db_session):
    """Creates a race and market for testing."""
    race = models.Race(lobby_id="TEST_LOBBY", current_state="BettingOpen")
    db_session.add(race)
    db_session.commit()
    db_session.refresh(race)
    
    market = models.Market(race_id=race.id, type="Win", rake_pct=0.10)
    db_session.add(market)
    db_session.commit()
    db_session.refresh(market)
    
    selection = models.MarketSelection(market_id=market.id, selection_key="horse_1", pool_amount=0.0)
    db_session.add(selection)
    db_session.commit()
    
    return race, market, selection
