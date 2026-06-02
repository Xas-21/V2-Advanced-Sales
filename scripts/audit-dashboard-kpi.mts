/**
 * Audit dashboard Total Requests vs status chips.
 * Run from repo root: npx tsx scripts/audit-dashboard-kpi.mts
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

import {
    buildReportSegmentsForRequest,
    requestOperationalDatesOverlapRange,
} from '../operationalSegmentRevenue.ts';

function getPrimaryOperationalDate(req: any): string {
    const parseYmd = (raw: unknown): string => {
        if (!raw) return '';
        const s = String(raw).trim().slice(0, 10);
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
        const dt = new Date(String(raw));
        if (Number.isNaN(dt.getTime())) return '';
        return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
    };
    const checkIn = parseYmd(req?.checkIn);
    const eventStart = parseYmd(req?.eventStart);
    const agenda = Array.isArray(req?.agenda) ? req.agenda : [];
    const starts = agenda.map((row: any) => parseYmd(row?.startDate || row?.endDate)).filter(Boolean) as string[];
    const stayOrEvent = [checkIn, eventStart].filter(Boolean).sort();
    if (stayOrEvent.length) return stayOrEvent[0];
    if (starts.length) return starts.sort()[0];
    const rooms = Array.isArray(req?.rooms) ? req.rooms : [];
    for (const row of rooms) {
        const a = parseYmd(row?.arrival || row?.checkIn);
        if (a) return a;
    }
    return parseYmd(req?.receivedDate || req?.requestDate || (typeof req?.createdAt === 'string' ? req.createdAt.split('T')[0] : ''));
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_FILE = resolve(__dirname, '_shaden_requests_audit.json');

const SHADEN = 'Ps8b83kgbm';
const RANGE = { start: '2026-01-01', end: '2026-12-31' };

const KPI_STATUS_ORDER = ['Inquiry', 'Accepted', 'Tentative', 'Definite', 'Actual', 'Cancelled'] as const;

const parseYmd = (value: unknown): string => {
    const raw = String(value ?? '').trim();
    if (!raw) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    const dt = new Date(raw);
    if (Number.isNaN(dt.getTime())) return '';
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const d = String(dt.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
};

const normalizeStatus = (status: unknown): string => {
    const raw = String(status ?? '').trim().toLowerCase();
    if (raw === 'draft' || raw === 'inquiry') return 'Inquiry';
    if (raw === 'accepted') return 'Accepted';
    if (raw === 'tentative') return 'Tentative';
    if (raw === 'definite') return 'Definite';
    if (raw === 'actual') return 'Actual';
    if (raw === 'cancelled') return 'Cancelled';
    return '';
};

const isDashboardExcludedRequest = (req: any) => {
    const raw = String(req?.status ?? '').trim().toLowerCase();
    if (raw === 'cancelled' || raw === 'lost') return true;
    return normalizeStatus(req?.status) === 'Cancelled';
};

const toYmd = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
};

const isIsoInRange = (iso: string, range: { start: string; end: string }) =>
    iso >= range.start && iso <= range.end;

const isSeriesRequest = (req: any) => String(req?.requestType ?? '').toLowerCase().includes('series');

const isEventsCateringEligibleRequest = (req: any): boolean => {
    if (isSeriesRequest(req)) return false;
    const t = String(req?.requestType ?? '').toLowerCase();
    return t === 'event' || t === 'event_rooms' || t.includes('event with');
};

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

function computeRangeSummary(requests: any[], range: { start: string; end: string }) {
    const statusCounts: Record<string, number> = Object.fromEntries(
        KPI_STATUS_ORDER.map((s) => [s, 0])
    );
    let requestCount = 0;
    const inStatusNotTotal: any[] = [];

    for (const req of requests) {
        if (!requestOperationalDatesOverlapRange(req, range.start, range.end)) continue;
        const st = normalizeStatus(req?.status);
        const touches = true;
        const excluded = isDashboardExcludedRequest(req);
        const segs = buildReportSegmentsForRequest(req, range.start, range.end);
        const inTotal = !excluded;

        if (st) statusCounts[st] += 1;
        if (inTotal) requestCount += 1;
        else if (st && st !== 'Cancelled' && touches) {
            inStatusNotTotal.push({
                id: req.id,
                status: req.status,
                excluded,
                segCount: segs.length,
                requestType: req.requestType,
                checkIn: req.checkIn,
                checkOut: req.checkOut,
                receivedDate: req.receivedDate,
                primary: getPrimaryOperationalDate(req),
            });
        }
    }
    return { statusCounts, requestCount, inStatusNotTotal };
}

function main() {
    const requests = JSON.parse(readFileSync(DATA_FILE, 'utf8')) as any[];
    const { statusCounts, requestCount, inStatusNotTotal } = computeRangeSummary(requests, RANGE);

    const nonCxl = KPI_STATUS_ORDER.filter((s) => s !== 'Cancelled').reduce(
        (n, s) => n + (statusCounts[s] || 0),
        0
    );

    console.log(`Shaden ${RANGE.start} .. ${RANGE.end}`);
    console.log('statusCounts:', statusCounts);
    console.log(`sum(non-cancelled status chips): ${nonCxl}`);
    console.log(`Total Requests (KPI): ${requestCount}`);
    console.log(`difference: ${nonCxl - requestCount}`);
    if (inStatusNotTotal.length) {
        console.log('\nIn status chips but NOT in Total Requests:');
        for (const r of inStatusNotTotal) console.log(JSON.stringify(r));
    }
}

main();
