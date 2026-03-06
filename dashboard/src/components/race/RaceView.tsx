import { useRef } from 'react';
import { useGameStore } from '../../core/store';

export default function RaceView() {
    const { race, simTick } = useGameStore();
    const iframeRef = useRef<HTMLIFrameElement>(null);

    const isRunning = race?.current_state === 'RaceRunning';
    const isFinished = race?.current_state === 'Settling' || race?.current_state === 'Results';

    if (!race) return null;

    const lobbyId = race.lobby_id;

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
                    {isRunning && (
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

            {/* Race Visualization (Godot) */}
            <div className="relative group">
                {/* Neon Frame Accent */}
                <div className="absolute -inset-1 bg-gradient-to-r from-cyan-500 to-fuchsia-500 rounded-xl blur opacity-20 group-hover:opacity-40 transition duration-1000 group-hover:duration-200"></div>

                <div className="relative h-[600px] bg-black/80 rounded-xl overflow-hidden border border-white/10 shadow-2xl backdrop-blur-sm">
                    {/* Visual Overlay for Cinematic feel */}
                    <div className="absolute inset-0 pointer-events-none border-[20px] border-black/20 z-10 rounded-xl"></div>

                    <iframe
                        ref={iframeRef}
                        src={`/godot/index.html?lobby=${lobbyId}&token=${localStorage.getItem('token') || ''}`}
                        className="w-full h-full border-none"
                        title="Godot Race Renderer"
                        allow="autoplay"
                    />

                    {/* Overlay: Race Info */}
                    <div className="absolute top-4 left-4 z-20 flex gap-4">
                        <div className="bg-black/60 backdrop-blur-md px-4 py-2 rounded-lg border border-cyan-500/30 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse" />
                            <span className="text-xs font-mono text-cyan-400">ENGINE_ALIVE: V1.2.0</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Fallback Overlay if Godot isn't exported yet */}
            {(!isRunning && !isFinished) && (
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none bg-slate-900/40 backdrop-blur-[2px]">
                    <span className="text-4xl mb-4 animate-bounce">🧠</span>
                    <h3 className="text-xl font-black text-white tracking-widest opacity-50 italic">
                        AWAITING_NEURAL_UPLINK
                    </h3>
                    <p className="text-[10px] text-indigo-400 font-mono mt-2">
                        GODOT_ENGINE_INITIALIZED_SECTOR_A1
                    </p>
                </div>
            )}
        </div>
    );
}
