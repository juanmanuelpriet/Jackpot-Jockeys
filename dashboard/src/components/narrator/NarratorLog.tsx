import { useGameStore } from '../../core/store';

export default function NarratorLog() {
    const { logs } = useGameStore();

    const getLogStyle = (type: string) => {
        switch (type) {
            case 'bet': return 'border-l-4 border-indigo-500 bg-indigo-900/10 text-indigo-200';
            case 'power': return 'border-l-4 border-amber-500 bg-amber-900/10 text-amber-200';
            case 'system': return 'border-l-4 border-emerald-500 bg-emerald-900/10 text-emerald-200 font-bold';
            default: return 'border-l-4 border-slate-500 bg-slate-800/50 text-slate-300';
        }
    };

    return (
        <div className="flex-1 flex flex-col h-full overflow-hidden">
            <h2 className="text-xl font-bold tracking-widest text-glow-accent text-indigo-400 mb-4 sticky top-0 bg-slate-900/80 backdrop-blur-sm z-10 pb-2 border-b border-indigo-900/50 flex justify-between items-center">
                <span>🎙️ EL NARRADOR</span>
                <span className="text-xs bg-indigo-900 text-indigo-300 px-2 py-1 rounded-full animate-pulse">EN VIVO</span>
            </h2>

            <div className="flex-1 overflow-y-auto pr-2 space-y-3 flex flex-col-reverse">
                {logs.length === 0 ? (
                    <p className="text-slate-500 text-sm italic py-4 text-center">Todo en silencio... de momento.</p>
                ) : (
                    logs.map((log, index) => (
                        <div
                            key={index}
                            className={`p-3 rounded-r-lg shadow-sm text-sm break-words transition-all duration-300 animate-[slideIn_0.3s_ease-out] ${getLogStyle(log.type)}`}
                        >
                            <div className="text-[10px] opacity-60 mb-1 font-mono">
                                [{log.time instanceof Date ? log.time.toLocaleTimeString() : '??:??'}]
                            </div>
                            <div className="leading-snug">{log.text}</div>
                        </div>
                    ))
                )}
            </div>

        </div>
    );
}
