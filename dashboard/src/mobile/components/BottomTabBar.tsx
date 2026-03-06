import { useMobileStore } from '../core/mobileStore';

const tabs = [
    { id: 'bets', label: 'Apuestas', icon: '🏇' },
    { id: 'powers', label: 'Poderes', icon: '⚡' },
    { id: 'wallet', label: 'Billetera', icon: '💰' },
] as const;

export type TabId = typeof tabs[number]['id'];

interface Props {
    active: TabId;
    onChange: (tab: TabId) => void;
}

export default function BottomTabBar({ active, onChange }: Props) {
    const wallet = useMobileStore(s => s.wallet);

    return (
        <div className="fixed bottom-0 left-0 right-0 bg-slate-900/95 backdrop-blur-md border-t border-slate-700/50 flex justify-around items-center h-16 pb-[env(safe-area-inset-bottom)] z-50 max-w-md mx-auto">
            {tabs.map(tab => {
                const isActive = active === tab.id;
                return (
                    <button
                        key={tab.id}
                        onClick={() => onChange(tab.id)}
                        className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2 transition-all ${isActive
                                ? 'text-indigo-400 scale-110'
                                : 'text-slate-500 active:scale-95'
                            }`}
                    >
                        <span className="text-xl">{tab.icon}</span>
                        <span className="text-[10px] font-bold uppercase tracking-wider">{tab.label}</span>
                        {tab.id === 'wallet' && (
                            <span className={`text-[9px] font-mono ${isActive ? 'text-green-400' : 'text-slate-600'}`}>
                                ${wallet.balance_available.toFixed(0)}
                            </span>
                        )}
                    </button>
                );
            })}
        </div>
    );
}
