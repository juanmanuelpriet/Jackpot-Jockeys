import axios from 'axios';

const API_URL = 'http://localhost:8000';

const api = axios.create({
    baseURL: API_URL,
});

export const setAuthToken = (token: string) => {
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
};

export const adminJoin = async (username: string) => {
    const response = await api.post('/auth/join', {
        username,
        role: "admin",
        lobby_id: "LOBBY_TMP" // Overridden when lobby is created, just to get token
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

export const forceSettle = async (raceId: number) => {
    const response = await api.post(`/admin/race/settle/${raceId}`);
    return response.data;
};

export default api;
