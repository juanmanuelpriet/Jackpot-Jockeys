import { useGameStore } from '../core/store';
import RaceView from '../components/race/RaceView';
import BettingView from '../components/betting/BettingView';
import SocialView from '../components/social/SocialView';
import NarratorLog from '../components/narrator/NarratorLog';
import AdminPanel from '../components/admin/AdminPanel';
import { useEffect } from 'react';

export default function TheShowView() {
    const { race } = useGameStore();

    // If no race is in store (e.g. refreshed page without WS reconnect logic full), 
    // we might want to go back to setup or show a loader. 
    // For now, we assume WS re-connects and fetches snapshot.
    useEffect(() => {
        if (!race) {
            // Could wait for WS reconnect, but if accessed directly without lobby, redirect
            console.log("No race snapshot yet...");
        }
    }, [race]);

    return (
        <div className="min-h-screen bg-slate-950 flex flex-col pt-4 px-4 overflow-hidden relative">

            {/* Background ambient lighting */}
            <div className="absolute top-0 left-1/4 w-1/2 h-96 bg-purple-900/20 rounded-full blur-[120px] -z-10 pointer-events-none" />
            <div className="absolute bottom-0 right-1/4 w-1/3 h-80 bg-blue-900/20 rounded-full blur-[100px] -z-10 pointer-events-none" />

            {/* Main Grid Layout */}
            <div className="flex-1 grid grid-cols-12 grid-rows-6 gap-6 mb-4">

                {/* Left Column: Social & Narrator (3 cols) */}
                <div className="col-span-3 row-span-6 flex flex-col gap-6">
                    <div className="h-1/2 glass-panel p-4 flex flex-col">
                        <SocialView />
                    </div>
                    <div className="h-1/2 glass-panel p-4 flex flex-col overflow-hidden">
                        <NarratorLog />
                    </div>
                </div>

                {/* Center/Right Column: Race & Betting (9 cols) */}
                <div className="col-span-9 row-span-6 flex flex-col gap-6">
                    {/* Top Half: The Race Track */}
                    <div className="h-3/5 glass-panel p-6 flex flex-col relative overflow-hidden">
                        <RaceView />
                    </div>

                    {/* Bottom Half: Betting / Pools */}
                    <div className="h-2/5 glass-panel p-6 flex flex-col">
                        <BettingView />
                    </div>
                </div>

            </div>

            {/* Admin Control Bar (always fixed at bottom or as an overlay) */}
            <AdminPanel />
        </div>
    );
}
