import { useGameStore } from './store';

const WS_URL = 'ws://localhost:8000/ws';
let socket: WebSocket | null = null;
let reconnectInterval: ReturnType<typeof setInterval> | null = null;
let pingInterval: ReturnType<typeof setInterval> | null = null;

export const connectWS = (token: string) => {
    if (socket) return;

    const connect = () => {
        socket = new WebSocket(`${WS_URL}?token=${token}`);

        socket.onopen = () => {
            console.log('WS Connected');
            if (reconnectInterval) clearInterval(reconnectInterval);

            // Request initial state snapshot
            socket?.send(JSON.stringify({ type: 'GET_STATE_SNAPSHOT' }));

            // Ping every 30s
            if (pingInterval) clearInterval(pingInterval);
            pingInterval = setInterval(() => {
                socket?.send(JSON.stringify({ type: 'PING' }));
            }, 30000);
        };

        socket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                handleWSEvent(data);
            } catch (err) {
                console.error("Failed to parse WS message", err);
            }
        };

        socket.onclose = () => {
            console.log('WS Disconnected, reconnecting...');
            socket = null;
            if (pingInterval) clearInterval(pingInterval);
            if (!reconnectInterval) {
                reconnectInterval = setInterval(connect, 3000);
            }
        };
    };

    connect();
};

export const disconnectWS = () => {
    if (socket) {
        socket.close();
        socket = null;
    }
    if (reconnectInterval) clearInterval(reconnectInterval);
    if (pingInterval) clearInterval(pingInterval);
};

const handleWSEvent = (event: any) => {
    const store = useGameStore.getState();

    // All payloads structure is usually {"event_name": string, "data": ...}
    switch (event.event_name) {
        case 'STATE_SNAPSHOT':
            store.setSnapshot(event.data);
            break;

        case 'RACE_STATE_CHANGED':
            store.updateRaceState(event.data.new_state, event.data.state_version);
            store.addLog({ type: 'system', text: `La carrera ahora está: ${event.data.new_state}`, time: new Date() });
            break;

        case 'STATE_SYNC':
            // Ignored for now unless we need the exact millisecond sync
            break;

        case 'ODDS_UPDATE':
            store.updateOdds(event.data.market_id, event.data.odds);
            break;

        case 'BALANCE_UPDATE':
            store.updateWallet(event.data.user_id, event.data.balance_total, event.data.balance_locked);
            break;

        case 'BET_PLACED':
            store.addLog({
                type: 'bet',
                user_id: event.data.user_id,
                text: `Jugador ${event.data.user_id} apostó $${event.data.amount} a ${event.data.selection_key}`,
                time: new Date()
            });
            // A STATE_SNAPSHOT request here could be used to sync pool exact amounts if not fully reactive
            break;

        case 'POWER_APPLIED':
            store.addLog({
                type: 'power',
                text: `¡PODER ACTIVADO! ${event.data.power_id} sobre ${event.data.target_id}`,
                time: new Date()
            });
            break;

        case 'SETTLEMENT_COMPLETE':
            store.addLog({
                type: 'system',
                text: `¡CARRERA TERMINADA! Resultados resueltos.`,
                time: new Date()
            });
            socket?.send(JSON.stringify({ type: 'GET_STATE_SNAPSHOT' }));
            break;

        default:
            console.log('Unhandled WS Event:', event);
    }
};
