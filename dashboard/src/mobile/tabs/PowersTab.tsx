import { useState, useEffect } from 'react';
import { useMobileStore, type PowerCard } from '../core/mobileStore';
import { getPowers, castPower } from '../core/mobileApi';
import ConfirmModal from '../components/ConfirmModal';
import HorsePicker from '../components/HorsePicker';

export default function PowersTab() {
    const { race, wallet, powers } = useMobileStore();
    const setPowers = useMobileStore(s => s.setPowers);
    const addToast = useMobileStore(s => s.addToast);

    const [selectedPower, setSelectedPower] = useState<PowerCard | null>(null);
    const [targetHorse, setTargetHorse] = useState<string | null>(null);
    const [showConfirm, setShowConfirm] = useState(false);
    const [loading, setLoading] = useState(false);

    const isRaceRunning = race?.current_state === 'RaceRunning';

    // Fetch catalog
    useEffect(() => {
        if (powers.length === 0) {
            getPowers()
                .then(data => setPowers(data))
                .catch(() => {
                    // Use hardcoded MVP catalog if endpoint fails
                    setPowers([
                        { id: 'pwr_boost_01', nombre: 'Inyección Adrenalina', tipo: 'buff', tamano: 'pequeño', costo_usd: 20, objetivo: 'otro', duracion_s: 4, cooldown_s: 5 },
                        { id: 'pwr_oil_01', nombre: 'Mancha de Aceite', tipo: 'debuff', tamano: 'pequeño', costo_usd: 25, objetivo: 'otro', duracion_s: 3, cooldown_s: 8 },
                        { id: 'pwr_scramble_01', nombre: 'Scramble Total', tipo: 'debuff', tamano: 'grande', costo_usd: 75, objetivo: 'global', duracion_s: 2, cooldown_s: 15 },
                    ]);
                });
        }
    }, []);

    const handleCast = async () => {
        if (!selectedPower || !targetHorse) return;
        setLoading(true);
        try {
            await castPower(selectedPower.id, targetHorse);
            addToast('success', `⚡ ${selectedPower.nombre} lanzado a ${targetHorse.replace('_', ' ')}`);
            setShowConfirm(false);
            setSelectedPower(null);
            setTargetHorse(null);
        } catch (e: any) {
            const msg = e?.response?.data?.detail || 'Error al castear poder';
            addToast('error', `❌ ${msg}`);
        } finally {
            setLoading(false);
        }
    };

    const openPowerFlow = (power: PowerCard) => {
        setSelectedPower(power);
        setTargetHorse(null);
        setShowConfirm(true);
    };

    if (!isRaceRunning) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
                <div className="text-5xl mb-4">⚡</div>
                <p className="text-xl font-bold text-slate-300 mb-2">Poderes Bloqueados</p>
                <p className="text-sm text-slate-500">
                    {race?.current_state === 'BettingOpen'
                        ? 'Los poderes se activan cuando empieza la carrera.'
                        : 'Esperando carrera activa...'}
                </p>
            </div>
        );
    }

    return (
        <div className="flex-1 overflow-y-auto px-4 pt-4 pb-20">
            <h2 className="text-lg font-black text-white mb-4">⚡ TIENDA DE PODERES</h2>

            {/* Cards Scroll */}
            <div className="flex gap-3 overflow-x-auto pb-4 snap-x snap-mandatory -mx-4 px-4">
                {powers.map(power => {
                    const canAfford = wallet.balance_available >= power.costo_usd;
                    const isBuff = power.tipo === 'buff';
                    return (
                        <div
                            key={power.id}
                            className={`flex-shrink-0 w-[200px] snap-center rounded-2xl p-4 border-2 transition-all ${isBuff
                                    ? 'bg-gradient-to-b from-green-900/40 to-slate-900 border-green-700/50'
                                    : 'bg-gradient-to-b from-red-900/40 to-slate-900 border-red-700/50'
                                }`}
                        >
                            <div className="flex justify-between items-start mb-2">
                                <span className="text-3xl">{isBuff ? '🛡️' : '💀'}</span>
                                <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${isBuff ? 'bg-green-800 text-green-300' : 'bg-red-800 text-red-300'
                                    }`}>
                                    {power.tipo.toUpperCase()}
                                </span>
                            </div>

                            <h3 className="font-bold text-white text-sm mb-1">{power.nombre}</h3>

                            <div className="text-xs text-slate-400 space-y-0.5 mb-3">
                                <p>⏱️ Duración: {power.duracion_s}s</p>
                                <p>❄️ Cooldown: {power.cooldown_s}s</p>
                                <p>🎯 Objetivo: {power.objetivo}</p>
                            </div>

                            <div className="flex items-center justify-between">
                                <span className="font-black text-amber-400 text-lg">${power.costo_usd}</span>
                                <button
                                    onClick={() => openPowerFlow(power)}
                                    disabled={!canAfford}
                                    className={`px-3 py-1.5 rounded-lg font-bold text-xs active:scale-90 transition-transform disabled:opacity-40 ${isBuff
                                            ? 'bg-green-600 text-white shadow-[0_0_8px_rgba(34,197,94,0.3)]'
                                            : 'bg-red-600 text-white shadow-[0_0_8px_rgba(239,68,68,0.3)]'
                                        }`}
                                >
                                    CASTEAR
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Confirm Modal with Horse Picker */}
            {showConfirm && selectedPower && (
                <ConfirmModal
                    title={`Castear: ${selectedPower.nombre}`}
                    description={targetHorse
                        ? `Objetivo: ${targetHorse.replace('_', ' ').toUpperCase()} — Costo: $${selectedPower.costo_usd}`
                        : 'Selecciona un objetivo abajo:'}
                    confirmLabel={targetHorse ? `Lanzar ($${selectedPower.costo_usd})` : 'Selecciona objetivo'}
                    confirmColor={selectedPower.tipo === 'buff' ? 'bg-green-600' : 'bg-red-600'}
                    onConfirm={targetHorse ? handleCast : () => { }}
                    onCancel={() => { setShowConfirm(false); setSelectedPower(null); }}
                    loading={loading}
                />
            )}

            {/* Horse picker overlay when selecting target */}
            {showConfirm && selectedPower && (
                <div className="fixed bottom-[280px] left-0 right-0 max-w-md mx-auto px-6 z-[95]">
                    <HorsePicker
                        selected={targetHorse}
                        onSelect={setTargetHorse}
                    />
                </div>
            )}
        </div>
    );
}
