import { useState } from 'react';
import QRCode from 'react-qr-code';
import { adminJoin, createLobby } from '../core/api';
import { connectWS } from '../core/wsClient';
import { useNavigate } from 'react-router-dom';

import { useGameStore } from '../core/store';

export default function SetupView() {
    const [loading, setLoading] = useState(false);
    const [lobbyData, setLobbyData] = useState<{ join_code: string, lobby_id: string } | null>(null);
    const connectedPlayers = useGameStore(s => s.connectedPlayers);
    const navigate = useNavigate();

    const handleCreateLobby = async () => {
        setLoading(true);
        try {
            // 1. Get temp admin token
            await adminJoin("Moderador_Show", "LOBBY_TMP");

            // 2. Create the real lobby
            const lobby = await createLobby("Casino Central");

            // 3. Re-authenticate with the REAL lobby ID to get a valid WS token
            const finalAuth = await adminJoin("Moderador_Show", lobby.lobby_id);

            // 4. Connect Socket using the final token
            connectWS(finalAuth.access_token);

            setLobbyData(lobby);
            localStorage.setItem('LOBBY_JOIN_CODE', lobby.join_code);
            localStorage.setItem('LOBBY_ID', lobby.lobby_id);
        } catch (e) {
            console.error(e);
            alert("Error creando lobby. Revisar consola y asegurar que backend está en puerto 8000.");
        } finally {
            setLoading(false);
        }
    };

    if (lobbyData) {
        // Show QR and wait for Start
        return (
            <div className="min-h-screen flex flex-col p-8 bg-slate-900 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-900 via-slate-900 to-black">
                {/* Header */}
                <div className="flex justify-between items-center mb-8">
                    <h1 className="text-4xl font-bold text-glow-accent">Jackpot Jockeys</h1>
                    <div className="glass-panel px-6 py-3 rounded-full flex items-center gap-4">
                        <span className="text-xl">Sala:</span>
                        <span className="text-3xl font-mono font-bold text-amber-400 tracking-widest">{lobbyData.join_code}</span>
                    </div>
                </div>

                <div className="flex-1 flex gap-8 max-w-7xl mx-auto w-full">
                    {/* Left: QR Code & Start Button */}
                    <div className="flex flex-col gap-6 w-[400px] shrink-0">
                        <div className="glass-panel p-8 flex flex-col items-center flex-1">
                            <h2 className="text-2xl font-bold mb-8 text-center">Escanea para unirte</h2>
                            <div className="bg-white p-4 rounded-xl mb-auto">
                                <QRCode
                                    value={`${window.location.protocol}//${window.location.hostname}:5173/m?join=${lobbyData.join_code}&api=${encodeURIComponent(import.meta.env.VITE_API_BASE_URL || `${window.location.protocol}//${window.location.hostname}:8000`)}`}
                                    size={300}
                                />
                            </div>

                            <div className="w-full mt-8">
                                <div className="text-center mb-4 font-bold text-indigo-300">
                                    {connectedPlayers.length} Jugadores en sala
                                </div>
                                <button
                                    onClick={() => navigate('/show')}
                                    className="w-full py-4 text-2xl bg-indigo-600 hover:bg-indigo-500 rounded-lg font-bold shadow-[0_0_15px_rgba(79,70,229,0.5)] transition"
                                >
                                    ¡Comenzar! 🎬
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Right: Player Grid (Kahoot style) */}
                    <div className="flex-1 glass-panel p-8 overflow-y-auto">
                        <h2 className="text-2xl font-bold mb-6 opacity-50 uppercase tracking-widest">Jugadores ({connectedPlayers.length})</h2>

                        <div className="flex flex-wrap gap-4">
                            {connectedPlayers.length === 0 ? (
                                <div className="w-full h-64 flex items-center justify-center text-slate-500 text-xl animate-pulse">
                                    Esperando jinetes...
                                </div>
                            ) : (
                                connectedPlayers.map((player) => (
                                    <div
                                        key={player.user_id}
                                        className="px-6 py-4 bg-indigo-950/50 border border-indigo-500/30 rounded-xl font-bold text-2xl animate-[scale-in_0.3s_ease-out_forwards] shadow-[0_0_10px_rgba(79,70,229,0.2)]"
                                    >
                                        {player.username}
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // Initial State
    return (
        <div className="min-h-screen flex flex-col items-center justify-center p-8">
            <h1 className="text-6xl font-bold text-glow-accent mb-12">Jackpot Jockeys</h1>
            <p className="text-xl text-slate-400 mb-12">Consola de Control del GM</p>

            <button
                onClick={handleCreateLobby}
                disabled={loading}
                className="px-8 py-4 text-2xl bg-indigo-600 hover:bg-indigo-500 rounded-lg font-bold shadow-[0_0_15px_rgba(79,70,229,0.5)] disabled:opacity-50 transition"
            >
                {loading ? "Iniciando..." : "Crear Sala Principal"}
            </button>
        </div>
    );
}
