import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { joinLobby, setMobileToken } from './core/mobileApi';
import { connectMobileWS } from './core/mobileWsClient';
import { useMobileStore } from './core/mobileStore';

export default function MobileJoin() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const setUser = useMobileStore(s => s.setUser);

    const [joinCode, setJoinCode] = useState('');
    const [username, setUsername] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        const code = searchParams.get('join');
        const api = searchParams.get('api');

        if (code) setJoinCode(code);
        if (api) sessionStorage.setItem('VITE_API_OVERRIDE', api);
    }, [searchParams]);

    const handleJoin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!username.trim() || !joinCode.trim()) return;

        setLoading(true);
        setError('');

        try {
            const data = await joinLobby(username.trim(), joinCode.trim());
            const token = data.access_token;

            // Store auth
            setMobileToken(token);
            setUser({
                id: data.user_id,
                username: username.trim(),
                token,
                joinCode: joinCode.trim(),
            });

            // Open WebSocket
            connectMobileWS(token);

            // Navigate to game view
            navigate('/m/game');
        } catch (e: any) {
            const msg = e?.response?.data?.detail || 'No se pudo unir al lobby. Verifica el código.';
            setError(msg);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex-1 flex flex-col items-center justify-center p-6 bg-gradient-to-b from-slate-900 to-slate-950 absolute inset-0">
            <div className="w-full max-w-sm">
                {/* Logo */}
                <div className="text-center mb-8">
                    <span className="text-5xl">🏇</span>
                    <h1 className="text-3xl font-black text-indigo-400 mt-2">JACKPOT JOCKEYS</h1>
                    <p className="text-xs text-slate-600 mt-1">La fiesta empieza aquí</p>
                </div>

                {/* Lobby Code Badge */}
                <div className="flex items-center justify-center gap-2 mb-6">
                    <span className="text-xs text-slate-500 uppercase">Sala:</span>
                    <span className="bg-indigo-900/50 border border-indigo-700/50 text-indigo-300 px-4 py-1.5 rounded-full font-mono font-bold text-lg tracking-widest">
                        {joinCode || '???'}
                    </span>
                </div>

                <form onSubmit={handleJoin} className="space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wider">Tu Nombre</label>
                        <input
                            type="text"
                            maxLength={12}
                            required
                            autoFocus
                            value={username}
                            onChange={(e) => setUsername(e.target.value.toUpperCase())}
                            placeholder="Ej. PEPE123"
                            className="w-full bg-slate-800 border border-slate-700 rounded-xl p-4 text-center text-xl font-bold placeholder-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 transition-all uppercase"
                        />
                    </div>

                    {error && (
                        <div className="bg-red-900/30 border border-red-700/50 text-red-300 text-sm p-3 rounded-xl text-center">
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading || !username.trim() || !joinCode.trim()}
                        className="w-full bg-indigo-600 text-white font-black py-4 rounded-xl active:scale-95 transition-all shadow-[0_4px_20px_rgba(79,70,229,0.4)] disabled:opacity-50 disabled:active:scale-100 text-lg"
                    >
                        {loading ? '⏳ CONECTANDO...' : '🎰 ENTRAR AL CAOS'}
                    </button>
                </form>

                <p className="text-[10px] text-slate-700 text-center mt-6">
                    Conectando a {sessionStorage.getItem('VITE_API_OVERRIDE') || `${window.location.hostname}:8000`}
                </p>
            </div>
        </div>
    );
}
