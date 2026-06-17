import React from 'react';
import { Construction } from 'lucide-react';

type DashboardHubComingSoonProps = {
    tabLabel: string;
    colors: any;
};

export default function DashboardHubComingSoon({ tabLabel, colors }: DashboardHubComingSoonProps) {
    return (
        <div
            className="w-full max-w-xl flex flex-col items-center justify-center rounded-2xl border px-8 py-14 text-center shadow-lg"
            style={{
                backgroundColor: colors.card,
                borderColor: colors.border,
                boxShadow: `0 24px 48px -24px ${colors.primary}22`,
            }}
        >
            <div
                className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl"
                style={{
                    color: colors.primary,
                    backgroundColor: `${colors.primary}14`,
                    boxShadow: `0 0 24px ${colors.primary}33`,
                }}
            >
                <Construction size={28} strokeWidth={2.2} />
            </div>
            <div
                className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest animate-pulse mb-4"
                style={{
                    color: colors.primary,
                    backgroundColor: `${colors.primary}18`,
                    boxShadow: `0 0 14px ${colors.primary}55`,
                }}
            >
                Coming Soon
            </div>
            <h3 className="text-2xl font-bold mb-3" style={{ color: colors.textMain }}>
                {tabLabel}
            </h3>
            <p className="text-sm max-w-md leading-relaxed" style={{ color: colors.textMuted }}>
                This analysis view is under development. Check back later for dedicated {tabLabel} insights and
                reporting.
            </p>
        </div>
    );
}
