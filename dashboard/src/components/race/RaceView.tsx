import { useGameStore } from '../../core/store';

export default function RaceView() {
    const { race, simTick } = useGameStore();

    const isRunning = race?.current_state === 'RaceRunning';
    const isFinished = race?.current_state === 'Settling' || race?.current_state === 'Results';

    if (!race) return null;

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

            {/* Godot Viewport */}
            <div className="flex-1 bg-black/60 backdrop-blur-md rounded-xl border border-indigo-900/30 overflow-hidden relative shadow-[0_0_50px_rgba(0,0,0,0.5)]">
                <iframe
                    id="godot-renderer"
                    src={`/godot/index.html?lobby=${race.lobby_id}&token=${localStorage.getItem('token') || ''}`}
                    className="w-full h-full border-none"
                    title="Neural Core Renderer"
                    allow="autoplay"
                />

                {/* Fallback Overlay if Godot isn't exported yet */}
                {!isRunning && !isFinished && (
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
        </div>
    );
}
