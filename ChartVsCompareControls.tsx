import React from 'react';
import { chartTabSupportsVs, defaultChartVsYear, getChartVsYearOptions } from './chartVsYearCompare';

type Props = {
    chartTab: string;
    enabled: boolean;
    onEnabledChange: (v: boolean) => void;
    year: number;
    onYearChange: (y: number) => void;
    colors: { textMain?: string; textMuted?: string; border?: string; bg?: string; primary?: string };
};

export default function ChartVsCompareControls({
    chartTab,
    enabled,
    onEnabledChange,
    year,
    onYearChange,
    colors,
}: Props) {
    if (!chartTabSupportsVs(chartTab)) return null;
    const years = getChartVsYearOptions();
    return (
        <div className="flex items-center gap-2 shrink-0">
            <label
                className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wide cursor-pointer select-none"
                style={{ color: colors.textMuted }}
            >
                <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(e) => onEnabledChange(e.target.checked)}
                    className="rounded border cursor-pointer"
                    style={{ borderColor: colors.border, accentColor: colors.primary }}
                />
                Vs
            </label>
            {enabled ? (
                <select
                    value={String(year)}
                    onChange={(e) => onYearChange(Number(e.target.value))}
                    className="text-[9px] font-bold px-1.5 py-0.5 rounded border outline-none cursor-pointer max-w-[72px]"
                    style={{
                        backgroundColor: colors.bg,
                        borderColor: colors.border,
                        color: colors.primary,
                    }}
                    aria-label="Comparison year"
                >
                    {years.map((y) => (
                        <option key={y} value={y}>
                            {y}
                        </option>
                    ))}
                </select>
            ) : null}
        </div>
    );
}

export { defaultChartVsYear };
