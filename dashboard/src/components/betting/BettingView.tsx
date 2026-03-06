import { useMemo } from 'react';
import { useGameStore } from '../../core/store';

const NEURAL_ICONS = ['🧠', '🕸️', '⚡', '🤖', '⚛️', '🧬'];

export default function BettingView() {
    const { race, markets } = useGameStore();

    const winMarket = useMemo(() => markets?.find(m => m.type === 'Win'), [markets]);

    if (!race || race.current_state === "Lobby") {
        return (
            <div className="flex-1 flex flex-col items-center justify-center text-indigo-400">
                <h2 className="text-2xl font-black tracking-[0.3em] mb-4 opacity-50 italic">SYNCHRONIZING...</h2>
                <div className="w-24 h-[1px] bg-indigo-500 rounded animate-pulse shadow-[0_0_10px_#6366f1]" />
            </div>
        );
    }

    if (!winMarket) return null;

    // Calculate total pool to render percentages
    const totalPool = winMarket.selections?.reduce((sum: number, sel: any) => sum + sel.pool_amount, 0) || 0;

    // Create a sorted list of selections
    const selections = winMarket.selections || [];

    return (
        <div className="flex-1 flex flex-col h-full font-mono">
            <div className="flex items-center justify-between mb-6 border-b border-indigo-900/30 pb-4">
                <div>
                    <h2 className="text-2xl font-black tracking-widest text-cyan-400 italic">
                        MERCADOS_SYNC
                    </h2>
                    <p className={`font-mono text-[10px] mt-1 tracking-widest ${race.current_state === 'BettingOpen' ? 'text-green-400' : 'text-slate-500'}`}>
                        {race.current_state === 'BettingOpen' ? '>> SISTEMA_ABIERTO_DATOS_VIVIENTES' : '>> CONGELAMIENTO_DE_POOLS_ACTIVO'}
                    </p>
                </div>
                <div className="text-right">
                    <p className="text-slate-500 font-mono text-[10px] tracking-widest">POOL_AGREGADO</p>
                    <div className="text-3xl font-black text-white drop-shadow-[0_0_8px_#60a5fa] font-mono">
                        ${totalPool.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </div>
                </div>
            </div>

            <div className="flex-1 flex flex-col gap-2 overflow-y-auto pr-2 custom-scrollbar">
                {selections.map((sel) => {
                    const horseIdx = parseInt(sel.selection_key.replace('horse_', '')) - 1;
                    const icon = NEURAL_ICONS[horseIdx] || '🧠';
                    const odds = winMarket.odds?.[sel.selection_key] || 0;
                    const pct = totalPool > 0 ? (sel.pool_amount / totalPool) * 100 : 0;
                    const isClosed = race.current_state !== 'BettingOpen';

                    return (
                        <div key={sel.selection_key} className="relative bg-black/40 border border-indigo-900/30 rounded-sm p-3 overflow-hidden flex items-center justify-between group">

                            {/* Cyber Progress Background */}
                            <div
                                className="absolute left-0 top-0 bottom-0 bg-indigo-500/10 transition-all duration-700 ease-out z-0 border-r border-indigo-500/20"
                                style={{ width: `${Math.max(pct, 2)}%` }}
                            />

                            <div className="relative z-10 flex items-center gap-4 w-1/3">
                                <div className="w-10 h-10 bg-slate-900 rounded border border-indigo-500/30 flex items-center justify-center font-bold text-lg group-hover:bg-indigo-950/50 transition-colors">
                                    {icon}
                                </div>
                                <div>
                                    <div className="font-black text-xs text-indigo-300 uppercase tracking-widest">
                                        AGENTE {sel.selection_key.split('_')[1]}
                                    </div>
                                    <div className="text-[10px] text-slate-500 font-mono">
                                        HWID: SECTOR_0{sel.selection_key.split('_')[1]}
                                    </div>
                                </div>
                            </div>

                            <div className="relative z-10 font-mono text-white text-sm w-1/3 text-center">
                                ${sel.pool_amount.toFixed(2)}
                            </div>

                            <div className="relative z-10 w-1/3 flex justify-end items-center gap-3">
                                <span className="text-[9px] text-slate-600 tracking-tighter">MULTIPLICADOR</span>
                                <span className={`text-xl font-black font-mono tracking-tighter ${isClosed ? 'text-slate-600' : 'text-cyan-400 shadow-cyan-500/20'}`}>
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
