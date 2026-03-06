from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, JSON, UniqueConstraint, Index, Boolean, CheckConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.database import Base

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    role = Column(String, default="player")  # "player" or "admin"
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
    # updated_at uses SQLAlchemy onupdate: fires at app layer on every UPDATE, no DB trigger needed.
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    user = relationship("User", back_populates="wallet")

    __table_args__ = (
        CheckConstraint('balance_total >= 0', name='ck_wallet_total_positive'),
        CheckConstraint('balance_locked >= 0', name='ck_wallet_locked_positive'),
        CheckConstraint('balance_locked <= balance_total', name='ck_wallet_locked_le_total'),
    )

# ── Lobbies ───────────────────────────────────────────────────

class Lobby(Base):
    """Formal lobby table. id is VARCHAR matching existing races.lobby_id strings
    (Option B migration: no FK breakage, just enriches the string)."""
    __tablename__ = "lobbies"
    id = Column(String, primary_key=True)  # e.g. "LOBBY_A1" — matches races.lobby_id
    join_code = Column(String(8), unique=True, index=True)  # 6-char code for QR/manual join
    name = Column(String, default="Lobby")
    host_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    max_players = Column(Integer, default=8)
    current_race_id = Column(Integer, ForeignKey("races.id"), nullable=True)
    status = Column(String, default="Waiting")  # Waiting, Active, Closed
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class Race(Base):
    __tablename__ = "races"
    id = Column(Integer, primary_key=True, index=True)
    lobby_id = Column(String, index=True)  # Matches Lobby.id (VARCHAR, not FK for MVP compat)
    current_state = Column(String, default="Lobby")  # Lobby, BettingOpen, RaceRunning, Settling, Results, Ended
    state_entered_at = Column(DateTime(timezone=True), server_default=func.now())
    state_version = Column(Integer, default=1)  # Incremented on every transition
    race_seed = Column(String, nullable=True)
    num_horses = Column(Integer, default=6)
    world_config_hash = Column(String, nullable=True)  # sha256 of WorldConfig for replay verification
    replay_log = Column(JSON, nullable=True)  # Full ReplayLog JSONB for deterministic replay
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    ended_at = Column(DateTime(timezone=True), nullable=True)
    settled_at = Column(DateTime(timezone=True), nullable=True)

class Market(Base):
    __tablename__ = "markets"
    id = Column(Integer, primary_key=True, index=True)
    race_id = Column(Integer, ForeignKey("races.id"))
    type = Column(String)  # Win, Place, Show, Trifecta
    status = Column(String, default="Open")  # Open, Closed, Settled
    rake_pct = Column(Float, default=0.10)
    closed_at = Column(DateTime(timezone=True), nullable=True)

class MarketSelection(Base):
    __tablename__ = "market_selections"
    id = Column(Integer, primary_key=True, index=True)
    market_id = Column(Integer, ForeignKey("markets.id"))
    selection_key = Column(String)  # e.g., "horse_1"
    pool_amount = Column(Float, default=0.0)

class Bet(Base):
    __tablename__ = "bets"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    market_id = Column(Integer, ForeignKey("markets.id"))
    selection_key = Column(String)
    amount = Column(Float)
    status = Column(String, default="Active")  # Active, Canceled, Won, Lost, Refunded
    payout_amount = Column(Float, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    settled_at = Column(DateTime(timezone=True), nullable=True)

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
    action = Column(String)
    delta_json = Column(JSON)
    metadata_json = Column(JSON)
    idempotency_key = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class Loan(Base):
    __tablename__ = "loans"
    id = Column(Integer, primary_key=True, index=True)
    lender_id = Column(Integer, ForeignKey("users.id"), nullable=True)  # None = NPC Bank
    borrower_id = Column(Integer, ForeignKey("users.id"))
    amount = Column(Float)
    interest_rate = Column(Float)
    amount_paid = Column(Float, default=0.0)
    amount_due = Column(Float, nullable=True)
    status = Column(String, default="Pending")  # Pending, Active, Paid, Defaulted
    favor_id = Column(Integer, ForeignKey("favors.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class Favor(Base):
    __tablename__ = "favors"
    id = Column(Integer, primary_key=True, index=True)
    type = Column(String)
    target_user_id = Column(Integer, ForeignKey("users.id"))
    duration_races = Column(Integer)
    is_active = Column(Boolean, default=True)

# ── P0 tables ─────────────────────────────────────────────────

class PowerCastEvent(Base):
    """Records every power cast, scoped to a race.
    Used for: cap enforcement, cooldown tracking, anti-focus counts."""
    __tablename__ = "power_cast_events"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    race_id = Column(Integer, ForeignKey("races.id"))
    power_id = Column(String)
    target_id = Column(String)
    cost = Column(Float)
    effective_duration_s = Column(Float, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index('ix_pce_user_race', 'user_id', 'race_id'),
        Index('ix_pce_race_target', 'race_id', 'target_id'),
    )


class RaceResult(Base):
    """Stores the final placements produced by the race sim stub."""
    __tablename__ = "race_results"
    id = Column(Integer, primary_key=True, index=True)
    race_id = Column(Integer, ForeignKey("races.id"))
    horse_id = Column(String)
    position = Column(Integer)
    finish_time_ms = Column(Integer)
