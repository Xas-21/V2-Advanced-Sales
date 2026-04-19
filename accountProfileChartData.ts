/**
 * Dashboard-equivalent monthly (or single-month daily) series for a fixed list of requests
 * (e.g. all requests linked to one CRM account). Logic mirrors AS.tsx `chartData` useMemo.
 */
import { shouldIncludeRequestInRoomsChart } from './beoShared';
import { getPrimaryOperationalDate } from './userProfileMetrics';

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

const asNumber = (value: any) => parseFloat(String(value ?? 0).replace(/,/g, '')) || 0;

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

const isSeriesRequest = (req: any) => String(req?.requestType || '').toLowerCase().includes('series');

function isMiceRequest(req: any) {
    const t = String(req?.requestType || '').toLowerCase();
    if (t === 'event') return true;
    if (t === 'event_rooms') return true;
    if (t === 'series' || t.includes('series')) return true;
    if (t.includes('event with')) return true;
    return false;
}

function isEventsCateringEligibleRequest(req: any): boolean {
    if (isSeriesRequest(req)) return false;
    const t = String(req?.requestType || '').toLowerCase();
    if (t === 'event') return true;
    if (t === 'event_rooms') return true;
    if (t.includes('event with')) return true;
    return false;
}

const getRequestCountDates = (req: any): string[] => {
    if (isSeriesRequest(req)) {
        const rows = Array.isArray(req?.rooms) ? req.rooms : [];
        const dates = rows.map((r: any) => parseYmd(r?.arrival || r?.checkIn)).filter(Boolean) as string[];
        if (dates.length) return dates;
        const primary = getPrimaryOperationalDate(req);
        return primary ? [primary] : [];
    }
    if (isEventsCateringEligibleRequest(req)) {
        const agenda = Array.isArray(req?.agenda) ? req.agenda : [];
        const starts = agenda.map((row: any) => parseYmd(row?.startDate || row?.endDate)).filter(Boolean) as string[];
        if (starts.length) return [...new Set(starts)].sort();
    }
    const primary = getPrimaryOperationalDate(req);
    return primary ? [primary] : [];
};

const requestTouchesOperationalRange = (req: any, range: { start: string; end: string }): boolean => {
    for (const d of getRequestCountDates(req)) {
        if (d && isIsoInRange(d, range)) return true;
    }
    const pd = getPrimaryOperationalDate(req);
    if (pd && isIsoInRange(pd, range)) return true;
    const rooms = Array.isArray(req?.rooms) ? req.rooms : [];
    for (const rr of rooms) {
        const a = parseYmd(rr?.arrival || req?.checkIn);
        const b = parseYmd(rr?.departure || req?.checkOut);
        if (a && b) {
            const cur = new Date(`${a}T00:00:00`);
            const endMs = new Date(`${b}T00:00:00`).getTime();
            let c = cur.getTime();
            while (c < endMs) {
                const iso = toYmd(new Date(c));
                if (isIsoInRange(iso, range)) return true;
                c += 86400000;
            }
        } else if (a && isIsoInRange(a, range)) return true;
    }
    for (const item of Array.isArray(req?.agenda) ? req.agenda : []) {
        const s = parseYmd(item?.startDate);
        const e = parseYmd(item?.endDate || item?.startDate);
        if (!s) continue;
        let c = new Date(`${s}T00:00:00`).getTime();
        const endAt = new Date(`${e || s}T00:00:00`).getTime();
        while (c <= endAt) {
            if (isIsoInRange(toYmd(new Date(c)), range)) return true;
            c += 86400000;
        }
    }
    return false;
};

const getMiceAttributionDatesInRange = (req: any, range: { start: string; end: string }): string[] => {
    if (!isEventsCateringEligibleRequest(req)) return [];
    const out: string[] = [];
    const seen = new Set<string>();
    const pushDay = (iso: string) => {
        if (!iso || !isIsoInRange(iso, range) || seen.has(iso)) return;
        seen.add(iso);
        out.push(iso);
    };
    for (const item of Array.isArray(req?.agenda) ? req.agenda : []) {
        const s = parseYmd(item?.startDate);
        const e = parseYmd(item?.endDate || item?.startDate);
        if (!s) continue;
        let c = new Date(`${s}T00:00:00`).getTime();
        const endAt = new Date(`${e || s}T00:00:00`).getTime();
        while (c <= endAt) {
            pushDay(toYmd(new Date(c)));
            c += 86400000;
        }
    }
    if (out.length) return out.sort();
    for (const d of getRequestCountDates(req)) {
        if (d && isIsoInRange(d, range)) pushDay(d);
    }
    return out.sort();
};

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

function computeRequestCostBreakdown(req: any) {
    const rooms = Array.isArray(req?.rooms) ? req.rooms : [];
    const agenda = Array.isArray(req?.agenda) ? req.agenda : [];
    const transport = Array.isArray(req?.transportation) ? req.transportation : [];
    const reqNights = (() => {
        const inDate = parseYmd(req?.checkIn);
        const outDate = parseYmd(req?.checkOut);
        if (!inDate || !outDate) return 0;
        const ms = new Date(`${outDate}T00:00:00`).getTime() - new Date(`${inDate}T00:00:00`).getTime();
        if (Number.isNaN(ms)) return 0;
        return Math.max(0, Math.ceil(ms / 86400000));
    })();
    const roomsRevenue = rooms.reduce((sum: number, row: any) => {
        const count = Number(row?.count || 0);
        const rate = Number(row?.rate || 0);
        const inDate = parseYmd(row?.arrival || req?.checkIn);
        const outDate = parseYmd(row?.departure || req?.checkOut);
        let nights = reqNights;
        if (inDate && outDate) {
            const ms = new Date(`${outDate}T00:00:00`).getTime() - new Date(`${inDate}T00:00:00`).getTime();
            if (!Number.isNaN(ms)) nights = Math.max(0, Math.ceil(ms / 86400000));
        }
        return sum + count * rate * nights;
    }, 0);
    let eventRevenue = agenda.reduce((sum: number, item: any) => {
        const start = parseYmd(item?.startDate);
        const end = parseYmd(item?.endDate || item?.startDate);
        let rowDays = 1;
        if (start && end) {
            const ms = new Date(`${end}T00:00:00`).getTime() - new Date(`${start}T00:00:00`).getTime();
            if (!Number.isNaN(ms)) rowDays = Math.max(1, Math.floor(ms / 86400000) + 1);
        }
        const rowCost = Number(item?.rate || 0) * Number(item?.pax || 0) + Number(item?.rental || 0);
        return sum + rowCost * rowDays;
    }, 0);
    const transportRevenue = transport.reduce((sum: number, row: any) => sum + Number(row?.costPerWay || 0), 0);
    let lineSum = roomsRevenue + eventRevenue + transportRevenue;
    const storedNoTax = asNumber(
        req?.grandTotalNoTax ?? req?.totalCostNoTax ?? req?.totalCost ?? req?.grandTotal ?? req?.totalAmount ?? 0
    );
    if (lineSum <= 0 && storedNoTax > 0) {
        if (isMiceRequest(req)) {
            eventRevenue = storedNoTax;
            lineSum = roomsRevenue + eventRevenue + transportRevenue;
        } else {
            lineSum = storedNoTax;
        }
    }
    return {
        roomsRevenue,
        eventRevenue,
        transportRevenue,
        totalRevenue: lineSum,
    };
}

export type AccountProfileChartRow = {
    month: string;
    revenue: number;
    totalRequests: number;
    rooms: number;
    roomNights: number;
    roomsRevenue: number;
    miceRequests: number;
    miceRevenue: number;
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
        if (!requestTouchesOperationalRange(req, range)) continue;

        const breakdown = computeRequestCostBreakdown(req);
        const skipPerf = isDashboardExcludedRequest(req);
        const unitDates = getRequestCountDates(req);
        const countDatesInRange = unitDates.filter((d) => isIsoInRange(d, range));

        if (!skipPerf) {
            if (countDatesInRange.length > 0) {
                const revShare = breakdown.totalRevenue / countDatesInRange.length;
                for (const d of countDatesInRange) {
                    const mr = byMonth.get(keyFor(d));
                    if (mr) mr.revenue += revShare;
                }
            } else {
                const pd = getPrimaryOperationalDate(req);
                if (pd && isIsoInRange(pd, range)) {
                    const mr = byMonth.get(keyFor(pd));
                    if (mr) mr.revenue += breakdown.totalRevenue;
                }
            }
        }

        if (!skipPerf) {
            let addedRequestUnit = false;
            for (const unitDate of unitDates) {
                if (!isIsoInRange(unitDate, range)) continue;
                const unitRow = byMonth.get(keyFor(unitDate));
                if (unitRow) {
                    unitRow.totalRequests += 1;
                    addedRequestUnit = true;
                }
            }
            if (!addedRequestUnit) {
                const pd = getPrimaryOperationalDate(req);
                if (pd && isIsoInRange(pd, range)) {
                    const unitRow = byMonth.get(keyFor(pd));
                    if (unitRow) unitRow.totalRequests += 1;
                }
            }
        }

        const status = normalizeStatus(req?.status).toLowerCase();
        if (status) {
            let addedStatus = false;
            for (const unitDate of unitDates) {
                if (!isIsoInRange(unitDate, range)) continue;
                const unitRow = byMonth.get(keyFor(unitDate));
                if (unitRow && Object.prototype.hasOwnProperty.call(unitRow, status)) {
                    (unitRow as any)[status] += 1;
                    addedStatus = true;
                }
            }
            if (!addedStatus) {
                const pd = getPrimaryOperationalDate(req);
                if (pd && isIsoInRange(pd, range)) {
                    const unitRow = byMonth.get(keyFor(pd));
                    if (unitRow && Object.prototype.hasOwnProperty.call(unitRow, status)) {
                        (unitRow as any)[status] += 1;
                    }
                }
            }
        }

        if (!skipPerf && isEventsCateringEligibleRequest(req)) {
            const ev = Number(breakdown.eventRevenue || 0);
            const miceDays = getMiceAttributionDatesInRange(req, range);
            if (miceDays.length > 0) {
                const dayCount = miceDays.length;
                const daysByMonth = new Map<string, number>();
                for (const d of miceDays) {
                    const mk = keyFor(d);
                    daysByMonth.set(mk, (daysByMonth.get(mk) || 0) + 1);
                }
                for (const [mk, n] of daysByMonth) {
                    const mr = byMonth.get(mk);
                    if (mr) {
                        mr.miceRequests += 1;
                        if (ev > 0) mr.miceRevenue += ev * (n / dayCount);
                    }
                }
            } else if (countDatesInRange.length > 0) {
                const total = countDatesInRange.length;
                const daysByMonth = new Map<string, number>();
                for (const d of countDatesInRange) {
                    const mk = keyFor(d);
                    daysByMonth.set(mk, (daysByMonth.get(mk) || 0) + 1);
                }
                for (const [mk, n] of daysByMonth) {
                    const mr = byMonth.get(mk);
                    if (mr) {
                        mr.miceRequests += 1;
                        if (ev > 0) mr.miceRevenue += ev * (n / total);
                    }
                }
            } else {
                const pd = getPrimaryOperationalDate(req);
                if (pd && isIsoInRange(pd, range)) {
                    const mr = byMonth.get(keyFor(pd));
                    if (mr) {
                        mr.miceRevenue += ev;
                        mr.miceRequests += 1;
                    }
                }
            }
        }

        if (!skipPerf && shouldIncludeRequestInRoomsChart(req)) {
            const roomRows = Array.isArray(req?.rooms) ? req.rooms : [];
            /** If any line has a rate, ignore zero-rate lines so comp/placeholder rows do not inflate room / room-night counts while priced lines drive revenue. */
            const anyRowWithRate = roomRows.some((rr: any) => Number(rr?.rate || 0) > 0);
            let roomContributed = false;
            let roomRevenueAllocated = 0;

            let usedStoredRoomTotalsOnly = false;
            if (!anyRowWithRate && Number(breakdown.roomsRevenue || 0) > 0) {
                const fallbackRoomDate = parseYmd(req?.checkIn);
                if (
                    fallbackRoomDate &&
                    isIsoInRange(fallbackRoomDate, range) &&
                    (Number(req?.totalRooms || 0) > 0 || Number(breakdown.roomsRevenue || 0) > 0)
                ) {
                    const fallbackMonth = byMonth.get(keyFor(fallbackRoomDate));
                    if (fallbackMonth) {
                        const totalRooms = Number(req?.totalRooms || 0);
                        const totalRoomNights = Number(req?.totalRoomNights || 0);
                        const nights = Number(req?.nights || 0);
                        fallbackMonth.rooms += totalRooms;
                        fallbackMonth.roomNights += totalRoomNights > 0 ? totalRoomNights : totalRooms * Math.max(0, nights);
                        fallbackMonth.roomsRevenue += Number(breakdown.roomsRevenue || 0);
                        roomContributed = true;
                        roomRevenueAllocated += Number(breakdown.roomsRevenue || 0);
                        usedStoredRoomTotalsOnly = true;
                    }
                }
            }

            if (!usedStoredRoomTotalsOnly) {
                for (const rr of roomRows) {
                    if (anyRowWithRate && Number(rr?.rate || 0) <= 0) continue;
                    const roomDate = parseYmd(rr?.arrival || req?.checkIn);
                    if (!roomDate || !isIsoInRange(roomDate, range)) continue;
                    const rrMonth = byMonth.get(keyFor(roomDate));
                    if (!rrMonth) continue;
                    const count = Number(rr?.count || 0);
                    const rate = Number(rr?.rate || 0);
                    const inDate = parseYmd(rr?.arrival || req?.checkIn);
                    const outDate = parseYmd(rr?.departure || req?.checkOut);
                    let rowNights = Number(req?.nights || 0);
                    if (inDate && outDate) {
                        const ms = new Date(`${outDate}T00:00:00`).getTime() - new Date(`${inDate}T00:00:00`).getTime();
                        if (!Number.isNaN(ms)) rowNights = Math.max(0, Math.ceil(ms / 86400000));
                    }
                    rrMonth.rooms += count;
                    rrMonth.roomNights += count * Math.max(0, rowNights);
                    const rowRevenue = count * rate * Math.max(0, rowNights);
                    rrMonth.roomsRevenue += rowRevenue;
                    roomRevenueAllocated += rowRevenue;
                    roomContributed = true;
                }
            }
            if (!roomContributed) {
                const fallbackRoomDate = parseYmd(req?.checkIn);
                if (
                    fallbackRoomDate &&
                    isIsoInRange(fallbackRoomDate, range) &&
                    (Number(req?.totalRooms || 0) > 0 || Number(breakdown.roomsRevenue || 0) > 0)
                ) {
                    const fallbackMonth = byMonth.get(keyFor(fallbackRoomDate));
                    if (fallbackMonth) {
                        const totalRooms = Number(req?.totalRooms || 0);
                        const totalRoomNights = Number(req?.totalRoomNights || 0);
                        const nights = Number(req?.nights || 0);
                        fallbackMonth.rooms += totalRooms;
                        fallbackMonth.roomNights += totalRoomNights > 0 ? totalRoomNights : totalRooms * Math.max(0, nights);
                        fallbackMonth.roomsRevenue += Number(breakdown.roomsRevenue || 0);
                    }
                }
            } else if (roomRevenueAllocated <= 0 && Number(breakdown.roomsRevenue || 0) > 0) {
                const fallbackRoomDate = parseYmd(req?.checkIn);
                if (fallbackRoomDate && isIsoInRange(fallbackRoomDate, range)) {
                    const fallbackMonth = byMonth.get(keyFor(fallbackRoomDate));
                    if (fallbackMonth) fallbackMonth.roomsRevenue += Number(breakdown.roomsRevenue || 0);
                }
            }
        }
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
                inquiry: 0,
                accepted: 0,
                tentative: 0,
                definite: 0,
                actual: 0,
                cancelled: 0,
            }
    );
}
