import { useGameStore } from './store';

const WS_BASE = import.meta.env.VITE_WS_BASE_URL || `ws://${window.location.hostname}:8000/ws`;

let socket: WebSocket | null = null;
let pingInterval: ReturnType<typeof setInterval> | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let currentToken = '';
let retryCount = 0;
const MAX_BACKOFF = 5000;

export const connectWS = (token: string) => {
    if (socket?.readyState === WebSocket.OPEN || socket?.readyState === WebSocket.CONNECTING) {
        if (currentToken !== token) {
            disconnectWS(); // Force disconnect if token changed
        } else {
            return; // Already connecting/connected with same token
        }
    }

    currentToken = token;

    const connect = () => {
        if (socket) return;

        socket = new WebSocket(`${WS_BASE}?token=${currentToken}`);

        socket.onopen = () => {
            console.log('WS Connected');
            retryCount = 0; // Reset backoff on success

            // Request initial state snapshot
            socket?.send(JSON.stringify({ type: 'GET_STATE_SNAPSHOT' }));

            // Ping every 30s
            if (pingInterval) clearInterval(pingInterval);
            pingInterval = setInterval(() => {
                if (socket?.readyState === WebSocket.OPEN) {
                    socket.send(JSON.stringify({ type: 'PING' }));
                }
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
            console.log('WS Disconnected');
            cleanupSocket();

            // Exponential Backoff algorithm: 0.5s, 1s, 2s, 4s, bounded to 5s max
            const backoff = Math.min(500 * Math.pow(2, retryCount), MAX_BACKOFF);
            retryCount++;

            console.log(`Reconnecting in ${backoff}ms...`);
            reconnectTimer = setTimeout(connect, backoff);
        };

        socket.onerror = (err) => {
            // WS close event will be triggered automatically, handle reconnect there
            console.error('WS Error:', err);
        };
    };

    connect();
};

const cleanupSocket = () => {
    if (socket) {
        socket.onclose = null; // Prevent trigger loop
        socket.close();
        socket = null;
    }
    if (pingInterval) clearInterval(pingInterval);
    if (reconnectTimer) clearTimeout(reconnectTimer);
}

export const disconnectWS = () => {
    cleanupSocket();
    currentToken = '';
    retryCount = 0;
};

const processedEventTokens = new Set<string>();

// Anti-spam aggregator state outside React
let betFrenzyTimer: ReturnType<typeof setTimeout> | null = null;
let currentFrenzyTotal = 0;
let currentFrenzyCount = 0;

const handleWSEvent = (event: any) => {
    const store = useGameStore.getState();

    // Basic Hash Dedupe for Narrative Logs
    // Create a unique key using event timestamp & type (or fallback to full stringify)
    // Ensures Strict Mode double-render won't duplicate "Frenzy" or "Placed" events exactly
    const eventHash = event.event_name + "_" + (event.timestamp || JSON.stringify(event).length + "_" + Date.now());

    // For dedupe: only narrative events need this (to not spam log). State mapping is inherently idempotent.
    const isNarrativeEvent = ['BET_PLACED', 'POWER_APPLIED', 'SETTLEMENT_COMPLETE'].includes(event.event_name);
    if (isNarrativeEvent) {
        if (processedEventTokens.has(eventHash)) return;
        processedEventTokens.add(eventHash);
        if (processedEventTokens.size > 300) {
            // Naive LRU pop
            const firstKey = processedEventTokens.values().next().value;
            if (firstKey) processedEventTokens.delete(firstKey);
        }
    }

    // 1. Version Guard Check
    // If we receive an event that dictates a state version that jumps more than +1
    // we request a full resync to guarantee consistency.
    if (event.state_version && store.race) {
        const localVersion = store.race.state_version;
        const incomingVersion = event.state_version;
        if (incomingVersion > localVersion + 1) {
            console.warn(`Version jump detected! Local: ${localVersion}, Incoming: ${incomingVersion}. Requesting Snapshot.`);
            socket?.send(JSON.stringify({ type: 'GET_STATE_SNAPSHOT' }));
            return;
        }
    }

    // 2. Dispatchers
    switch (event.event_name) {
        case 'STATE_SNAPSHOT':
            store.setSnapshot(event);
            break;

        case 'RACE_STATE_CHANGED':
            store.updateRaceState(event.new_state, event.state_version);
            store.addLog({ type: 'system', text: `📢 La carrera avanzó a: ${event.new_state}`, time: new Date() });
            break;

        case 'STATE_SYNC':
            // Ignored for MVP
            break;

        case 'ODDS_UPDATE':
            store.updateOdds(event.market_id, event.odds);
            break;

        case 'BALANCE_UPDATE':
            store.updateWallet(event.user_id, event.balance_total, event.balance_locked);
            break;

        case 'BET_PLACED':
            // Anti-Spam Aggregator
            currentFrenzyTotal += parseFloat(event.amount) || 0;
            currentFrenzyCount++;

            if (betFrenzyTimer) clearTimeout(betFrenzyTimer);

            betFrenzyTimer = setTimeout(() => {
                if (currentFrenzyCount > 1) {
                    store.addLog({
                        type: 'bet',
                        text: `🔥 ¡FRENESÍ DE APUESTAS! ${currentFrenzyCount} jugadores acaban de meter $${currentFrenzyTotal.toFixed(2)} al pozo en segundos.`,
                        time: new Date()
                    });
                } else {
                    import('./logger').then(({ getRandomBetPhrase }) => {
                        store.addLog({
                            type: 'bet',
                            text: getRandomBetPhrase(event.user_id, event.amount, event.selection_key),
                            time: new Date()
                        });
                    });
                }
                currentFrenzyTotal = 0;
                currentFrenzyCount = 0;
            }, 1500); // 1.5s window

            break;

        case 'POWER_APPLIED':
            import('./logger').then(({ getRandomPowerPhrase }) => {
                store.addLog({
                    type: 'power',
                    text: getRandomPowerPhrase(event.power_id, event.target_id),
                    time: new Date()
                });
            });
            store.addActivePower(event.power_id, event.target_id);
            break;

        case 'POWER_EXPIRED':
            store.removeActivePower(event.power_id, event.target_id);
            break;

        case 'SETTLEMENT_COMPLETE':
            store.addLog({
                type: 'system',
                text: `🏁 ¡CARRERA TERMINADA! Calculando dividendos y pateando billeteras...`,
                time: new Date()
            });
            socket?.send(JSON.stringify({ type: 'GET_STATE_SNAPSHOT' }));
            break;

        case 'MINI_SETTLEMENT_COMPLETE':
            store.addLog({
                type: 'system',
                text: `🏆 Mini-settlement: ${event.market_type || '???'} — ¡${(event.winner || '???').replace('_', ' ').toUpperCase()} gana el parcial!`,
                time: new Date()
            });
            socket?.send(JSON.stringify({ type: 'GET_STATE_SNAPSHOT' }));
            break;

        case 'TICK_UPDATE':
            store.updateHorseTelemetry(event.tick || 0, event.horses || []);
            break;

        case 'RACE_FINISHED':
            store.addLog({
                type: 'system',
                text: `🏁 ¡CARRERA TERMINADA! ${event.placements?.[0]?.horse_id?.replace('_', ' ').toUpperCase() || '???'} gana en el tick ${event.tick || '?'}!`,
                time: new Date()
            });
            break;

        case 'COLLISION_EVENT':
            store.addLog({
                type: 'system',
                text: `💥 ¡${(event.horse_a || '???').replace('_', ' ').toUpperCase()} y ${(event.horse_b || '???').replace('_', ' ').toUpperCase()} chocan en la pista!`,
                time: new Date()
            });
            break;

        case 'HAZARD_EVENT':
            store.addLog({
                type: 'system',
                text: `⚠️ ${(event.data?.horse_id || event.horse_id || '???').replace('_', ' ').toUpperCase()} pisa ${event.data?.hazard_id || event.hazard_id || 'trampa'}!`,
                time: new Date()
            });
            break;

        case 'GLOBAL_EVENT':
            store.addLog({
                type: 'system',
                text: `🌪️ ¡EVENTO GLOBAL: ${event.data?.type || event.type || '???'}!`,
                time: new Date()
            });
            break;

        case 'PLAYER_JOINED':
            store.addConnectedPlayer(event.user_id, event.username);
            break;

        case 'PLAYER_LEFT':
            store.removeConnectedPlayer(event.user_id);
            break;

        case 'LAP_CHECKPOINT_EVENT':
            if (event.data?.is_lap_complete || event.is_lap_complete) {
                store.addLog({
                    type: 'system',
                    text: `🔄 ${(event.data?.horse_id || event.horse_id || '???').replace('_', ' ').toUpperCase()} completa la vuelta ${event.data?.lap || event.lap}!`,
                    time: new Date()
                });
            }
            break;

        case 'POWER_TELEGRAPH':
            store.addLog({
                type: 'power',
                text: `📡 ¡Poder ${event.data?.power_id || '???'} apuntando a ${(event.data?.target_id || '???').replace('_', ' ')}! Impacto inminente...`,
                time: new Date()
            });
            break;

        default:
            console.log('Unhandled WS Event:', event);
    }
};
