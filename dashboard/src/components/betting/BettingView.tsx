import { useGameStore } from '../../core/store';
import { useMemo } from 'react';

export default function BettingView() {
    const { race, markets } = useGameStore();

    const winMarket = useMemo(() => markets?.find(m => m.type === 'Win'), [markets]);

    if (!race || race.current_state === "Lobby") {
        return (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-500">
                <h2 className="text-2xl font-bold tracking-widest mb-4">ESPERANDO APUESTAS</h2>
                <div className="w-16 h-1 bg-slate-800 rounded animate-pulse" />
            </div>
        );
    }

    if (!winMarket) return null;

    // Calculate total pool to render percentages
    const totalPool = winMarket.selections?.reduce((sum, sel) => sum + sel.pool_amount, 0) || 0;

    // Create a sorted list of selections
    // If we had horse names, we could map them. For now, we use selection_keys (horse_1, etc.)
    const selections = winMarket.selections || [];

    return (
        <div className="flex-1 flex flex-col h-full">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h2 className="text-2xl font-bold text-glow-accent tracking-wider text-indigo-400">
                        MERCADOS ABIERTOS
                    </h2>
                    <p className="text-slate-400 font-mono text-sm mt-1">
                        {race.current_state === 'BettingOpen' ? '🔴 RECIBIENDO APUESTAS...' : 'CERRADO (CARRERA EN CURSO)'}
                    </p>
                </div>
                <div className="text-right">
                    <p className="text-slate-400 font-mono text-sm">TOTAL POOL A GANADOR</p>
                    <div className="text-3xl font-bold text-amber-400 font-mono">
                        ${totalPool.toFixed(2)}
                    </div>
                </div>
            </div>

            {/* Betting Rows Container */}
            <div className="flex-1 flex flex-col gap-3 overflow-y-auto pr-2">
                {selections.map((sel) => {
                    const odds = winMarket.odds?.[sel.selection_key] || 0;
                    const pct = totalPool > 0 ? (sel.pool_amount / totalPool) * 100 : 0;
                    const isClosed = race.current_state !== 'BettingOpen';

                    return (
                        <div key={sel.selection_key} className="relative bg-slate-800/50 border border-slate-700 rounded p-4 overflow-hidden flex items-center justify-between group">

                            {/* Animated Progress Bar Background */}
                            <div
                                className="absolute left-0 top-0 bottom-0 bg-indigo-900/30 transition-all duration-700 ease-out z-0"
                                style={{ width: `${Math.max(pct, 5)}%` }}
                            />

                            <div className="relative z-10 flex items-center gap-4 w-1/3">
                                <div className="w-12 h-12 bg-slate-900 rounded-full flex items-center justify-center font-bold text-xl border-2 border-slate-700 group-hover:border-indigo-500 transition-colors">
                                    {sel.selection_key.split('_')[1]}
                                </div>
                                <div className="font-bold text-lg text-slate-200 uppercase tracking-widest">
                                    {sel.selection_key}
                                </div>
                            </div>

                            <div className="relative z-10 font-mono text-amber-400/80 text-lg w-1/3 text-center">
                                ${sel.pool_amount.toFixed(2)}
                            </div>

                            <div className="relative z-10 w-1/3 flex justify-end items-center gap-2">
                                <span className="text-sm text-slate-500">PAGA</span>
                                <span className={`text-2xl font-black font-mono tracking-tighter ${isClosed ? 'text-slate-400' : 'text-green-400 text-glow-success'}`}>
                                    {odds.toFixed(2)}x
                                </span>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
