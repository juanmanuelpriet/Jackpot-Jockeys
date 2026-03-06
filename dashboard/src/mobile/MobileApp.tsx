import { useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useMobileStore } from './core/mobileStore';
import MobileJoin from './MobileJoin';
import BottomTabBar, { type TabId } from './components/BottomTabBar';
import Toasts from './components/Toasts';
import BetsTab from './tabs/BetsTab';
import PowersTab from './tabs/PowersTab';
import WalletTab from './tabs/WalletTab';

function MobileGameView() {
    const { race, wallet, user } = useMobileStore();
    const [activeTab, setActiveTab] = useState<TabId>('bets');

    // If no user, redirect to join
    if (!user) return <Navigate to="/m" replace />;

    const stateColorMap: Record<string, string> = {
        'BettingOpen': 'bg-green-900/40 text-green-400 border-green-700/50',
        'RaceRunning': 'bg-red-900/40 text-red-400 border-red-700/50',
        'Settling': 'bg-amber-900/40 text-amber-400 border-amber-700/50',
        'Results': 'bg-indigo-900/40 text-indigo-400 border-indigo-700/50',
    };

    const stateColor = stateColorMap[race?.current_state || ''] || 'bg-slate-800 text-slate-400 border-slate-700';

    return (
        <div className="flex flex-col h-screen bg-slate-950 text-white">
            {/* Top Status Bar */}
            <div className="flex items-center justify-between px-4 py-3 bg-slate-900/90 border-b border-slate-800 backdrop-blur-md sticky top-0 z-40 pt-[env(safe-area-inset-top)]">
                <div className="flex items-center gap-2">
                    <span className="text-lg">🏇</span>
                    <span className="font-bold text-sm text-white">${wallet.balance_available.toFixed(0)}</span>
                </div>

                <div className={`px-3 py-1 rounded-full border text-[10px] font-bold uppercase tracking-wider ${stateColor}`}>
                    {race?.current_state || 'CONECTANDO...'}
                </div>

                <span className="text-xs text-slate-600 font-mono">{user.username}</span>
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-hidden flex flex-col">
                {activeTab === 'bets' && <BetsTab />}
                {activeTab === 'powers' && <PowersTab />}
                {activeTab === 'wallet' && <WalletTab />}
            </div>

            {/* Bottom Tab Bar */}
            <BottomTabBar active={activeTab} onChange={setActiveTab} />

            {/* Toast Layer */}
            <Toasts />
        </div>
    );
}

export default function MobileApp() {
    return (
        <div className="min-h-screen bg-slate-950 text-white font-sans max-w-md mx-auto relative">
            <Routes>
                <Route path="/" element={<MobileJoin />} />
                <Route path="/game" element={<MobileGameView />} />
            </Routes>
        </div>
    );
}
