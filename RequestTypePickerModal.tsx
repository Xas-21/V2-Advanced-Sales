import React from 'react';
import { X } from 'lucide-react';

export type RequestTypePickerModalProps = {
    open: boolean;
    onClose: () => void;
    onSelectType: (type: 'event_rooms' | 'accommodation' | 'series' | 'event') => void;
    theme: any;
};

const OPTIONS: {
    type: 'event_rooms' | 'accommodation' | 'series' | 'event';
    label: string;
    desc: string;
    colorKey: 'blue' | 'cyan' | 'purple' | 'orange';
    icon: string;
}[] = [
    {
        type: 'event_rooms',
        label: 'Event with Accommodation',
        desc: 'Event including hotel bookings',
        colorKey: 'blue',
        icon: '🏨',
    },
    {
        type: 'accommodation',
        label: 'Accommodation Only',
        desc: 'Room blocks without events',
        colorKey: 'cyan',
        icon: '🛏️',
    },
    {
        type: 'series',
        label: 'Series Group',
        desc: 'Recurring group events',
        colorKey: 'purple',
        icon: '📅',
    },
    {
        type: 'event',
        label: 'Event',
        desc: 'Special events and occasions',
        colorKey: 'orange',
        icon: '🎉',
    },
];

export default function RequestTypePickerModal({
    open,
    onClose,
    onSelectType,
    theme,
}: RequestTypePickerModalProps) {
    if (!open) return null;
    const colors = theme.colors;

    return (
        <div
            className="fixed inset-0 z-[220] flex items-center justify-center p-4"
            style={{ backgroundColor: 'rgba(0,0,0,0.75)' }}
            onClick={onClose}
        >
            <div
                className="w-full max-w-2xl rounded-2xl border-2 shadow-2xl p-6"
                style={{ backgroundColor: colors.card, borderColor: colors.border }}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-bold" style={{ color: colors.textMain }}>
                        Select request type
                    </h2>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-2 rounded-lg hover:bg-white/10"
                        style={{ color: colors.textMuted }}
                        aria-label="Close"
                    >
                        <X size={22} />
                    </button>
                </div>
                <p className="text-sm mb-4" style={{ color: colors.textMuted }}>
                    Choose the type of request to create for this account:
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {OPTIONS.map((item) => {
                        const c = colors[item.colorKey] || colors.primary;
                        return (
                            <button
                                key={item.type}
                                type="button"
                                onClick={() => onSelectType(item.type)}
                                className="p-5 rounded-xl border-2 text-left transition-all hover:scale-[1.02]"
                                style={{ backgroundColor: `${c}15`, borderColor: c }}
                            >
                                <div className="text-2xl mb-2">{item.icon}</div>
                                <div className="font-bold mb-1" style={{ color: colors.textMain }}>
                                    {item.label}
                                </div>
                                <div className="text-xs" style={{ color: colors.textMuted }}>
                                    {item.desc}
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
