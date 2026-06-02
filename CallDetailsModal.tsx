import React, { useMemo } from 'react';
import { X, ScrollText } from 'lucide-react';
import { buildAccountCallTimeline, type CallTimelineEntry } from './crmActivitiesUtils';

export interface CallDetailsModalProps {
    open: boolean;
    onClose: () => void;
    lead: any | null;
    crmLeads?: Record<string, any[]>;
    salesCalls?: any[];
    theme: any;
}

function kindLabel(kind: CallTimelineEntry['kind']): string {
    switch (kind) {
        case 'log':
            return 'Logged';
        case 'next_step':
            return 'Next step';
        case 'completed':
            return 'Completed';
        case 'follow_up':
            return 'Follow-up';
        default:
            return 'Scheduled';
    }
}

export default function CallDetailsModal({ open, onClose, lead, crmLeads, salesCalls, theme }: CallDetailsModalProps) {
    const colors = theme.colors;

    const timeline = useMemo(() => {
        if (!lead) return [];
        const source = salesCalls
            ? { new: salesCalls }
            : crmLeads || { new: [] };
        return buildAccountCallTimeline(
            source,
            String(lead?.accountId || ''),
            String(lead?.company || ''),
            String(lead?.id || '')
        );
    }, [lead, crmLeads, salesCalls]);

    if (!open || !lead) return null;

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div
                className="w-full max-w-lg rounded-xl border shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
                style={{ backgroundColor: colors.card, borderColor: colors.border }}
            >
                <div
                    className="flex items-center justify-between px-5 py-4 border-b shrink-0"
                    style={{ borderColor: colors.border }}
                >
                    <div className="flex items-center gap-2 min-w-0">
                        <ScrollText size={18} style={{ color: colors.primary }} className="shrink-0" />
                        <div className="min-w-0">
                            <h2 className="text-sm font-bold uppercase tracking-wide truncate" style={{ color: colors.textMain }}>
                                Call history
                            </h2>
                            <p className="text-xs truncate" style={{ color: colors.textMuted }}>
                                {lead.company || '—'}
                            </p>
                        </div>
                    </div>
                    <button type="button" onClick={onClose} className="p-1 rounded hover:bg-white/10 shrink-0" aria-label="Close">
                        <X size={18} style={{ color: colors.textMuted }} />
                    </button>
                </div>
                <div className="p-5 overflow-y-auto flex-1 min-h-0 space-y-0">
                    {timeline.length === 0 ? (
                        <p className="text-sm text-center py-8" style={{ color: colors.textMuted }}>
                            No call history for this account yet.
                        </p>
                    ) : (
                        <ul className="relative border-l ml-2 space-y-4" style={{ borderColor: colors.border }}>
                            {timeline.map((entry) => (
                                <li key={entry.id} className="relative pl-5">
                                    <span
                                        className="absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full border-2"
                                        style={{
                                            borderColor: colors.primary,
                                            backgroundColor:
                                                entry.kind === 'completed'
                                                    ? colors.green
                                                    : entry.kind === 'log'
                                                      ? colors.cyan
                                                      : colors.card,
                                        }}
                                    />
                                    <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: colors.textMuted }}>
                                        {entry.atLabel} · {kindLabel(entry.kind)}
                                    </div>
                                    <div className="text-sm font-semibold mt-0.5" style={{ color: colors.textMain }}>
                                        {entry.title}
                                    </div>
                                    {entry.kind === 'log' ? (
                                        <div className="mt-2 space-y-2">
                                            {entry.description ? (
                                                <div>
                                                    <p className="text-xs font-bold" style={{ color: colors.textMain }}>
                                                        Description
                                                    </p>
                                                    <p className="text-xs mt-0.5 whitespace-pre-wrap" style={{ color: colors.textMuted }}>
                                                        {entry.description}
                                                    </p>
                                                </div>
                                            ) : null}
                                            {entry.nextStep ? (
                                                <div>
                                                    <p className="text-xs font-bold" style={{ color: colors.textMain }}>
                                                        Next Step
                                                    </p>
                                                    <p className="text-xs mt-0.5 whitespace-pre-wrap" style={{ color: colors.textMuted }}>
                                                        {entry.nextStep}
                                                    </p>
                                                </div>
                                            ) : null}
                                        </div>
                                    ) : (
                                        <>
                                            {entry.subject && entry.title !== entry.subject ? (
                                                <div className="text-[10px] mt-0.5" style={{ color: colors.textMuted }}>
                                                    {entry.subject}
                                                </div>
                                            ) : null}
                                            {entry.body ? (
                                                <p className="text-xs mt-1 whitespace-pre-wrap" style={{ color: colors.textMuted }}>
                                                    {entry.body}
                                                </p>
                                            ) : null}
                                        </>
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
                <div className="px-5 py-3 border-t shrink-0 flex justify-end" style={{ borderColor: colors.border }}>
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wide border"
                        style={{ borderColor: colors.border, color: colors.textMain }}
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}
