import React, { useEffect, useState } from 'react';
import { X, Bell, Plus, Pencil, Trash2, AlertTriangle } from 'lucide-react';
import type { RequestAlert } from './requestAlerts';
import { normalizeRequestAlerts } from './requestAlerts';

export type RequestAlertsModalProps = {
    isOpen: boolean;
    theme: { colors: any };
    request: { id: string; confirmationNo?: string; alerts?: unknown } | null;
    canManage: boolean;
    /** Opened automatically when entering request details (read-only list + dismiss). */
    autoOpened: boolean;
    actorName: string;
    onClose: () => void;
    onSave: (alerts: RequestAlert[]) => Promise<void>;
};

export default function RequestAlertsModal({
    isOpen,
    theme,
    request,
    canManage,
    autoOpened,
    actorName,
    onClose,
    onSave,
}: RequestAlertsModalProps) {
    const colors = theme.colors;
    const [draft, setDraft] = useState<RequestAlert[]>([]);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [formTitle, setFormTitle] = useState('');
    const [formMessage, setFormMessage] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!isOpen || !request) return;
        setDraft(normalizeRequestAlerts(request));
        setEditingId(null);
        setFormTitle('');
        setFormMessage('');
    }, [isOpen, request]);

    if (!isOpen || !request) return null;

    const persist = async (next: RequestAlert[]) => {
        setSaving(true);
        try {
            await onSave(next);
            setDraft(next);
        } finally {
            setSaving(false);
        }
    };

    const startEdit = (a: RequestAlert) => {
        setEditingId(a.id);
        setFormTitle(a.title);
        setFormMessage(a.message);
    };

    const cancelForm = () => {
        setEditingId(null);
        setFormTitle('');
        setFormMessage('');
    };

    const submitForm = async () => {
        const msg = formMessage.trim();
        const ttl = formTitle.trim();
        if (!msg && !ttl) return;

        if (editingId) {
            const next = draft.map((a) =>
                a.id === editingId
                    ? {
                          ...a,
                          title: ttl,
                          message: msg || a.message,
                          updatedAt: new Date().toISOString(),
                      }
                    : a
            );
            await persist(next);
        } else {
            const row: RequestAlert = {
                id: `AL-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
                title: ttl,
                message: msg,
                createdAt: new Date().toISOString(),
                createdBy: actorName,
            };
            await persist([...draft, row]);
        }
        cancelForm();
    };

    const removeAlert = async (id: string) => {
        if (!window.confirm('Remove this alert?')) return;
        await persist(draft.filter((a) => a.id !== id));
        if (editingId === id) cancelForm();
    };

    return (
        <div className="fixed inset-0 z-[175] flex items-center justify-center p-4">
            <button
                type="button"
                className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                aria-label="Close"
                onClick={onClose}
            />
            <div
                className="relative w-full max-w-lg rounded-2xl border shadow-2xl overflow-hidden animate-in zoom-in duration-200 max-h-[85vh] flex flex-col"
                style={{ backgroundColor: colors.card, borderColor: colors.border }}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="p-4 border-b flex items-start justify-between gap-3 shrink-0" style={{ borderColor: colors.border }}>
                    <div className="flex items-start gap-3 min-w-0">
                        <div
                            className="p-2 rounded-xl shrink-0 relative"
                            style={{ backgroundColor: colors.primaryDim || `${colors.primary}18` }}
                        >
                            <Bell size={22} style={{ color: colors.primary }} />
                            {draft.length > 0 ? (
                                <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 shadow">
                                    <AlertTriangle size={9} className="text-white" fill="currentColor" />
                                </span>
                            ) : null}
                        </div>
                        <div className="min-w-0">
                            <h2 className="font-black text-lg leading-tight" style={{ color: colors.textMain }}>
                                {autoOpened ? 'Alerts on this request' : 'Request alerts'}
                            </h2>
                            <p className="text-[11px] font-mono opacity-50 mt-1 truncate" style={{ color: colors.textMuted }}>
                                {request.confirmationNo || '—'} · {request.id}
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-2 rounded-lg hover:bg-white/10 transition-colors shrink-0"
                        style={{ color: colors.textMuted }}
                        aria-label="Close"
                    >
                        <X size={20} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {draft.length === 0 ? (
                        <p className="text-sm opacity-50 text-center py-8" style={{ color: colors.textMuted }}>
                            {canManage ? 'No alerts yet. Add one below.' : 'No alerts on this request.'}
                        </p>
                    ) : (
                        draft.map((a) => (
                            <div
                                key={a.id}
                                className="rounded-xl border p-3 space-y-2"
                                style={{ borderColor: colors.border, backgroundColor: `${colors.textMuted}08` }}
                            >
                                <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                        {a.title ? (
                                            <p className="font-bold text-sm" style={{ color: colors.textMain }}>
                                                {a.title}
                                            </p>
                                        ) : null}
                                        <p className="text-sm whitespace-pre-wrap mt-1" style={{ color: colors.textMain }}>
                                            {a.message || '—'}
                                        </p>
                                    </div>
                                    {canManage ? (
                                        <div className="flex items-center gap-1 shrink-0">
                                            <button
                                                type="button"
                                                onClick={() => startEdit(a)}
                                                className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                                                style={{ color: colors.textMuted }}
                                                aria-label="Edit alert"
                                            >
                                                <Pencil size={14} />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => removeAlert(a.id)}
                                                className="p-1.5 rounded-lg hover:bg-red-500/15 transition-colors text-red-500"
                                                aria-label="Delete alert"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    ) : null}
                                </div>
                                <p className="text-[9px] font-mono opacity-40" style={{ color: colors.textMuted }}>
                                    {a.createdBy ? `${a.createdBy} · ` : ''}
                                    {new Date(a.createdAt).toLocaleString()}
                                    {a.updatedAt ? ` · edited ${new Date(a.updatedAt).toLocaleString()}` : ''}
                                </p>
                            </div>
                        ))
                    )}
                </div>

                {canManage ? (
                    <div className="p-4 border-t space-y-3 shrink-0" style={{ borderColor: colors.border }}>
                        <p className="text-[10px] font-black uppercase tracking-widest opacity-50" style={{ color: colors.textMuted }}>
                            {editingId ? 'Edit alert' : 'Add alert'}
                        </p>
                        <input
                            type="text"
                            value={formTitle}
                            onChange={(e) => setFormTitle(e.target.value)}
                            placeholder="Title (optional)"
                            className="w-full px-3 py-2 rounded-xl border text-sm outline-none"
                            style={{
                                backgroundColor: colors.textMuted + '12',
                                borderColor: colors.border,
                                color: colors.textMain,
                            }}
                        />
                        <textarea
                            value={formMessage}
                            onChange={(e) => setFormMessage(e.target.value)}
                            placeholder="Message…"
                            rows={3}
                            className="w-full px-3 py-2 rounded-xl border text-sm outline-none resize-none"
                            style={{
                                backgroundColor: colors.textMuted + '12',
                                borderColor: colors.border,
                                color: colors.textMain,
                            }}
                        />
                        <div className="flex flex-wrap gap-2 justify-end">
                            {editingId ? (
                                <button
                                    type="button"
                                    onClick={cancelForm}
                                    className="px-4 py-2 rounded-xl border text-xs font-bold"
                                    style={{ borderColor: colors.border, color: colors.textMain }}
                                >
                                    Cancel edit
                                </button>
                            ) : null}
                            <button
                                type="button"
                                disabled={saving || (!formMessage.trim() && !formTitle.trim())}
                                onClick={() => submitForm()}
                                className="px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 disabled:opacity-40"
                                style={{ backgroundColor: colors.primary, color: '#000' }}
                            >
                                <Plus size={14} />
                                {editingId ? 'Save changes' : 'Add alert'}
                            </button>
                        </div>
                    </div>
                ) : null}

                <div className="p-3 bg-black/10 flex justify-end gap-2 shrink-0 border-t" style={{ borderColor: colors.border }}>
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-5 py-2 rounded-xl text-xs font-bold"
                        style={{ backgroundColor: colors.primary, color: '#000' }}
                    >
                        {autoOpened ? 'OK' : 'Close'}
                    </button>
                </div>
            </div>
        </div>
    );
}
