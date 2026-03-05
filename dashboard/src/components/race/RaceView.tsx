import { useGameStore } from '../../core/store';
import type { HorsePlacement } from '../../core/store';
import { useMemo } from 'react';

export default function RaceView() {
    const { race, placements, activePowers } = useGameStore();

    const isRunning = race?.current_state === 'RaceRunning';
    const isFinished = race?.current_state === 'Settling' || race?.current_state === 'Results';

    // For MVP: generate a stub track view of 6 horses
    const horses = useMemo(() => Array.from({ length: 6 }, (_, i) => `horse_${i + 1} `), []);

    const getPlacement = (horseId: string): HorsePlacement | undefined => {
        return placements.find(p => p.horse_id === horseId);
    };

    if (!race) return null;

    return (
        <div className="flex-1 flex flex-col h-full relative">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-3xl font-black text-glow-accent tracking-widest text-white">
                    PISTA PRINCIPAL
                </h2>
                {isRunning && (
                    <div className="animate-pulse bg-red-600/20 text-red-500 border border-red-500/50 px-4 py-1 rounded-full font-bold">
                        CARRERA EN CURSO
                    </div>
                )}
            </div>

            {/* The Track */}
            <div className="flex-1 bg-slate-900/50 rounded-lg border border-slate-700/50 p-4 flex flex-col gap-2 relative overflow-hidden">

                {/* Finish Line Indicator */}
                <div className="absolute right-8 top-0 bottom-0 w-2 bg-gradient-to-b from-white via-slate-400 to-white opacity-20" />

                {horses.map(horseId => {
                    const placement = getPlacement(horseId);
                    // Check if this horse has active powers
                    const horsePowers = activePowers.filter(p => p.target_id === horseId);
                    const hasPowers = horsePowers.length > 0;

                    // Simple stub animation logic: if running, CSS transition moves them. If finished, they snap to finish line.
                    let widthClass = 'w-16'; // Starting block
                    if (isRunning) widthClass = 'w-3/4'; // Simulate mid-race
                    if (isFinished) widthClass = 'w-[calc(100%-2rem)]'; // Finish line

                    const powerGlowClass = hasPowers
                        ? 'border-y-2 border-l-2 border-fuchsia-400 shadow-[0_0_20px_rgba(232,121,249,0.8)] animate-pulse scale-105 z-20'
                        : 'shadow-[0_0_10px_rgba(79,70,229,0.8)] z-10 border-y border-l border-transparent';

                    return (
                        <div key={horseId} className="flex-1 relative flex items-center">
                            {/* Track line */}
                            <div className="absolute left-0 right-0 h-px bg-slate-700/50 top-1/2 -translate-y-1/2" />

                            {/* The Horse Box */}
                            <div
                                className={`relative h-10 bg-indigo-600 rounded flex items-center justify-end px-3 transition-all duration-[10000ms] ease-in-out border-r-4 border-amber-300 ${powerGlowClass} ${widthClass}`}
                                style={{
                                    transitionDuration: isRunning ? '15s' : isFinished ? '1s' : '0s'
                                }}
                            >
                                {/* Active Power Icons */}
                                {hasPowers && (
                                    <div className="absolute -top-3 left-2 flex gap-1 animate-bounce">
                                        {horsePowers.map((p, idx) => (
                                            <span key={idx} className="bg-fuchsia-900 text-fuchsia-200 text-[10px] font-bold px-1 rounded border border-fuchsia-500">
                                                ⚡ {p.power_id.substring(0, 6)}
                                            </span>
                                        ))}
                                    </div>
                                )}
                                <span className="font-bold font-mono tracking-tighter text-white drop-shadow-md">
                                    {horseId.toUpperCase()}
                                </span>

                                {placement && (
                                    <div className="absolute -right-12 text-2xl font-black text-amber-400 drop-shadow-md">
                                        #{placement.position}
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
