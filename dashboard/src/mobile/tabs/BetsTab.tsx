import { useState } from 'react';
import { useMobileStore } from '../core/mobileStore';
import { placeBet } from '../core/mobileApi';
import ConfirmModal from '../components/ConfirmModal';

const QUICK_AMOUNTS = [10, 25, 50, 100];

export default function BetsTab() {
    const { race, markets, wallet } = useMobileStore();
    const addToast = useMobileStore(s => s.addToast);

    const [selectedHorse, setSelectedHorse] = useState<string | null>(null);
    const [selectedMarket, setSelectedMarket] = useState<number | null>(null);
    const [betAmount, setBetAmount] = useState(50);
    const [showConfirm, setShowConfirm] = useState(false);
    const [loading, setLoading] = useState(false);

    const isBettingOpen = race?.current_state === 'BettingOpen';
    const winMarket = markets.find(m => m.type === 'Win');

    const handleBet = async () => {
        if (!race || !selectedMarket || !selectedHorse) return;
        setLoading(true);
        try {
            await placeBet(race.id, selectedMarket, selectedHorse, betAmount);
            setShowConfirm(false);
            setSelectedHorse(null);
            // Toast handled by WS event BET_PLACED
        } catch (e: any) {
            const msg = e?.response?.data?.detail || 'Error al apostar';
            addToast('error', `❌ ${msg}`);
            setShowConfirm(false);
        } finally {
            setLoading(false);
        }
    };

    const openBetConfirm = (selectionKey: string, marketId: number) => {
        setSelectedHorse(selectionKey);
        setSelectedMarket(marketId);
        setShowConfirm(true);
    };

    // Blocked states
    if (!race) {
        return (
            <div className="flex-1 flex items-center justify-center text-slate-500 text-center p-8">
                <p className="text-lg">Esperando conexión con la carrera...</p>
            </div>
        );
    }

    if (!isBettingOpen) {
        const stateMsg: Record<string, string> = {
            'Lobby': '⏳ Esperando que el GM abra las apuestas...',
            'RaceRunning': '🏇 ¡Carrera en curso! Cruza los dedos.',
            'Settling': '💰 Calculando resultados...',
            'Results': '🏁 ¡Carrera terminada! Revisa tu billetera.',
            'Ended': '🔚 Carrera finalizada. Esperando la siguiente...',
        };
        return (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
                <div className="text-5xl mb-4">🔒</div>
                <p className="text-xl font-bold text-slate-300 mb-2">Apuestas Cerradas</p>
                <p className="text-sm text-slate-500">{stateMsg[race.current_state] || race.current_state}</p>
            </div>
        );
    }

    return (
        <div className="flex-1 overflow-y-auto px-4 pt-4 pb-20">
            {/* Header */}
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-black text-white">🎰 MERCADO WIN</h2>
                <span className="text-xs bg-green-900/50 text-green-400 border border-green-700 px-2 py-1 rounded-full font-bold animate-pulse">
                    ABIERTO
                </span>
            </div>

            {/* Horse List */}
            {winMarket ? (
                <div className="space-y-2">
                    {winMarket.selections.map((sel, i) => {
                        const odds = winMarket.odds?.[sel.selection_key] || 1.0;
                        return (
                            <div
                                key={sel.selection_key}
                                className="bg-slate-800/80 border border-slate-700/50 rounded-xl p-3 flex items-center justify-between active:scale-[0.98] transition-transform"
                            >
                                <div className="flex items-center gap-3">
                                    <span className="text-2xl">
                                        {['🐴', '🦄', '🏇', '🐎', '🦓', '🫏'][i] || '🐴'}
                                    </span>
                                    <div>
                                        <p className="font-bold text-white text-sm">
                                            {sel.selection_key.replace('_', ' ').toUpperCase()}
                                        </p>
                                        <p className="text-xs text-slate-500">
                                            Pool: ${sel.pool_amount.toFixed(0)}
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-3">
                                    <div className="text-right">
                                        <p className="text-lg font-black text-amber-400">{odds.toFixed(2)}x</p>
                                    </div>
                                    <button
                                        onClick={() => openBetConfirm(sel.selection_key, winMarket.id)}
                                        className="bg-indigo-600 hover:bg-indigo-500 px-4 py-2 rounded-lg font-bold text-xs active:scale-90 transition-transform shadow-[0_0_10px_rgba(79,70,229,0.3)]"
                                    >
                                        APOSTAR
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <p className="text-slate-500 text-center mt-8">No hay mercados disponibles.</p>
            )}

            {/* Confirm Modal */}
            {showConfirm && selectedHorse && (
                <ConfirmModal
                    title={`Apostar a ${selectedHorse.replace('_', ' ').toUpperCase()}`}
                    description={`Monto: $${betAmount} — Saldo disponible: $${wallet.balance_available.toFixed(0)}`}
                    confirmLabel={`Confirmar ($${betAmount})`}
                    confirmColor="bg-indigo-600 shadow-[0_0_15px_rgba(79,70,229,0.5)]"
                    onConfirm={handleBet}
                    onCancel={() => setShowConfirm(false)}
                    loading={loading}
                />
            )}

            {/* Quick amount selector (shown when confirm is open) */}
            {showConfirm && (
                <div className="fixed bottom-[220px] left-0 right-0 max-w-md mx-auto px-6 z-[95]">
                    <div className="flex gap-2 justify-center">
                        {QUICK_AMOUNTS.map(amt => (
                            <button
                                key={amt}
                                onClick={() => setBetAmount(amt)}
                                className={`px-4 py-2 rounded-full text-sm font-bold transition-all ${betAmount === amt
                                        ? 'bg-indigo-500 text-white scale-110'
                                        : 'bg-slate-800 text-slate-400 border border-slate-700'
                                    }`}
                            >
                                ${amt}
                            </button>
                        ))}
                        <button
                            onClick={() => setBetAmount(Math.floor(wallet.balance_available))}
                            className={`px-4 py-2 rounded-full text-sm font-bold transition-all ${betAmount === Math.floor(wallet.balance_available)
                                    ? 'bg-red-600 text-white scale-110'
                                    : 'bg-slate-800 text-red-400 border border-red-700/50'
                                }`}
                        >
                            ALL-IN
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
