import { create } from 'zustand';

// ── Types ──

export interface MobileUser {
    id: number;
    username: string;
    token: string;
    joinCode: string;
}

export interface MobileWallet {
    balance_total: number;
    balance_locked: number;
    balance_available: number;
}

export interface MarketSelection {
    selection_key: string;
    pool_amount: number;
}

export interface MarketOdds {
    [key: string]: number;
}

export interface MobileMarket {
    id: number;
    type: string;
    status: string;
    selections: MarketSelection[];
    odds: MarketOdds;
}

export interface MobileRace {
    id: number;
    lobby_id: string;
    current_state: string;
    state_version: number;
}

export interface ActivityItem {
    id: string;
    type: 'bet' | 'power' | 'settlement' | 'system';
    text: string;
    amount?: number;
    time: Date;
}

export interface Toast {
    id: string;
    type: 'success' | 'error' | 'warning' | 'info';
    text: string;
}

export interface PowerCard {
    id: string;
    nombre: string;
    tipo: string;
    tamano: string;
    costo_usd: number;
    objetivo: string;
    duracion_s: number;
    cooldown_s: number;
}

// ── Store ──

export interface MobileState {
    // Auth
    user: MobileUser | null;
    setUser: (user: MobileUser) => void;

    // Race
    race: MobileRace | null;

    // Markets
    markets: MobileMarket[];

    // Wallet
    wallet: MobileWallet;

    // Activity Feed
    activity: ActivityItem[];
    addActivity: (item: ActivityItem) => void;

    // Toasts
    toasts: Toast[];
    addToast: (type: Toast['type'], text: string) => void;
    removeToast: (id: string) => void;

    // Powers catalog
    powers: PowerCard[];
    setPowers: (powers: PowerCard[]) => void;

    // Snapshot hydration
    setSnapshot: (data: any) => void;

    // Partial updates
    updateRaceState: (newState: string, version: number) => void;
    updateOdds: (marketId: number, odds: MarketOdds) => void;
    updateWallet: (total: number, locked: number) => void;

    // Reset
    resetForNextRace: () => void;
}

let toastCounter = 0;

export const useMobileStore = create<MobileState>((set) => ({
    user: null,
    race: null,
    markets: [],
    wallet: { balance_total: 1000, balance_locked: 0, balance_available: 1000 },
    activity: [],
    toasts: [],
    powers: [],

    setUser: (user) => set({ user }),

    setPowers: (powers) => set({ powers }),

    addActivity: (item) => set((state) => ({
        activity: [item, ...state.activity].slice(0, 50)
    })),

    addToast: (type, text) => {
        const id = `toast_${++toastCounter}`;
        set((state) => ({
            toasts: [...state.toasts, { id, type, text }]
        }));
        // Auto-dismiss after 3s
        setTimeout(() => {
            set((state) => ({
                toasts: state.toasts.filter(t => t.id !== id)
            }));
        }, 3000);
    },

    removeToast: (id) => set((state) => ({
        toasts: state.toasts.filter(t => t.id !== id)
    })),

    setSnapshot: (data) => set(() => {
        const race: MobileRace = {
            id: data.race?.id || data.race_id,
            lobby_id: data.race?.lobby_id || data.lobby_id || '',
            current_state: data.race?.current_state || data.current_state || 'Lobby',
            state_version: data.race?.state_version || data.state_version || 0,
        };

        const wallet: MobileWallet = data.wallet || {
            balance_total: 1000,
            balance_locked: 0,
            balance_available: 1000,
        };

        return {
            race,
            markets: data.markets || [],
            wallet,
        };
    }),

    updateRaceState: (newState, version) => set((state) => ({
        race: state.race ? { ...state.race, current_state: newState, state_version: version } : state.race
    })),

    updateOdds: (marketId, odds) => set((state) => ({
        markets: state.markets.map(m =>
            m.id === marketId ? { ...m, odds } : m
        )
    })),

    updateWallet: (total, locked) => set(() => ({
        wallet: {
            balance_total: total,
            balance_locked: locked,
            balance_available: Math.max(0, total - locked),
        }
    })),

    resetForNextRace: () => set((state) => ({
        markets: [],
        activity: [
            { id: `sys_${Date.now()}`, type: 'system' as const, text: '🏁 ¡Nueva carrera! Hagan sus apuestas.', time: new Date() },
            ...state.activity
        ].slice(0, 50)
    })),
}));
