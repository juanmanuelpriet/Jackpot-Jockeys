from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, JSON, UniqueConstraint, Index, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.database import Base

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    wallet = relationship("Wallet", back_populates="user", uselist=False)
    bets = relationship("Bet", back_populates="user")

class Wallet(Base):
    __tablename__ = "wallets"
    user_id = Column(Integer, ForeignKey("users.id"), primary_key=True)
    balance_total = Column(Float, default=1000.0)
    balance_locked = Column(Float, default=0.0)
    lifetime_earned = Column(Float, default=0.0)
    lifetime_wagered = Column(Float, default=0.0)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    user = relationship("User", back_populates="wallet")

class Race(Base):
    __tablename__ = "races"
    id = Column(Integer, primary_key=True, index=True)
    lobby_id = Column(String, index=True)
    current_state = Column(String, default="Lobby") # Lobby, BettingOpen, RaceRunning, Settling, Results
    state_entered_at = Column(DateTime(timezone=True), server_default=func.now())
    state_version = Column(Integer, default=1) # Incremented on every transition
    race_seed = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    ended_at = Column(DateTime(timezone=True), nullable=True)

class Market(Base):
    __tablename__ = "markets"
    id = Column(Integer, primary_key=True, index=True)
    race_id = Column(Integer, ForeignKey("races.id"))
    type = Column(String) # Win, Place, Show, Trifecta
    status = Column(String, default="Open") # Open, Closed
    rake_pct = Column(Float, default=0.10)

class MarketSelection(Base):
    __tablename__ = "market_selections"
    id = Column(Integer, primary_key=True, index=True)
    market_id = Column(Integer, ForeignKey("markets.id"))
    selection_key = Column(String) # e.g., "horse_1"
    pool_amount = Column(Float, default=0.0)

class Bet(Base):
    __tablename__ = "bets"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    market_id = Column(Integer, ForeignKey("markets.id"))
    selection_key = Column(String)
    amount = Column(Float)
    status = Column(String, default="Active") # Active, Canceled, Won, Lost
    payout_amount = Column(Float, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="bets")

class IdempotencyKey(Base):
    __tablename__ = "idempotency_keys"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    key = Column(String, index=True)
    endpoint = Column(String)
    request_hash = Column(String)
    response_json = Column(JSON)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint('user_id', 'key', 'endpoint', name='_user_idempotency_uc'),
    )

class AuditLog(Base):
    __tablename__ = "audit_log"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    action = Column(String) # e.g., "BET_PLACED", "POWER_CAST", "BET_CANCELED"
    delta_json = Column(JSON) # e.g., {"balance_total": -50}
    metadata_json = Column(JSON)
    idempotency_key = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class Loan(Base):
    __tablename__ = "loans"
    id = Column(Integer, primary_key=True, index=True)
    lender_id = Column(Integer, ForeignKey("users.id"), nullable=True) # None = NPC Bank
    borrower_id = Column(Integer, ForeignKey("users.id"))
    amount = Column(Float)
    interest_rate = Column(Float)
    status = Column(String, default="Pending") # Pending, Active, Paid, Defaulted
    favor_id = Column(Integer, ForeignKey("favors.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class Favor(Base):
    __tablename__ = "favors"
    id = Column(Integer, primary_key=True, index=True)
    type = Column(String) # e.g., "Silence", "Vassal"
    target_user_id = Column(Integer, ForeignKey("users.id"))
    duration_races = Column(Integer)
    is_active = Column(Boolean, default=True)
