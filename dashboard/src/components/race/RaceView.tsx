import { useGameStore } from '../../core/store';
import type { HorseTelemetry } from '../../core/store';

const NEURAL_COLORS = [
    'from-cyan-400 to-blue-600 shadow-[0_0_15px_rgba(34,211,238,0.6)]',
    'from-fuchsia-400 to-purple-600 shadow-[0_0_15px_rgba(232,121,249,0.6)]',
    'from-lime-400 to-green-600 shadow-[0_0_15px_rgba(163,230,53,0.6)]',
    'from-amber-300 to-orange-500 shadow-[0_0_15px_rgba(252,211,77,0.6)]',
    'from-rose-400 to-red-600 shadow-[0_0_15px_rgba(251,113,133,0.6)]',
    'from-indigo-400 to-indigo-800 shadow-[0_0_15px_rgba(129,140,248,0.6)]',
];

const NEURAL_ICONS = ['🧠', '🕸️', '⚡', '🤖', '⚛️', '🧬'];

export default function RaceView() {
    const { race, horseTelemetry, simTick, placements } = useGameStore();

    const isRunning = race?.current_state === 'RaceRunning';
    const isFinished = race?.current_state === 'Settling' || race?.current_state === 'Results';
    const hasTelemetry = horseTelemetry.length > 0;

    if (!race) return null;

    // Sort by rank for display order
    const sortedHorses = hasTelemetry
        ? [...horseTelemetry].sort((a, b) => a.rank - b.rank)
        : Array.from({ length: 6 }, (_, i) => ({
            id: `horse_${i + 1}`,
            pos_mm: 0, lane: 1, vel_mmps: 0, lap: 0, segment_idx: 0,
            rank: i + 1, progress_permil: 0, stamina_permil: 850,
            active_mods: [] as string[], finished: false,
        } as HorseTelemetry));

    return (
        <div className="flex-1 flex flex-col h-full relative font-mono">
            {/* Background Neural Grid */}
            <div className="absolute inset-0 z-0 opacity-10 pointer-events-none"
                style={{
                    backgroundImage: 'linear-gradient(#4f46e5 1px, transparent 1px), linear-gradient(90deg, #4f46e5 1px, transparent 1px)',
                    backgroundSize: '40px 40px'
                }} />

            <div className="flex justify-between items-center mb-4 z-10">
                <h2 className="text-3xl font-black tracking-[0.2em] text-white italic">
                    CORE NEURAL / SECTOR A1
                </h2>
                <div className="flex items-center gap-3">
                    {isRunning && hasTelemetry && (
                        <div className="text-[10px] text-cyan-400 font-mono bg-cyan-950/30 px-2 py-1 rounded border border-cyan-800/50">
                            SYNC_TICK: {simTick.toString().padStart(6, '0')}
                        </div>
                    )}
                    {isRunning && (
                        <div className="animate-pulse bg-cyan-500/10 text-cyan-400 border border-cyan-400/50 px-4 py-1 rounded-sm font-bold text-xs tracking-widest">
                            SIMULACIÓN ACTIVA
                        </div>
                    )}
                    {isFinished && (
                        <div className="bg-amber-600/10 text-amber-400 border border-amber-500/50 px-4 py-1 rounded-sm font-bold text-xs tracking-widest">
                            DATA_SET_FINALIZED
                        </div>
                    )}
                </div>
            </div>

            {/* Track Container */}
            <div className="flex-1 bg-black/40 backdrop-blur-md rounded-xl border border-indigo-900/30 p-4 flex flex-col gap-2 relative overflow-hidden shadow-[inset_0_0_50px_rgba(30,27,75,0.4)]">

                {/* Cyber Finish Line */}
                <div className="absolute right-12 top-0 bottom-0 w-[2px] bg-gradient-to-b from-transparent via-cyan-400 to-transparent opacity-20 shadow-[0_0_15px_rgba(34,211,238,0.5)]" />
                <div className="absolute right-10 top-0 bottom-0 w-[4px] border-r-2 border-dashed border-cyan-500/30" />

                {sortedHorses.map((horse) => {
                    const horseIdx = parseInt(horse.id.replace('horse_', '')) - 1;
                    const styleClass = NEURAL_COLORS[horseIdx] || NEURAL_COLORS[0];
                    const icon = NEURAL_ICONS[horseIdx] || '🧠';

                    // Progress as percentage (0-100)
                    const progress = hasTelemetry
                        ? Math.min(horse.progress_permil / 10, 100)
                        : (isFinished ? 100 : (isRunning ? 50 : 5));

                    // Speed pulse frequency
                    const speedFactor = isRunning ? Math.min(horse.vel_mmps / 8000, 1.5) : 1;
                    const pulseDuration = `${1 / speedFactor}s`;

                    // Power indicators
                    const hasPower = horse.active_mods.length > 0;

                    // Placement
                    const placement = placements.find(p => p.horse_id === horse.id);

                    return (
                        <div key={horse.id} className="flex-1 relative flex items-center group">
                            {/* Neural Path line */}
                            <div className="absolute left-0 right-0 h-[2px] bg-indigo-950/20 top-1/2 -translate-y-1/2" />

                            {/* Synapse Trail */}
                            {isRunning && progress > 5 && (
                                <div
                                    className={`absolute left-0 h-[1px] bg-gradient-to-r from-transparent via-indigo-500 to-cyan-400 opacity-40`}
                                    style={{
                                        width: `calc(${progress}% - 2rem)`,
                                        boxShadow: '0 0 8px rgba(99, 102, 241, 0.5)'
                                    }}
                                />
                            )}

                            {/* Node Info Label (Floating) */}
                            <div className="absolute left-0 z-10 flex flex-col">
                                <span className={`text-[10px] font-black tracking-tighter ${horse.rank === 1 ? 'text-cyan-400' : 'text-slate-600'}`}>
                                    {horse.id.replace('horse_', 'NODE_')}
                                </span>
                            </div>

                            {/* Neural Node (The "Horse") */}
                            <div
                                className={`absolute z-30 flex items-center transition-all duration-150 ease-linear`}
                                style={{ left: `calc(${progress}% - 2.5rem)` }}
                            >
                                <div className="relative flex flex-col items-center">
                                    {/* Synapse Pulse Halo */}
                                    {isRunning && (
                                        <div
                                            className="absolute w-12 h-12 rounded-full border border-cyan-500/30 animate-ping"
                                            style={{ animationDuration: pulseDuration }}
                                        />
                                    )}

                                    {/* Core Node */}
                                    <div className={`w-10 h-10 rounded-lg bg-slate-900 border-2 border-indigo-500/40 flex items-center justify-center relative overflow-hidden ${hasPower ? 'border-fuchsia-400 shadow-[0_0_20px_rgba(232,121,249,0.5)]' : ''}`}>
                                        {/* Internal Glow Gradient */}
                                        <div className={`absolute inset-0 bg-gradient-to-br ${styleClass} opacity-20`} />
                                        <span className={`text-xl z-10 drop-shadow-md ${isRunning ? 'animate-pulse' : ''}`}>{icon}</span>

                                        {/* Activity indicators */}
                                        <div className="absolute bottom-0 left-0 right-0 h-1 bg-slate-800">
                                            <div
                                                className="h-full bg-cyan-400 transition-all duration-300"
                                                style={{ width: `${horse.stamina_permil / 10}%` }}
                                            />
                                        </div>
                                    </div>

                                    {/* Small data pill below node */}
                                    <div className="mt-1 bg-black/80 px-1.5 py-0.5 rounded border border-indigo-900/50 flex gap-2">
                                        <span className="text-[7px] text-cyan-500 font-bold">L{horse.lane}</span>
                                        <span className="text-[7px] text-slate-400">{(horse.vel_mmps / 1000).toFixed(1)}p/s</span>
                                    </div>
                                </div>
                            </div>

                            {/* Finish Status */}
                            {placement && (
                                <div className="absolute right-0 z-40 bg-indigo-950/80 px-3 py-1 rounded border border-indigo-500/40 shadow-[0_0_15px_rgba(99,102,241,0.3)]">
                                    <span className="text-xs font-black text-cyan-400 italic">
                                        RANK_{placement.position.toString().padStart(2, '0')}
                                    </span>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
