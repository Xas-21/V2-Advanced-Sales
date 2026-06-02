/**
 * Dashboard-equivalent monthly (or single-month daily) series for a fixed list of requests
 * (e.g. all requests linked to one CRM account). Logic mirrors AS.tsx `chartData` useMemo.
 */
import { shouldIncludeRequestInRoomsChart } from './beoShared';
import {
    addProratedRequestFinancialsToDashboardBuckets,
    incrementUniqueRequestChartCounts,
    requestCountsInChartsPeriod,
    requestTouchesOperationalRange,
} from './operationalSegmentRevenue';

function isEventsCateringEligibleRequest(req: any): boolean {
    const t = String(req?.requestType || '').toLowerCase();
    if (t.includes('series')) return false;
    if (t === 'event') return true;
    if (t === 'event_rooms') return true;
    if (t.includes('event with')) return true;
    return false;
}

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const toYmd = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
};

export const parseYmd = (value: any): string => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    const dt = new Date(raw);
    if (Number.isNaN(dt.getTime())) return '';
    return toYmd(dt);
};

const normalizeStatus = (status: any): string => {
    const raw = String(status || '').trim().toLowerCase();
    if (raw === 'draft') return 'Inquiry';
    if (raw === 'inquiry') return 'Inquiry';
    if (raw === 'accepted') return 'Accepted';
    if (raw === 'tentative') return 'Tentative';
    if (raw === 'definite') return 'Definite';
    if (raw === 'actual') return 'Actual';
    if (raw === 'cancelled') return 'Cancelled';
    return '';
};

const isDashboardExcludedRequest = (req: any) => normalizeStatus(req?.status) === 'Cancelled';

function isIsoInRange(iso: string, range: { start: string; end: string }) {
    if (!iso) return false;
    return iso >= range.start && iso <= range.end;
}

const getMonthKey = (iso: string) => {
    const parsed = parseYmd(iso);
    return parsed ? parsed.slice(0, 7) : '';
};

type DashboardAxisGranularity = 'month' | 'day';
type DashboardAxisPoint = { key: string; month: string };

const buildDashboardAxis = (range: { start: string; end: string }): { granularity: DashboardAxisGranularity; points: DashboardAxisPoint[] } => {
    const startIso = parseYmd(range.start);
    const endIso = parseYmd(range.end);
    if (!startIso || !endIso || startIso > endIso) return { granularity: 'month', points: [] };
    const start = new Date(`${startIso}T00:00:00`);
    const end = new Date(`${endIso}T00:00:00`);
    const sameMonth = start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth();
    if (sameMonth) {
        const points: DashboardAxisPoint[] = [];
        const cursor = new Date(start);
        while (cursor <= end) {
            const iso = toYmd(cursor);
            points.push({
                key: iso,
                month: String(cursor.getDate()).padStart(2, '0'),
            });
            cursor.setDate(cursor.getDate() + 1);
        }
        return { granularity: 'day', points };
    }
    const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    const endBoundary = new Date(end.getFullYear(), end.getMonth(), 1);
    const singleYear = start.getFullYear() === end.getFullYear();
    const out: DashboardAxisPoint[] = [];
    while (cursor <= endBoundary) {
        const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
        const label = singleYear
            ? MONTH_SHORT[cursor.getMonth()]
            : `${MONTH_SHORT[cursor.getMonth()]} ${String(cursor.getFullYear()).slice(2)}`;
        out.push({ key, month: label });
        cursor.setMonth(cursor.getMonth() + 1);
    }
    return { granularity: 'month', points: out };
};

const getDashboardAxisKey = (iso: string, granularity: DashboardAxisGranularity) => {
    const parsed = parseYmd(iso);
    if (!parsed) return '';
    return granularity === 'day' ? parsed : getMonthKey(parsed);
};

export type AccountProfileChartRow = {
    month: string;
    revenue: number;
    totalRequests: number;
    rooms: number;
    roomNights: number;
    roomsRevenue: number;
    miceRequests: number;
    miceRevenue: number;
    miceRoomsRevenue: number;
    inquiry: number;
    accepted: number;
    tentative: number;
    definite: number;
    actual: number;
    cancelled: number;
};

/** Jan 1 – Dec 31 of the current calendar year (local). */
export function getDefaultAccountPerformanceRange(): { from: string; to: string } {
    const y = new Date().getFullYear();
    return { from: `${y}-01-01`, to: `${y}-12-31` };
}

/**
 * Build dashboard-style chart rows for the given requests and operational date range.
 */
export function buildAccountProfileChartData(
    requests: any[],
    range: { start: string; end: string }
): AccountProfileChartRow[] {
    const axisConfig = buildDashboardAxis(range);
    const axis = axisConfig.points;
    const keyFor = (iso: string) => getDashboardAxisKey(iso, axisConfig.granularity);
    const byMonth = new Map<string, AccountProfileChartRow>(
        axis.map((m) => [
            m.key,
            {
                month: m.month,
                revenue: 0,
                totalRequests: 0,
                rooms: 0,
                roomNights: 0,
                roomsRevenue: 0,
                miceRequests: 0,
                miceRevenue: 0,
                miceRoomsRevenue: 0,
                inquiry: 0,
                accepted: 0,
                tentative: 0,
                definite: 0,
                actual: 0,
                cancelled: 0,
            },
        ])
    );

    for (const req of requests || []) {
        const inPeriodCharts = requestCountsInChartsPeriod(req, range.start, range.end);
        const inOverlap = requestTouchesOperationalRange(req, range);
        if (!inOverlap && !inPeriodCharts) continue;

        const skipPerf = isDashboardExcludedRequest(req);

        if (inOverlap && !skipPerf && range.start && range.end) {
            addProratedRequestFinancialsToDashboardBuckets(
                req,
                range.start,
                range.end,
                (iso) => getDashboardAxisKey(iso, axisConfig.granularity),
                (k) => byMonth.get(k),
                {
                    skipPerf: false,
                    includeRoomsChart: shouldIncludeRequestInRoomsChart(req),
                    includeMiceChart: isEventsCateringEligibleRequest(req),
                    roomsChartBucketGranularity: axisConfig.granularity,
                }
            );
        }

        incrementUniqueRequestChartCounts(
            req,
            range.start,
            range.end,
            (anchorYmd) => byMonth.get(keyFor(anchorYmd)),
            { includeInRequestCount: !skipPerf }
        );

    }

    return axis.map(
        (m) =>
            byMonth.get(m.key) || {
                month: m.month,
                revenue: 0,
                totalRequests: 0,
                rooms: 0,
                roomNights: 0,
                roomsRevenue: 0,
                miceRequests: 0,
                miceRevenue: 0,
                miceRoomsRevenue: 0,
                inquiry: 0,
                accepted: 0,
                tentative: 0,
                definite: 0,
                actual: 0,
                cancelled: 0,
            }
    );
}
