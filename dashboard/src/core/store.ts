import { create } from 'zustand';

// Types representing the Backend Snapshot
export interface HorsePlacement {
    horse_id: string;
    position: number;
}

export interface PlayerWallet {
    user_id: number;
    balance_total: number;
    balance_locked: number;
}

export interface MarketPool {
    selection_key: string;
    pool_amount: number;
}

export interface MarketOdds {
    [selection_key: string]: number;
}

export interface Market {
    id: number;
    type: string;
    status: string;
    selections: MarketPool[];
    odds?: MarketOdds;
}

export interface Race {
    id: number;
    lobby_id: string;
    current_state: string; // "Lobby", "BettingOpen", "RaceRunning", "Settling", "Results", "Ended"
    state_version: number;
    num_horses: number;
}

export interface ActivePower {
    power_id: string;
    target_id: string;
}

export interface GameState {
    race: Race | null;
    markets: Market[];
    wallets: PlayerWallet[];
    placements: HorsePlacement[];
    logs: any[]; // Narrator logs
    activePowers: ActivePower[];
    playersCount: number;

    // Actions
    setSnapshot: (snapshot: any) => void;
    updateRaceState: (newState: string, version: number) => void;
    updateOdds: (marketId: number, odds: MarketOdds) => void;
    updateWallet: (userId: number, total: number, locked: number) => void;
    addLog: (log: any) => void;
    addActivePower: (powerId: string, targetId: string) => void;
    removeActivePower: (powerId: string, targetId: string) => void;
    resetForNextRace: () => void;
}

export const useGameStore = create<GameState>((set) => ({
    race: null,
    markets: [],
    wallets: [],
    placements: [],
    logs: [],
    activePowers: [],
    playersCount: 0,

    resetForNextRace: () => set((state) => ({
        markets: [],
        placements: [],
        activePowers: [],
        logs: [{ type: 'system', text: '¡Nueva Carrera Abierta! Hagan sus apuestas.', time: new Date() }, ...state.logs].slice(0, 50)
    })),

    addActivePower: (powerId, targetId) => set((state) => ({
        activePowers: [...state.activePowers, { power_id: powerId, target_id: targetId }]
    })),

    removeActivePower: (powerId, targetId) => set((state) => ({
        activePowers: state.activePowers.filter(p => !(p.power_id === powerId && p.target_id === targetId))
    })),

    setSnapshot: (snapshot) => set(() => {
        console.log("Setting snapshot:", snapshot);
        return {
            race: snapshot.race,
            markets: snapshot.markets || [],
            wallets: snapshot.wallets || [],
            placements: snapshot.placements || [],
            activePowers: snapshot.activePowers || [],
            playersCount: snapshot.wallets ? snapshot.wallets.length : 0,
        };
    }),

    updateRaceState: (newState, version) => set((state) => {
        if (!state.race) return state;
        return {
            race: { ...state.race, current_state: newState, state_version: version }
        };
    }),

    updateOdds: (marketId, odds) => set((state) => {
        return {
            markets: state.markets.map(m =>
                m.id === marketId ? { ...m, odds: odds } : m
            )
        };
    }),

    updateWallet: (userId, total, locked) => set((state) => {
        const exists = state.wallets.find(w => w.user_id === userId);
        if (!exists) {
            return {
                wallets: [...state.wallets, { user_id: userId, balance_total: total, balance_locked: locked }],
                playersCount: state.playersCount + 1
            };
        }
        return {
            wallets: state.wallets.map(w =>
                w.user_id === userId
                    ? { ...w, balance_total: total, balance_locked: locked }
                    : w
            )
        };
    }),

    addLog: (log) => set((state) => {
        // Keep only last 50 logs to prevent memory leak
        const newLogs = [log, ...state.logs].slice(0, 50);
        return { logs: newLogs };
    })
}));
