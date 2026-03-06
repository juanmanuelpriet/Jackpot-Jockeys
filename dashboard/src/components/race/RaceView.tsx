import { useGameStore } from '../../core/store';
import type { HorseTelemetry } from '../../core/store';

const HORSE_COLORS = [
    'from-red-600 to-red-800',
    'from-blue-600 to-blue-800',
    'from-green-600 to-green-800',
    'from-amber-500 to-amber-700',
    'from-purple-600 to-purple-800',
    'from-pink-600 to-pink-800',
];

const HORSE_EMOJIS = ['🐴', '🦄', '🏇', '🐎', '🦓', '🫏'];

const LANE_LABELS = ['INT', 'MED', 'EXT'];

export default function RaceView() {
    const { race, horseTelemetry, simTick, placements, activePowers } = useGameStore();

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
        <div className="flex-1 flex flex-col h-full relative">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-3xl font-black tracking-widest text-white">
                    🏇 PISTA PRINCIPAL
                </h2>
                <div className="flex items-center gap-3">
                    {isRunning && hasTelemetry && (
                        <span className="text-xs text-slate-500 font-mono">
                            TICK {simTick}
                        </span>
                    )}
                    {isRunning && (
                        <div className="animate-pulse bg-red-600/20 text-red-500 border border-red-500/50 px-4 py-1 rounded-full font-bold text-sm">
                            EN VIVO
                        </div>
                    )}
                    {isFinished && (
                        <div className="bg-amber-600/20 text-amber-400 border border-amber-500/50 px-4 py-1 rounded-full font-bold text-sm">
                            FINALIZADA
                        </div>
                    )}
                </div>
            </div>

            {/* Track Container */}
            <div className="flex-1 bg-slate-900/50 rounded-xl border border-slate-700/50 p-4 flex flex-col gap-1.5 relative overflow-hidden">

                {/* Finish Line */}
                <div className="absolute right-8 top-0 bottom-0 w-1 bg-gradient-to-b from-amber-400 via-white to-amber-400 opacity-30" />
                <div className="absolute right-7 top-0 bottom-0 w-0.5 bg-gradient-to-b from-amber-400 via-white to-amber-400 opacity-20" />

                {sortedHorses.map((horse, idx) => {
                    const horseIdx = parseInt(horse.id.replace('horse_', '')) - 1;
                    const colorGrad = HORSE_COLORS[horseIdx] || HORSE_COLORS[0];
                    const emoji = HORSE_EMOJIS[horseIdx] || '🐴';

                    // Progress as percentage (0-100)
                    const progress = hasTelemetry
                        ? Math.min(horse.progress_permil / 10, 100)
                        : (isFinished ? 100 : (isRunning ? 50 : 5));

                    // Power glow
                    const horsePowers = activePowers.filter(p => p.target_id === horse.id);
                    const hasPower = horsePowers.length > 0 || horse.active_mods.length > 0;

                    // Placement
                    const placement = placements.find(p => p.horse_id === horse.id);

                    // Stamina bar color
                    const staminaColor = horse.stamina_permil > 600
                        ? 'bg-green-500' : horse.stamina_permil > 300
                            ? 'bg-amber-500' : 'bg-red-500';

                    return (
                        <div key={horse.id} className="flex-1 relative flex items-center min-h-[2.5rem]">
                            {/* Track line */}
                            <div className="absolute left-0 right-0 h-px bg-slate-700/30 top-1/2" />

                            {/* Rank badge */}
                            <div className="absolute left-0 z-30 w-6 h-6 flex items-center justify-center">
                                <span className={`text-xs font-black ${horse.rank === 1 ? 'text-amber-400' :
                                        horse.rank === 2 ? 'text-slate-300' :
                                            horse.rank === 3 ? 'text-amber-700' : 'text-slate-600'
                                    }`}>
                                    #{horse.rank}
                                </span>
                            </div>

                            {/* Horse Progress Bar */}
                            <div
                                className={`relative ml-7 h-9 bg-gradient-to-r ${colorGrad} rounded-r-md flex items-center justify-end px-2 transition-all duration-150 ease-linear border-r-2 ${horse.finished ? 'border-amber-300' : 'border-white/30'
                                    } ${hasPower ? 'shadow-[0_0_15px_rgba(232,121,249,0.6)] border-fuchsia-400 z-20' : 'z-10'}`}
                                style={{ width: `calc(${Math.max(progress, 3)}% - 2rem)` }}
                            >
                                {/* Power badges */}
                                {hasPower && (
                                    <div className="absolute -top-2.5 left-1 flex gap-0.5">
                                        {horse.active_mods.map((mod, i) => (
                                            <span key={i} className="bg-fuchsia-900/80 text-fuchsia-200 text-[8px] font-bold px-1 rounded border border-fuchsia-500/50">
                                                ⚡{mod.substring(0, 5)}
                                            </span>
                                        ))}
                                    </div>
                                )}

                                {/* Horse info */}
                                <div className="flex items-center gap-1.5 whitespace-nowrap">
                                    <span className="text-sm">{emoji}</span>
                                    <span className="text-[10px] font-bold text-white/80 font-mono">
                                        {horse.id.replace('horse_', 'H')}
                                    </span>

                                    {hasTelemetry && (
                                        <>
                                            <span className="text-[8px] text-white/50 font-mono">
                                                {(horse.vel_mmps / 1000).toFixed(1)}m/s
                                            </span>
                                            <span className={`text-[8px] px-1 rounded ${horse.lane === 0 ? 'bg-blue-900/60 text-blue-300' :
                                                    horse.lane === 1 ? 'bg-green-900/60 text-green-300' :
                                                        'bg-red-900/60 text-red-300'
                                                }`}>
                                                {LANE_LABELS[horse.lane]}
                                            </span>
                                        </>
                                    )}
                                </div>

                                {/* Stamina bar */}
                                {hasTelemetry && (
                                    <div className="absolute bottom-0.5 left-1 right-1 h-0.5 bg-slate-900/60 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full ${staminaColor} transition-all duration-300`}
                                            style={{ width: `${horse.stamina_permil / 10}%` }}
                                        />
                                    </div>
                                )}
                            </div>

                            {/* Finish position badge */}
                            {(placement || horse.finished) && (
                                <div className="absolute right-2 z-30">
                                    <span className={`text-lg font-black drop-shadow-lg ${(placement?.position || horse.rank) === 1 ? 'text-amber-400' : 'text-slate-400'
                                        }`}>
                                        🏁 #{placement?.position || horse.rank}
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
