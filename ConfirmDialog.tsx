import React from 'react';

interface ConfirmDialogProps {
    isOpen: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    danger?: boolean;
    onConfirm: () => void;
    onCancel: () => void;
}

export default function ConfirmDialog({
    isOpen,
    title,
    message,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    danger = false,
    onConfirm,
    onCancel,
}: ConfirmDialogProps) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[220] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onCancel} />
            <div className="relative w-full max-w-lg rounded-2xl border border-white/10 bg-slate-900 shadow-2xl p-5">
                <h3 className="text-base font-bold text-white mb-3">{title}</h3>
                <pre className="whitespace-pre-wrap break-words text-xs leading-relaxed text-slate-200 bg-black/20 border border-white/10 rounded-xl p-3 max-h-[45vh] overflow-auto">
                    {message}
                </pre>
                <div className="mt-4 flex items-center justify-end gap-2">
                    <button
                        type="button"
                        onClick={onCancel}
                        className="px-4 py-2 rounded-xl border border-white/15 text-slate-200 text-sm font-semibold hover:bg-white/10 transition-colors"
                    >
                        {cancelLabel}
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors ${
                            danger
                                ? 'bg-red-500 text-white hover:bg-red-400'
                                : 'bg-blue-500 text-white hover:bg-blue-400'
                        }`}
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}
