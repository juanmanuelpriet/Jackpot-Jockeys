import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';

/**
 * Mobile API Client — resolves API base URL from:
 * 1. ?api= query param (saved in sessionStorage)
 * 2. VITE_API_BASE_URL env var
 * 3. Fallback: window.location.hostname:8000
 */
const getApiBase = (): string => {
    // 1. Check for session override (useful for scanned QR codes)
    const override = sessionStorage.getItem('VITE_API_OVERRIDE');
    if (override) return decodeURIComponent(override);

    // 2. Fallback: use current page hostname:8000 (correct for LAN mobile access)
    // Avoid localhost if accessing from a real device
    return `${window.location.protocol}//${window.location.hostname}:8000`;
};

const mobileApi = axios.create({
    baseURL: getApiBase(),
});

// --- Auth ---
export const setMobileToken = (token: string) => {
    mobileApi.defaults.headers.common['Authorization'] = `Bearer ${token}`;
};

export const joinLobby = async (username: string, joinCode: string) => {
    const response = await mobileApi.post('/auth/join', {
        username,
        join_code: joinCode,
    });
    return response.data; // { access_token, token_type, user_id }
};

// --- Bets ---
export const placeBet = async (raceId: number, marketId: number, selectionKey: string, amount: number) => {
    const response = await mobileApi.post('/bets', {
        race_id: raceId,
        market_id: marketId,
        selection_key: selectionKey,
        amount,
    }, {
        headers: { 'X-Idempotency-Key': uuidv4() }
    });
    return response.data;
};

export const cancelBet = async (betId: number) => {
    const response = await mobileApi.delete(`/bets/${betId}`);
    return response.data;
};

// --- Powers ---
export const getPowers = async () => {
    const response = await mobileApi.get('/powers');
    return response.data;
};

export const castPower = async (powerId: string, targetId: string) => {
    const response = await mobileApi.post('/powers/cast', {
        power_id: powerId,
        target_id: targetId,
    }, {
        headers: { 'X-Idempotency-Key': uuidv4() }
    });
    return response.data;
};

// --- Wallet ---
export const getWallet = async () => {
    const response = await mobileApi.get('/wallet');
    return response.data;
};

/** Helper to get the WebSocket base URL for connecting */
export const getWsBase = (): string => {
    const override = sessionStorage.getItem('VITE_API_OVERRIDE');
    const base = override ? decodeURIComponent(override) : (import.meta.env.VITE_WS_BASE_URL || `ws://${window.location.hostname}:8000`);
    return base.replace(/^http/, 'ws') + '/ws';
};

export default mobileApi;
