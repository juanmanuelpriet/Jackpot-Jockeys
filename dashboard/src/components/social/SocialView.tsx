import { useGameStore } from '../../core/store';

export default function SocialView() {
    const { wallets } = useGameStore();

    // Sort by highest total balance first
    const sortedWallets = [...wallets].sort((a, b) => b.balance_total - a.balance_total);

    return (
        <div className="flex-1 flex flex-col h-full overflow-hidden">
            <h2 className="text-xl font-bold text-glow-accent text-indigo-400 mb-4 sticky top-0">
                LEADERBOARD VIP 💎
            </h2>

            <div className="flex-1 overflow-y-auto pr-2 space-y-3">
                {sortedWallets.length === 0 ? (
                    <p className="text-slate-500 text-sm italic">Esperando que entren los grandes apostadores...</p>
                ) : (
                    sortedWallets.map((wallet, index) => {
                        const isFirst = index === 0;
                        const bgClass = isFirst ? 'bg-amber-500/10 border-amber-500/50' : 'bg-slate-800/50 border-slate-700/50';
                        const numberClass = isFirst ? 'text-amber-400 text-glow-accent' : 'text-slate-500';

                        return (
                            <div
                                key={wallet.user_id}
                                className={`border rounded flex flex-col p-3 transition-all ${bgClass}`}
                            >
                                <div className="flex justify-between items-center mb-1">
                                    <div className="flex items-center gap-2">
                                        <span className={`font-black text-xl w-6 ${numberClass}`}>#{index + 1}</span>
                                        <span className="font-bold text-white">Jugador {wallet.user_id}</span>
                                    </div>
                                    <div className={`font-mono font-bold text-xl ${isFirst ? 'text-amber-400' : 'text-slate-200'}`}>
                                        ${wallet.balance_total.toFixed(2)}
                                    </div>
                                </div>

                                <div className="flex justify-between text-xs font-mono">
                                    <span className="text-slate-500">DISPONIBLE: ${(wallet.balance_total - wallet.balance_locked).toFixed(2)}</span>
                                    <span className="text-red-400/80">LOCKED: ${wallet.balance_locked.toFixed(2)}</span>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}
