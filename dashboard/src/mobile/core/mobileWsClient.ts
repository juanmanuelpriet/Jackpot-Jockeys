import { useMobileStore } from './mobileStore';
import { getWsBase } from './mobileApi';

let socket: WebSocket | null = null;
let pingInterval: ReturnType<typeof setInterval> | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let currentToken = '';
let retryCount = 0;
const MAX_BACKOFF = 5000;
const processedEvents = new Set<string>();

// ── Public API ──

export const connectMobileWS = (token: string) => {
    // Prevent double-mount (React 18 StrictMode)
    if (socket?.readyState === WebSocket.OPEN || socket?.readyState === WebSocket.CONNECTING) {
        if (currentToken === token) return;
        disconnectMobileWS();
    }

    currentToken = token;
    doConnect();

    // Safari iOS Rescue: when user returns from background, force resync
    document.addEventListener('visibilitychange', handleVisibility);
};

export const disconnectMobileWS = () => {
    document.removeEventListener('visibilitychange', handleVisibility);
    cleanup();
    currentToken = '';
    retryCount = 0;
};

// ── Internals ──

const handleVisibility = () => {
    if (document.visibilityState === 'visible' && currentToken) {
        if (!socket || socket.readyState !== WebSocket.OPEN) {
            cleanup();
            doConnect();
        } else {
            socket.send(JSON.stringify({ type: 'GET_STATE_SNAPSHOT' }));
        }
    }
};

const doConnect = () => {
    if (socket) return;

    const wsUrl = `${getWsBase()}?token=${currentToken}`;
    socket = new WebSocket(wsUrl);

    socket.onopen = () => {
        console.log('[Mobile WS] Connected');
        retryCount = 0;
        socket?.send(JSON.stringify({ type: 'GET_STATE_SNAPSHOT' }));

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
            handleEvent(data);
        } catch (err) {
            console.error('[Mobile WS] Parse error', err);
        }
    };

    socket.onclose = () => {
        console.log('[Mobile WS] Disconnected');
        cleanup();
        const backoff = Math.min(500 * Math.pow(2, retryCount), MAX_BACKOFF);
        retryCount++;
        reconnectTimer = setTimeout(doConnect, backoff);
    };

    socket.onerror = (err) => {
        console.error('[Mobile WS] Error:', err);
    };
};

const cleanup = () => {
    if (socket) {
        socket.onclose = null;
        socket.close();
        socket = null;
    }
    if (pingInterval) clearInterval(pingInterval);
    if (reconnectTimer) clearTimeout(reconnectTimer);
};

// ── Event Handler ──

const handleEvent = (event: any) => {
    const store = useMobileStore.getState();
    const myUserId = store.user?.id;

    // Dedupe narrative events
    const hash = event.event_name + '_' + (event.data?.timestamp || JSON.stringify(event.data).length + '_' + Date.now());
    const isNarrative = ['BET_PLACED', 'POWER_APPLIED', 'SETTLEMENT_COMPLETE', 'BET_REJECTED'].includes(event.event_name);
    if (isNarrative) {
        if (processedEvents.has(hash)) return;
        processedEvents.add(hash);
        if (processedEvents.size > 300) {
            const first = processedEvents.values().next().value;
            if (first) processedEvents.delete(first);
        }
    }

    // Version guard
    if (event.data?.state_version && store.race) {
        if (event.data.state_version > store.race.state_version + 1) {
            socket?.send(JSON.stringify({ type: 'GET_STATE_SNAPSHOT' }));
            return;
        }
    }

    switch (event.event_name) {
        case 'STATE_SNAPSHOT':
            store.setSnapshot(event.data);
            break;

        case 'RACE_STATE_CHANGED': {
            const newState = event.data.new_state;
            store.updateRaceState(newState, event.data.state_version);

            const stateLabels: Record<string, string> = {
                'BettingOpen': '🎰 ¡Apuestas abiertas!',
                'RaceRunning': '🏇 ¡Carrera en curso!',
                'Settling': '💰 Liquidando resultados...',
                'Results': '🏁 ¡Resultados listos!',
                'Ended': '🔚 Carrera finalizada.',
            };
            store.addToast('info', stateLabels[newState] || `Estado: ${newState}`);
            break;
        }

        case 'ODDS_UPDATE':
            store.updateOdds(event.data.market_id, event.data.odds);
            break;

        case 'MARKET_CLOSED':
            store.addToast('warning', '🔒 Mercado cerrado — no más apuestas.');
            break;

        case 'BALANCE_UPDATE':
            if (event.data.user_id === myUserId) {
                store.updateWallet(event.data.balance_total, event.data.balance_locked);
            }
            break;

        case 'BET_PLACED':
            if (event.data.user_id === myUserId) {
                store.addToast('success', `✅ Apuesta de $${event.data.amount} confirmada.`);
                store.addActivity({
                    id: `bet_${Date.now()}`,
                    type: 'bet',
                    text: `Apostaste $${event.data.amount} a ${event.data.selection_key}`,
                    amount: -event.data.amount,
                    time: new Date(),
                });
            }
            break;

        case 'BET_REJECTED':
            if (event.data.user_id === myUserId) {
                store.addToast('error', `❌ Apuesta rechazada: ${event.data.reason || 'Error'}`);
            }
            break;

        case 'BET_CANCELED':
            if (event.data.user_id === myUserId) {
                store.addToast('info', `↩️ Apuesta cancelada. Reembolso: $${event.data.refund}`);
                store.addActivity({
                    id: `cancel_${Date.now()}`,
                    type: 'bet',
                    text: `Apuesta cancelada (reembolso $${event.data.refund})`,
                    amount: event.data.refund,
                    time: new Date(),
                });
            }
            break;

        case 'POWER_APPLIED':
            store.addToast('warning', `⚡ Poder ${event.data.power_id} activado sobre ${event.data.target_id}`);
            store.addActivity({
                id: `pwr_${Date.now()}`,
                type: 'power',
                text: `Poder ${event.data.power_id} → ${event.data.target_id}`,
                time: new Date(),
            });
            break;

        case 'POWER_EXPIRED':
            // Silent — no toast needed
            break;

        case 'SETTLEMENT_COMPLETE':
            store.addToast('success', '🏁 ¡Carrera terminada! Revisá tu billetera.');
            store.addActivity({
                id: `settle_${Date.now()}`,
                type: 'settlement',
                text: '¡Liquidación completada!',
                time: new Date(),
            });
            // Request fresh snapshot to get final wallet
            socket?.send(JSON.stringify({ type: 'GET_STATE_SNAPSHOT' }));
            break;

        default:
            break;
    }
};
