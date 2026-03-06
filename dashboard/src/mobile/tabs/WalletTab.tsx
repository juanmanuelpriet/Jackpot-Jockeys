import { useMobileStore } from '../core/mobileStore';

export default function WalletTab() {
    const { wallet, activity, user } = useMobileStore();

    return (
        <div className="flex-1 overflow-y-auto px-4 pt-4 pb-20">
            {/* Player Header */}
            <div className="text-center mb-6">
                <p className="text-xs text-slate-500 uppercase tracking-widest mb-1">Corredor</p>
                <p className="text-2xl font-black text-white">{user?.username || 'ANÓNIMO'}</p>
            </div>

            {/* Wallet Card */}
            <div className="bg-gradient-to-br from-indigo-900/60 to-slate-900 border border-indigo-700/30 rounded-2xl p-5 mb-6 shadow-[0_0_20px_rgba(79,70,229,0.15)]">
                <p className="text-xs text-indigo-300 uppercase tracking-wider mb-1">Balance Disponible</p>
                <p className="text-4xl font-black text-white mb-4">
                    ${wallet.balance_available.toFixed(2)}
                </p>

                <div className="flex gap-4">
                    <div className="flex-1 bg-slate-800/60 rounded-xl p-3">
                        <p className="text-[10px] text-slate-500 uppercase">Total</p>
                        <p className="text-lg font-bold text-white">${wallet.balance_total.toFixed(2)}</p>
                    </div>
                    <div className="flex-1 bg-slate-800/60 rounded-xl p-3">
                        <p className="text-[10px] text-slate-500 uppercase">En Juego</p>
                        <p className="text-lg font-bold text-amber-400">${wallet.balance_locked.toFixed(2)}</p>
                    </div>
                </div>
            </div>

            {/* Activity Feed */}
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3">Historial</h3>

            {activity.length === 0 ? (
                <p className="text-sm text-slate-600 text-center py-8">
                    Aún no hay movimientos. ¡Apuesta algo!
                </p>
            ) : (
                <div className="space-y-2">
                    {activity.map(item => {
                        const iconMap: Record<string, string> = {
                            bet: '🎲',
                            power: '⚡',
                            settlement: '🏁',
                            system: '📢',
                        };
                        return (
                            <div key={item.id} className="flex items-start gap-3 bg-slate-800/40 rounded-xl p-3 border border-slate-700/30">
                                <span className="text-lg mt-0.5">{iconMap[item.type] || '📋'}</span>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm text-white">{item.text}</p>
                                    <p className="text-[10px] text-slate-600 mt-0.5">
                                        {item.time.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                    </p>
                                </div>
                                {item.amount !== undefined && (
                                    <span className={`text-sm font-bold whitespace-nowrap ${item.amount >= 0 ? 'text-green-400' : 'text-red-400'
                                        }`}>
                                        {item.amount >= 0 ? '+' : ''}${Math.abs(item.amount).toFixed(0)}
                                    </span>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
