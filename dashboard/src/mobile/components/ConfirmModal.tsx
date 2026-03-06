interface Props {
    title: string;
    description: string;
    confirmLabel: string;
    confirmColor?: string;
    onConfirm: () => void;
    onCancel: () => void;
    loading?: boolean;
}

export default function ConfirmModal({ title, description, confirmLabel, confirmColor, onConfirm, onCancel, loading }: Props) {
    return (
        <div className="fixed inset-0 z-[90] flex items-end justify-center" onClick={onCancel}>
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

            {/* Drawer */}
            <div
                className="relative w-full max-w-md bg-slate-900 border-t border-slate-700 rounded-t-3xl p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] animate-slide-up"
                onClick={e => e.stopPropagation()}
            >
                <div className="w-12 h-1 bg-slate-600 rounded-full mx-auto mb-4" />

                <h3 className="text-xl font-black text-white mb-2">{title}</h3>
                <p className="text-sm text-slate-400 mb-6">{description}</p>

                <div className="flex gap-3">
                    <button
                        onClick={onCancel}
                        className="flex-1 py-3 rounded-xl bg-slate-800 text-slate-300 font-bold border border-slate-700 active:scale-95 transition-transform"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={onConfirm}
                        disabled={loading}
                        className={`flex-1 py-3 rounded-xl font-black text-white active:scale-95 transition-transform disabled:opacity-50 ${confirmColor || 'bg-indigo-600 shadow-[0_0_15px_rgba(79,70,229,0.4)]'
                            }`}
                    >
                        {loading ? '...' : confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}
