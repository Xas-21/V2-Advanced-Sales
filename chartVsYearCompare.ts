/**
 * Year-over-year comparison for dashboard / account / user profile charts
 * (Revenue, Requests, Rooms, MICE tabs only).
 */
import type { AccountProfileChartRow } from './accountProfileChartData';
import { parseYmd } from './accountProfileChartData';

export const CHART_VS_MIN_YEAR = 2020;

export const CHART_VS_COMPARABLE_TABS = new Set(['Revenue', 'Requests', 'Rooms', 'MICE']);

export function getChartVsYearOptions(): number[] {
    const end = new Date().getFullYear();
    const out: number[] = [];
    for (let y = end; y >= CHART_VS_MIN_YEAR; y--) out.push(y);
    return out;
}

export function defaultChartVsYear(): number {
    return new Date().getFullYear() - 1;
}

const toYmd = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
};

/** Shift range so its start year aligns with `comparisonYear` (same month/day span). */
export function shiftRangeToComparisonYear(
    range: { start: string; end: string },
    comparisonYear: number
): { start: string; end: string } {
    const s = parseYmd(range.start);
    const e = parseYmd(range.end);
    if (!s || !e) return range;
    const anchorYear = Number(s.slice(0, 4));
    if (!Number.isFinite(anchorYear) || !Number.isFinite(comparisonYear)) return range;
    const years = comparisonYear - anchorYear;
    const sd = new Date(`${s}T00:00:00`);
    const ed = new Date(`${e}T00:00:00`);
    sd.setFullYear(sd.getFullYear() + years);
    ed.setFullYear(ed.getFullYear() + years);
    return { start: toYmd(sd), end: toYmd(ed) };
}

const TAB_NUMERIC_KEYS: Record<string, string[]> = {
    Revenue: ['revenue'],
    Requests: ['totalRequests'],
    Rooms: ['rooms', 'roomNights', 'roomsRevenue'],
    MICE: ['miceRequests', 'miceRoomsRevenue', 'miceRevenue'],
};

/** Count metrics — stored and shown as whole numbers (no prorated decimals in tooltips). */
const CHART_COUNT_KEYS = new Set([
    'totalRequests',
    'rooms',
    'roomNights',
    'miceRequests',
    'inquiry',
    'accepted',
    'tentative',
    'definite',
    'actual',
    'cancelled',
]);

export function normalizeChartMetricValue(key: string, value: unknown): number {
    const n = Number(value) || 0;
    const base = key.endsWith('Ly') ? key.slice(0, -2) : key;
    if (CHART_COUNT_KEYS.has(base)) return Math.round(n);
    return n;
}

/** Merge comparison-year buckets into current rows as `*Ly` fields (aligned by index). */
export function mergeChartRowsWithLyComparison(
    current: AccountProfileChartRow[],
    ly: AccountProfileChartRow[],
    chartTab: string
): AccountProfileChartRow[] {
    const keys = TAB_NUMERIC_KEYS[chartTab] || [];
    if (!keys.length) return current;
    const len = Math.max(current.length, ly.length);
    return Array.from({ length: len }, (_, i) => {
        const cur = (current[i] || { month: ly[i]?.month || '' }) as AccountProfileChartRow;
        const prev = ly[i] || ({} as AccountProfileChartRow);
        const merged = { ...cur } as AccountProfileChartRow & Record<string, number>;
        for (const k of keys) {
            (merged as any)[`${k}Ly`] = normalizeChartMetricValue(k, (prev as any)[k]);
        }
        return merged as AccountProfileChartRow;
    });
}

export function chartTabSupportsVs(chartTab: string): boolean {
    return CHART_VS_COMPARABLE_TABS.has(chartTab);
}
