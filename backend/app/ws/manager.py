from fastapi import WebSocket
from typing import Dict, List, Any
import json

class ConnectionManager:
    def __init__(self):
        # lobby_id -> list of websockets
        self.active_connections: Dict[str, List[WebSocket]] = {}

    async def connect(self, lobby_id: str, websocket: WebSocket):
        await websocket.accept()
        if lobby_id not in self.active_connections:
            self.active_connections[lobby_id] = []
        self.active_connections[lobby_id].append(websocket)

    def disconnect(self, lobby_id: str, websocket: WebSocket):
        if lobby_id in self.active_connections:
            self.active_connections[lobby_id].remove(websocket)

    async def broadcast(self, lobby_id: str, message: dict):
        if lobby_id in self.active_connections:
            message_str = json.dumps(message, default=str)
            for connection in self.active_connections[lobby_id]:
                await connection.send_text(message_str)

manager = ConnectionManager()
