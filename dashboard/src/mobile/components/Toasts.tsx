import { useMobileStore } from '../core/mobileStore';

export default function Toasts() {
    const toasts = useMobileStore(s => s.toasts);
    const removeToast = useMobileStore(s => s.removeToast);

    if (toasts.length === 0) return null;

    const colorMap: Record<string, string> = {
        success: 'bg-green-900/90 border-green-500 text-green-200',
        error: 'bg-red-900/90 border-red-500 text-red-200',
        warning: 'bg-amber-900/90 border-amber-500 text-amber-200',
        info: 'bg-indigo-900/90 border-indigo-500 text-indigo-200',
    };

    return (
        <div className="fixed top-0 left-0 right-0 flex flex-col items-center gap-2 pt-[env(safe-area-inset-top)] px-4 z-[100] pointer-events-none max-w-md mx-auto">
            {toasts.map(toast => (
                <div
                    key={toast.id}
                    onClick={() => removeToast(toast.id)}
                    className={`w-full pointer-events-auto px-4 py-3 rounded-xl border text-sm font-bold shadow-lg backdrop-blur-md animate-slide-down cursor-pointer ${colorMap[toast.type] || colorMap.info}`}
                >
                    {toast.text}
                </div>
            ))}
        </div>
    );
}
