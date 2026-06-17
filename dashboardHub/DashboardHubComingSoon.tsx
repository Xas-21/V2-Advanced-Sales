import React from 'react';

type DashboardHubComingSoonProps = {
    tabLabel: string;
    colors: any;
};

export default function DashboardHubComingSoon({ tabLabel, colors }: DashboardHubComingSoonProps) {
    return (
        <div
            className="col-span-1 md:col-span-12 flex flex-col items-center justify-center rounded-2xl border min-h-[420px] py-16 px-6 text-center"
            style={{ backgroundColor: colors.card, borderColor: colors.border }}
        >
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
            <h3 className="text-xl font-bold mb-2" style={{ color: colors.textMain }}>
                {tabLabel}
            </h3>
            <p className="text-sm max-w-md" style={{ color: colors.textMuted }}>
                This analysis view is under development. Check back later for dedicated {tabLabel} insights and
                reporting.
            </p>
        </div>
    );
}
