import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { joinLobby, setMobileToken } from './core/mobileApi';
import { connectMobileWS } from './core/mobileWsClient';
import { useMobileStore } from './core/mobileStore';

export default function MobileJoin() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const setUser = useMobileStore(s => s.setUser);

    // Immediate extraction for instant UI feedback
    const initialCode = searchParams.get('join') || '';
    const initialApi = searchParams.get('api');
    if (initialApi) sessionStorage.setItem('VITE_API_OVERRIDE', initialApi);

    const [joinCode, setJoinCode] = useState(initialCode);
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
                    <span className="text-5xl drop-shadow-[0_0_15px_rgba(99,102,241,0.5)]">🧠</span>
                    <h1 className="text-3xl font-black text-white mt-2 tracking-widest italic">NEURAL CORE</h1>
                    <p className="text-[10px] text-cyan-500 font-mono mt-1 opacity-70">{" >> "} SECTOR_JOIN_INITIALIZED</p>
                </div>

                {/* Lobby Code Badge */}
                <div className="flex flex-col items-center justify-center gap-2 mb-6">
                    <span className="text-[9px] text-slate-500 uppercase tracking-[0.3em]">SYNCHRONIZING_LOBBY</span>
                    <span className="bg-cyan-950/30 border border-cyan-500/30 text-cyan-400 px-6 py-2 rounded-sm font-mono font-black text-2xl tracking-widest shadow-[inset_0_0_10px_rgba(34,211,238,0.2)]">
                        {joinCode || '------'}
                    </span>
                </div>

                <form onSubmit={handleJoin} className="space-y-6">
                    <div>
                        <label className="block text-[10px] font-black text-indigo-400 mb-2 uppercase tracking-[0.2em] ml-1">IDENTIFICADOR_SUJETO</label>
                        <input
                            type="text"
                            maxLength={12}
                            required
                            autoFocus
                            value={username}
                            onChange={(e) => setUsername(e.target.value.toUpperCase())}
                            placeholder="USER_NAME"
                            className="w-full bg-black/60 border border-indigo-900/50 rounded-sm p-4 text-center text-xl font-black text-white placeholder-slate-800 focus:outline-none focus:border-cyan-500 transition-all font-mono"
                        />
                    </div>

                    {error && (
                        <div className="bg-red-950/40 border border-red-500/30 text-red-400 text-[10px] p-3 rounded-sm text-center font-mono animate-pulse">
                            ERR: {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading || !username.trim() || !joinCode.trim()}
                        className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-black py-4 rounded-sm active:scale-95 transition-all shadow-[0_0_20px_rgba(79,70,229,0.3)] disabled:opacity-30 disabled:active:scale-100 text-sm tracking-[0.4em] border border-indigo-400/50 uppercase"
                    >
                        {loading ? 'ESTABLECIENDO_LINK...' : 'INJECT_MIND'}
                    </button>
                </form>

                <p className="text-[8px] text-slate-600 text-center mt-8 font-mono tracking-widest opacity-50">
                    REMOTE_UPLINK: {sessionStorage.getItem('VITE_API_OVERRIDE') || `${window.location.hostname}:8000`}
                </p>
            </div>
        </div>
    );
}
