import axios from 'axios';

// Get LAN IP automatically based on where the browser is serving the app
const API_BASE = import.meta.env.VITE_API_BASE_URL || `http://${window.location.hostname}:8000`;

const api = axios.create({
    baseURL: API_BASE,
});

export const setAuthToken = (token: string) => {
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
};

export const adminJoin = async (username: string, lobbyId: string = "LOBBY_TMP") => {
    const response = await api.post('/auth/join', {
        username,
        role: "admin",
        lobby_id: lobbyId
    });
    setAuthToken(response.data.access_token);
    return response.data;
};

export const createLobby = async (name: string, max_players: number = 8) => {
    const response = await api.post('/admin/lobby', null, { params: { name, max_players } });
    return response.data; // { lobby_id, join_code, race_id }
};

export const startRace = async (lobbyId: string) => {
    const response = await api.post(`/admin/race/start/${lobbyId}`);
    return response.data;
};

export const forceStartRace = async (lobbyId: string) => {
    const response = await api.post(`/admin/race/force-run/${lobbyId}`);
    return response.data;
};

export const nextRace = async (lobbyId: string) => {
    const response = await api.post(`/admin/race/next/${lobbyId}`);
    return response.data;
};

export const forceSettle = async (raceId: number) => {
    const response = await api.post(`/admin/race/settle/${raceId}`);
    return response.data;
};

export default api;
