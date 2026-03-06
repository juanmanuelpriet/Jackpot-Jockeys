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

export interface HorseTelemetry {
    id: string;
    pos_mm: number;
    lane: number;
    vel_mmps: number;
    lap: number;
    segment_idx: number;
    rank: number;
    progress_permil: number;
    stamina_permil: number;
    active_mods: string[];
    finished: boolean;
}

export interface GameState {
    race: Race | null;
    markets: Market[];
    wallets: PlayerWallet[];
    placements: HorsePlacement[];
    logs: any[]; // Narrator logs
    activePowers: ActivePower[];
    horseTelemetry: HorseTelemetry[];
    simTick: number;
    playersCount: number;
    connectedPlayers: { user_id: number; username: string }[];

    // Actions
    setSnapshot: (snapshot: any) => void;
    updateRaceState: (newState: string, version: number) => void;
    updateOdds: (marketId: number, odds: MarketOdds) => void;
    updateWallet: (userId: number, total: number, locked: number) => void;
    addLog: (log: any) => void;
    addActivePower: (powerId: string, targetId: string) => void;
    removeActivePower: (powerId: string, targetId: string) => void;
    updateHorseTelemetry: (tick: number, horses: HorseTelemetry[]) => void;
    resetForNextRace: () => void;

    // Player Roster
    addConnectedPlayer: (userId: number, username: string) => void;
    removeConnectedPlayer: (userId: number) => void;
}

export const useGameStore = create<GameState>((set) => ({
    race: null,
    markets: [],
    wallets: [],
    placements: [],
    logs: [],
    activePowers: [],
    horseTelemetry: [],
    simTick: 0,
    playersCount: 0,
    connectedPlayers: [],

    resetForNextRace: () => set((state) => ({
        markets: [],
        placements: [],
        activePowers: [],
        horseTelemetry: [],
        simTick: 0,
        logs: [{ type: 'system', text: '¡Nueva Carrera Abierta! Hagan sus apuestas.', time: new Date() }, ...state.logs].slice(0, 50)
    })),

    updateHorseTelemetry: (tick, horses) => set(() => ({
        horseTelemetry: horses,
        simTick: tick,
    })),

    addActivePower: (powerId, targetId) => set((state) => ({
        activePowers: [...state.activePowers, { power_id: powerId, target_id: targetId }]
    })),

    removeActivePower: (powerId, targetId) => set((state) => ({
        activePowers: state.activePowers.filter(p => !(p.power_id === powerId && p.target_id === targetId))
    })),

    addConnectedPlayer: (userId, username) => set((state) => {
        if (state.connectedPlayers.some(p => p.user_id === userId)) return state;
        return { connectedPlayers: [...state.connectedPlayers, { user_id: userId, username }] };
    }),

    removeConnectedPlayer: (userId) => set((state) => ({
        connectedPlayers: state.connectedPlayers.filter(p => p.user_id !== userId)
    })),

    setSnapshot: (snapshot) => set(() => {
        console.log("Setting snapshot:", snapshot);

        const race: Race = {
            id: snapshot.race_id,
            lobby_id: snapshot.lobby_id,
            current_state: snapshot.current_state,
            state_version: snapshot.state_version,
            num_horses: snapshot.num_horses || 6,
        };

        return {
            race,
            markets: snapshot.markets || [],
            wallets: snapshot.wallets || [],
            placements: snapshot.placements || [],
            activePowers: snapshot.active_powers || [],
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
