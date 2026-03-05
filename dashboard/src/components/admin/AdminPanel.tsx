import { useGameStore } from '../../core/store';
import { startRace, forceSettle } from '../../core/api';
import { Settings, Play, Flag, RefreshCw } from 'lucide-react';
import { useState } from 'react';

export default function AdminPanel() {
    const { race } = useGameStore();
    const [loading, setLoading] = useState(false);

    const handleStartBetting = async () => {
        if (!race) return;
        setLoading(true);
        try {
            await startRace(race.lobby_id);
        } catch (e) {
            console.error(e);
            alert("Error starting.");
        } finally {
            setLoading(false);
        }
    };

    const handleForceSettle = async () => {
        if (!race) return;
        setLoading(true);
        try {
            await forceSettle(race.id);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    if (!race) return null;

    return (
        <div className="fixed bottom-0 left-0 right-0 h-16 bg-slate-900 border-t border-slate-700 flex items-center justify-between px-8 z-50">

            {/* Left: Info */}
            <div className="flex items-center gap-6">
                <div className="flex items-center gap-2 text-indigo-400 font-mono">
                    <Settings size={20} />
                    <span>GM CONSOLE</span>
                </div>

                <div className="flex bg-slate-800 rounded px-3 py-1 text-sm border border-slate-700">
                    <span className="text-slate-400 mr-2">LOBBY:</span>
                    <span className="text-white font-bold">{race.lobby_id}</span>
                </div>

                <div className="flex bg-slate-800 rounded px-3 py-1 text-sm border border-slate-700">
                    <span className="text-slate-400 mr-2">STATE:</span>
                    <span className="text-green-400 font-bold">{race.current_state} (v{race.state_version})</span>
                </div>
            </div>

            {/* Right: Controls */}
            <div className="flex items-center gap-4">
                {race.current_state === 'Lobby' && (
                    <button
                        onClick={handleStartBetting}
                        disabled={loading}
                        className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 px-4 py-2 rounded font-bold transition text-sm disabled:opacity-50"
                    >
                        <Play size={16} /> ABRIR APUESTAS
                    </button>
                )}

                {race.current_state === 'RaceRunning' && (
                    <button
                        onClick={handleForceSettle}
                        disabled={loading}
                        className="flex items-center gap-2 bg-red-600 hover:bg-red-500 px-4 py-2 rounded font-bold transition text-sm disabled:opacity-50"
                    >
                        <Flag size={16} /> FORCE SETTLE
                    </button>
                )}

                {/* Temporary reset/re-sync mock button. Normally WS auto-syncs. */}
                <button className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 px-3 py-2 rounded transition text-sm text-slate-300">
                    <RefreshCw size={16} /> RE-SYNC
                </button>
            </div>

        </div>
    );
}
