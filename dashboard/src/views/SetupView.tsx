import { useState } from 'react';
import QRCode from 'react-qr-code';
import { adminJoin, createLobby } from '../core/api';
import { connectWS } from '../core/wsClient';
import { useNavigate } from 'react-router-dom';

export default function SetupView() {
    const [loading, setLoading] = useState(false);
    const [lobbyData, setLobbyData] = useState<{ join_code: string, lobby_id: string } | null>(null);
    const navigate = useNavigate();

    const handleCreateLobby = async () => {
        setLoading(true);
        try {
            // 1. Get temp admin token
            const auth = await adminJoin("Moderador_Show");

            // 2. Create the real lobby
            const lobby = await createLobby("Casino Central");

            // 3. Connect Socket using the token
            connectWS(auth.access_token);

            setLobbyData(lobby);
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
            <div className="min-h-screen flex flex-col items-center justify-center p-8">
                <h1 className="text-5xl font-bold text-glow-accent mb-6">Jackpot Jockeys</h1>

                <div className="glass-panel p-12 flex flex-col items-center max-w-2xl w-full">
                    <h2 className="text-3xl mb-8">¡Escanea para unirte!</h2>

                    <div className="bg-white p-4 rounded-xl mb-8">
                        <QRCode value={`http://localhost:5173/join?code=${lobbyData.join_code}`} size={300} />
                    </div>

                    <div className="text-6xl font-mono tracking-[0.5em] font-bold text-amber-400 mb-12">
                        {lobbyData.join_code}
                    </div>

                    <button
                        onClick={() => navigate('/show')}
                        className="w-full py-4 text-2xl bg-indigo-600 hover:bg-indigo-500 rounded-lg font-bold shadow-[0_0_15px_rgba(79,70,229,0.5)] transition"
                    >
                        Comenzar el Show 🎬
                    </button>
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
