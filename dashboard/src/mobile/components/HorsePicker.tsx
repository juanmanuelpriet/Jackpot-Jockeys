const HORSE_COLORS = [
    'bg-red-600', 'bg-blue-600', 'bg-green-600',
    'bg-amber-500', 'bg-purple-600', 'bg-pink-600',
];

const HORSE_EMOJIS = ['🐴', '🦄', '🏇', '🐎', '🦓', '🫏'];

interface Props {
    numHorses?: number;
    selected: string | null;
    onSelect: (horseId: string) => void;
}

export default function HorsePicker({ numHorses = 6, selected, onSelect }: Props) {
    const horses = Array.from({ length: numHorses }, (_, i) => `horse_${i + 1}`);

    return (
        <div className="grid grid-cols-3 gap-2">
            {horses.map((id, i) => {
                const isSelected = selected === id;
                return (
                    <button
                        key={id}
                        onClick={() => onSelect(id)}
                        className={`flex flex-col items-center gap-1 p-3 rounded-xl border-2 transition-all active:scale-95 ${isSelected
                                ? 'border-amber-400 bg-amber-400/10 shadow-[0_0_12px_rgba(251,191,36,0.3)] scale-105'
                                : 'border-slate-700 bg-slate-800/50'
                            }`}
                    >
                        <span className="text-2xl">{HORSE_EMOJIS[i]}</span>
                        <span className={`text-xs font-bold ${isSelected ? 'text-amber-300' : 'text-slate-400'}`}>
                            {id.replace('_', ' ').toUpperCase()}
                        </span>
                        <div className={`w-full h-1 rounded-full ${HORSE_COLORS[i]} opacity-60`} />
                    </button>
                );
            })}
        </div>
    );
}
