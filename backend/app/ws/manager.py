"""
WebSocket Connection Manager — handles per-lobby connections, broadcast, and targeted sends.
"""
from fastapi import WebSocket
from typing import Dict, List, Any, Optional
import json


class ConnectionManager:
    def __init__(self):
        # lobby_id -> list of (user_id, websocket) tuples
        self.active_connections: Dict[str, List[tuple[int, WebSocket]]] = {}

    async def connect(self, lobby_id: str, user_id: int, websocket: WebSocket):
        await websocket.accept()
        if lobby_id not in self.active_connections:
            self.active_connections[lobby_id] = []
        self.active_connections[lobby_id].append((user_id, websocket))

    def disconnect(self, lobby_id: str, websocket: WebSocket):
        if lobby_id in self.active_connections:
            self.active_connections[lobby_id] = [
                (uid, ws) for uid, ws in self.active_connections[lobby_id] if ws != websocket
            ]

    async def broadcast(self, lobby_id: str, message: dict):
        """Send message to ALL connections in a lobby."""
        if lobby_id in self.active_connections:
            message_str = json.dumps(message, default=str)
            dead = []
            for uid, ws in self.active_connections[lobby_id]:
                try:
                    await ws.send_text(message_str)
                except Exception:
                    dead.append(ws)
            # Clean dead connections
            if dead:
                self.active_connections[lobby_id] = [
                    (uid, ws) for uid, ws in self.active_connections[lobby_id] if ws not in dead
                ]

    async def send_to_user(self, lobby_id: str, user_id: int, message: dict):
        """Send message to a SPECIFIC user in a lobby."""
        if lobby_id in self.active_connections:
            message_str = json.dumps(message, default=str)
            for uid, ws in self.active_connections[lobby_id]:
                if uid == user_id:
                    try:
                        await ws.send_text(message_str)
                    except Exception:
                        pass

    def get_connection_count(self, lobby_id: str) -> int:
        return len(self.active_connections.get(lobby_id, []))


manager = ConnectionManager()


# ── Broadcast helpers ─────────────────────────────────────────

async def broadcast_odds_update(lobby_id: str, market_id: int, market_type: str, odds: dict):
    await manager.broadcast(lobby_id, {
        "event_name": "ODDS_UPDATE",
        "market_id": market_id,
        "type": market_type,
        "odds": odds,
    })

async def broadcast_market_closed(lobby_id: str, market_id: int, market_type: str):
    await manager.broadcast(lobby_id, {
        "event_name": "MARKET_CLOSED",
        "market_id": market_id,
        "type": market_type,
    })

async def broadcast_bet_placed(lobby_id: str, user_id: int, market_type: str, selection: str, amount: float):
    await manager.broadcast(lobby_id, {
        "event_name": "BET_PLACED",
        "user_id": user_id,
        "market_type": market_type,
        "selection_key": selection,
        "amount": amount,
    })

async def broadcast_bet_canceled(lobby_id: str, user_id: int, bet_id: int, refund: float):
    await manager.broadcast(lobby_id, {
        "event_name": "BET_CANCELED",
        "user_id": user_id,
        "bet_id": bet_id,
        "refund": refund,
    })

async def send_balance_update(lobby_id: str, user_id: int, total: float, locked: float):
    await manager.send_to_user(lobby_id, user_id, {
        "event_name": "BALANCE_UPDATE",
        "user_id": user_id,
        "balance_total": total,
        "balance_locked": locked,
        "balance_available": round(total - locked, 2),
    })

async def broadcast_power_telegraph(lobby_id: str, caster_id: int, power_id: str, target_id: str, telegraph_ms: int):
    await manager.broadcast(lobby_id, {
        "event_name": "POWER_TELEGRAPH",
        "caster_id": caster_id,
        "power_id": power_id,
        "target_id": target_id,
        "telegraph_ms": telegraph_ms,
    })

async def broadcast_power_applied(lobby_id: str, power_id: str, target_id: str, duration_s: float, pity_active: bool = False):
    await manager.broadcast(lobby_id, {
        "event_name": "POWER_APPLIED",
        "power_id": power_id,
        "target_id": target_id,
        "effective_duration_s": duration_s,
        "pity_shield_active": pity_active,
    })

async def broadcast_loan_event(lobby_id: str, event_name: str, loan_data: dict):
    """Generic loan event broadcast: LOAN_CREATED, LOAN_ACCEPTED, LOAN_REPAID, CONTRACT_BREACHED"""
    await manager.broadcast(lobby_id, {
        "event_name": event_name,
        **loan_data,
    })
