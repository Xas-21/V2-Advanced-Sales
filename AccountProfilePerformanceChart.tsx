import React from 'react';
import {
    ResponsiveContainer,
    AreaChart,
    Area,
    BarChart,
    Bar,
    Line,
    ComposedChart,
    CartesianGrid,
    XAxis,
    YAxis,
    Tooltip,
    Legend,
} from 'recharts';
import { formatCompactCurrency } from './formatCompactCurrency';
import { formatCurrencyAmount, resolveCurrencyCode, type CurrencyCode } from './currency';
import type { AccountProfileChartRow } from './accountProfileChartData';

export type AccountProfileChartTab = 'Revenue' | 'Requests' | 'Rooms' | 'MICE' | 'Status';

function rechartsTooltipThemeProps(colors: any, contentStylePatch?: Record<string, any>) {
    return {
        contentStyle: {
            backgroundColor: colors.tooltip,
            borderColor: colors.border,
            borderRadius: 8,
            color: colors.textMain,
            ...(contentStylePatch || {}),
        },
        labelStyle: { color: colors.textMain, fontWeight: 700 },
        itemStyle: { color: colors.textMain },
    };
}

export const ACCOUNT_PROFILE_CHART_TABS: AccountProfileChartTab[] = ['Revenue', 'Requests', 'Rooms', 'MICE', 'Status'];

type Props = {
    chartTab: AccountProfileChartTab;
    chartData: AccountProfileChartRow[];
    colors: any;
    currency?: CurrencyCode;
};

export default function AccountProfilePerformanceChart({ chartTab, chartData, colors, currency = 'SAR' }: Props) {
    const selectedCurrency = resolveCurrencyCode(currency);
    const moneyTickFormatter = (v: any) => formatCompactCurrency(Number(v || 0), selectedCurrency);
    const moneyTooltipFormatter = (value: any, name: any, entry: any) => {
        const key = String(entry?.dataKey || '').toLowerCase();
        const label = String(name || '').toLowerCase();
        const isMoney = key.includes('revenue') || label.includes('revenue');
        if (!isMoney) return [String(value ?? '—'), name];
        return [formatCurrencyAmount(Number(value || 0), selectedCurrency, { maximumFractionDigits: 2 }), name];
    };

    const statusSeries = [
        { key: 'inquiry', name: 'Inquiry', color: colors.textMuted },
        { key: 'accepted', name: 'Accepted', color: colors.yellow },
        { key: 'tentative', name: 'Tentative', color: colors.blue },
        { key: 'definite', name: 'Definite', color: colors.green },
        { key: 'actual', name: 'Actual', color: '#059669' },
        { key: 'cancelled', name: 'Cancelled', color: colors.red },
    ];
    const activeStatusSeries = statusSeries.filter((s) => (chartData || []).some((row: any) => Number(row?.[s.key] || 0) > 0));
    const sumChartKey = (key: string) =>
        (chartData || []).reduce((sum: number, row: any) => sum + (Number(row?.[key]) || 0), 0);
    const formatLegendCount = (n: number) => Math.round(Number(n) || 0).toLocaleString();
    const formatLegendMoneyTotal = (amountSar: number) =>
        formatCurrencyAmount(Number(amountSar) || 0, selectedCurrency, { maximumFractionDigits: 0 });
    const statusLegendPayload = activeStatusSeries.map((s) => ({
        value: `${s.name} (${formatLegendCount(sumChartKey(s.key))})`,
        type: 'circle' as const,
        color: s.color,
        id: s.key,
    }));
    const roomsLegendPayload = [
        { value: `Rooms (${formatLegendCount(sumChartKey('rooms'))})`, type: 'circle' as const, color: colors.cyan, id: 'rooms' },
        { value: `Room Nights (${formatLegendCount(sumChartKey('roomNights'))})`, type: 'circle' as const, color: colors.blue, id: 'roomNights' },
        {
            value: `Rooms Revenue (${formatLegendMoneyTotal(sumChartKey('roomsRevenue'))})`,
            type: 'circle' as const,
            color: colors.green,
            id: 'roomsRevenue',
        },
    ];
    const miceLegendPayload = [
        { value: `MICE Requests (${formatLegendCount(sumChartKey('miceRequests'))})`, type: 'circle' as const, color: colors.purple, id: 'miceRequests' },
        {
            value: `Event Revenue (${formatLegendMoneyTotal(sumChartKey('miceRevenue'))})`,
            type: 'circle' as const,
            color: colors.green,
            id: 'miceRevenue',
        },
    ];
    const statusTooltipContent = ({ active, payload, label }: any) => {
        if (!active || !Array.isArray(payload) || payload.length === 0) return null;
        const nonZero = payload.filter((p: any) => Number(p?.value || 0) > 0);
        if (!nonZero.length) return null;
        return (
            <div
                className="rounded-lg border px-3 py-2 text-xs"
                style={{ backgroundColor: colors.tooltip, borderColor: colors.border, color: colors.textMain }}
            >
                <div className="font-bold mb-1">{label}</div>
                <div className="space-y-0.5">
                    {nonZero.map((p: any, i: number) => (
                        <div key={`${p?.name || p?.dataKey || i}`} style={{ color: p?.color || colors.textMain }}>
                            {p?.name}: {p?.value}
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    return (
        <ResponsiveContainer width="100%" height="100%">
            {chartTab === 'Revenue' ? (
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 8, bottom: 0 }}>
                    <defs>
                        <linearGradient id="accProfColorRev" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={colors.green} stopOpacity={0.3} />
                            <stop offset="95%" stopColor={colors.green} stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={colors.border} vertical={false} />
                    <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: colors.textMuted, fontSize: 10 }} />
                    <YAxis
                        width={56}
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: colors.textMuted, fontSize: 10 }}
                        tickFormatter={moneyTickFormatter}
                    />
                    <Tooltip {...rechartsTooltipThemeProps(colors)} formatter={moneyTooltipFormatter} />
                    <Area type="monotone" dataKey="revenue" stroke={colors.green} fill="url(#accProfColorRev)" />
                </AreaChart>
            ) : chartTab === 'Requests' ? (
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={colors.border} vertical={false} />
                    <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: colors.textMuted, fontSize: 10 }} />
                    <YAxis
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: colors.textMuted, fontSize: 10 }}
                        allowDecimals={false}
                        domain={[0, 'dataMax']}
                    />
                    <Tooltip {...rechartsTooltipThemeProps(colors)} cursor={{ fill: colors.border }} />
                    <Bar dataKey="totalRequests" name="Total Requests" fill={colors.blue} radius={[4, 4, 0, 0]} barSize={20} />
                </BarChart>
            ) : chartTab === 'Rooms' ? (
                <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={colors.border} vertical={false} />
                    <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: colors.textMuted, fontSize: 10 }} />
                    <YAxis
                        yAxisId="left"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: colors.textMuted, fontSize: 10 }}
                        allowDecimals={false}
                        domain={[0, 'dataMax']}
                    />
                    <YAxis
                        yAxisId="right"
                        orientation="right"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: colors.textMuted, fontSize: 10 }}
                        tickFormatter={moneyTickFormatter}
                    />
                    <Tooltip {...rechartsTooltipThemeProps(colors)} formatter={moneyTooltipFormatter} />
                    <Legend payload={roomsLegendPayload} iconType="circle" wrapperStyle={{ fontSize: '10px', paddingTop: '10px', color: colors.textMuted }} />
                    <Bar yAxisId="left" dataKey="rooms" name="Rooms" fill={colors.cyan} radius={[4, 4, 0, 0]} barSize={16} />
                    <Line yAxisId="left" type="monotone" dataKey="roomNights" name="Room Nights" stroke={colors.blue} strokeWidth={2} dot={{ r: 2 }} />
                    <Line yAxisId="right" type="monotone" dataKey="roomsRevenue" name="Rooms Revenue" stroke={colors.green} strokeWidth={2} dot={{ r: 3 }} />
                </ComposedChart>
            ) : chartTab === 'MICE' ? (
                <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={colors.border} vertical={false} />
                    <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: colors.textMuted, fontSize: 10 }} />
                    <YAxis
                        yAxisId="left"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: colors.textMuted, fontSize: 10 }}
                        allowDecimals={false}
                        domain={[0, 'dataMax']}
                    />
                    <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{ fill: colors.textMuted, fontSize: 10 }} tickFormatter={moneyTickFormatter} />
                    <Tooltip {...rechartsTooltipThemeProps(colors)} formatter={moneyTooltipFormatter} />
                    <Legend payload={miceLegendPayload} iconType="circle" wrapperStyle={{ fontSize: '10px', paddingTop: '10px', color: colors.textMuted }} />
                    <Bar yAxisId="left" dataKey="miceRequests" name="MICE Requests" fill={colors.purple} radius={[4, 4, 0, 0]} barSize={20} />
                    <Line yAxisId="right" type="monotone" dataKey="miceRevenue" name="Event Revenue" stroke={colors.green} strokeWidth={2} dot={{ r: 3 }} />
                </ComposedChart>
            ) : (
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={colors.border} vertical={false} />
                    <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: colors.textMuted, fontSize: 10 }} />
                    <YAxis
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: colors.textMuted, fontSize: 10 }}
                        allowDecimals={false}
                        domain={[0, 'dataMax']}
                    />
                    <Tooltip content={statusTooltipContent} cursor={{ fill: colors.border }} />
                    <Legend payload={statusLegendPayload} iconType="circle" wrapperStyle={{ fontSize: '10px', paddingTop: '10px', color: colors.textMuted }} />
                    <Bar dataKey="inquiry" stackId="a" name="Inquiry" fill={colors.textMuted} />
                    <Bar dataKey="accepted" stackId="a" name="Accepted" fill={colors.yellow} />
                    <Bar dataKey="tentative" stackId="a" name="Tentative" fill={colors.blue} />
                    <Bar dataKey="definite" stackId="a" name="Definite" fill={colors.green} />
                    <Bar dataKey="actual" stackId="a" name="Actual" fill="#059669" />
                    <Bar dataKey="cancelled" stackId="a" name="Cancelled" fill={colors.red} radius={[4, 4, 0, 0]} />
                </BarChart>
            )}
        </ResponsiveContainer>
    );
}
