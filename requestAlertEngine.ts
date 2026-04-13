import {
    calculateNights,
    getEventDateWindow,
    normalizeRequestTypeKey,
} from './beoShared';

export type RequestAlertKind = 'offer' | 'deposit' | 'payment' | 'gis' | 'beo';

export type RequestAlertAccent = 'yellow' | 'blue' | 'green' | 'lightGreen' | 'lightBlue' | 'red';

export interface RequestAlert {
    dismissKey: string;
    kind: RequestAlertKind;
    requestId: string;
    title: string;
    body: string;
    creatorName: string;
    accent: RequestAlertAccent;
    urgent: boolean;
    /** YYYY-MM-DD anchor (deadline, arrival, or agenda start) for display */
    anchorDate?: string;
}

export interface RequestAlertInput {
    request: any;
    contactName: string;
    creatorName: string;
}

function parseNum(val: unknown): number {
    if (val == null) return 0;
    const n = Number(String(val).replace(/,/g, ''));
    return Number.isFinite(n) ? n : 0;
}

export function normalizeAlertDate(raw: unknown): string | null {
    if (raw == null) return null;
    const s = String(raw).trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    return s;
}

function startOfLocalDay(d: Date): number {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Calendar days from local today to target date (can be negative if past). */
export function daysUntilLocal(targetIso: string | null | undefined, today: Date): number | null {
    const t = normalizeAlertDate(targetIso);
    if (!t) return null;
    const [y, m, day] = t.split('-').map(Number);
    const targetMs = new Date(y, m - 1, day).getTime();
    const todayMs = startOfLocalDay(today);
    return Math.round((targetMs - todayMs) / 86400000);
}

function normStatus(req: any): string {
    return String(req?.status ?? '').trim();
}

function isExcludedStatus(req: any): boolean {
    const s = normStatus(req);
    return s === 'Cancelled' || s === 'Lost';
}

function requestNameAccount(req: any): { name: string; account: string } {
    const name = String(req?.requestName || req?.confirmationNo || req?.id || '—').trim() || '—';
    const account = String(req?.account || req?.accountName || '—').trim() || '—';
    return { name, account };
}

function contactLine(contactName: string, reqName: string, account: string): string {
    return `Please contact ${contactName} — ${reqName} (${account})`;
}

/** GIS: Definite for most types; series also allows Actual (per product spec). */
function gisStatusAllowed(req: any): boolean {
    const s = normStatus(req);
    const t = normalizeRequestTypeKey(req?.requestType);
    if (t === 'series') return s === 'Definite' || s === 'Actual';
    return s === 'Definite';
}

function isGisType(req: any): boolean {
    const t = normalizeRequestTypeKey(req?.requestType);
    return t === 'accommodation' || t === 'series' || t === 'event_rooms';
}

function isBeoType(req: any): boolean {
    const t = normalizeRequestTypeKey(req?.requestType);
    return t === 'event' || t === 'event_rooms' || t === 'series';
}

function collectGisArrivalDates(req: any): string[] {
    const t = normalizeRequestTypeKey(req?.requestType);
    if (t === 'series') {
        const rooms = Array.isArray(req?.rooms) ? req.rooms : [];
        const set = new Set<string>();
        for (const g of rooms) {
            const arrival = normalizeAlertDate(g?.arrival || req?.checkIn);
            const co = String(g?.departure || req?.checkOut || '');
            const ci = String(g?.arrival || '');
            const nights = calculateNights(ci, co);
            const rc = parseNum(g?.count);
            if (arrival && rc > 0 && nights > 0) set.add(arrival);
        }
        return [...set].sort();
    }
    const ci = normalizeAlertDate(req?.checkIn);
    return ci ? [ci] : [];
}

function collectBeoStartDates(req: any): string[] {
    const agenda = Array.isArray(req?.agenda) ? req.agenda : [];
    const set = new Set<string>();
    for (const row of agenda) {
        const sd = normalizeAlertDate(row?.startDate);
        if (sd) set.add(sd);
    }
    if (set.size > 0) return [...set].sort();
    const ev = getEventDateWindow(req);
    const fb = normalizeAlertDate(ev.start);
    return fb ? [fb] : [];
}

function pushDeadlineAlerts(
    out: RequestAlert[],
    req: any,
    contactName: string,
    creatorName: string,
    today: Date
): void {
    const { name: reqName, account } = requestNameAccount(req);
    const base = { requestId: String(req.id), creatorName };

    // Offer — Inquiry only
    if (!isExcludedStatus(req) && normStatus(req) === 'Inquiry') {
        const d = daysUntilLocal(req?.offerDeadline, today);
        if (d === null) {
            /* skip */
        } else if (d > 3) {
            /* not in window */
        } else {
            const dk = `offer:${req.id}`;
            let body: string;
            let accent: RequestAlertAccent = 'yellow';
            let urgent = false;
            if (d <= 0) {
                urgent = true;
                accent = 'red';
                body = `Urgent. ${contactLine(contactName, reqName, account)} Offer acceptance deadline has passed.`;
            } else if (d === 1) {
                urgent = true;
                accent = 'red';
                body = `Urgent. ${contactLine(contactName, reqName, account)} 1 day left.`;
            } else if (d === 2) {
                body = `${contactLine(contactName, reqName, account)} 2 days left.`;
            } else {
                body = contactLine(contactName, reqName, account);
            }
            out.push({
                ...base,
                dismissKey: dk,
                kind: 'offer',
                title: 'Acceptance',
                body,
                accent,
                urgent,
                anchorDate: normalizeAlertDate(req?.offerDeadline) || undefined,
            });
        }
    }

    // Deposit — Accepted
    if (!isExcludedStatus(req) && normStatus(req) === 'Accepted') {
        const d = daysUntilLocal(req?.depositDeadline, today);
        if (d === null) {
            /* skip */
        } else if (d > 3) {
            /* skip */
        } else {
            const dk = `deposit:${req.id}`;
            let body: string;
            let accent: RequestAlertAccent = 'blue';
            let urgent = false;
            if (d <= 0) {
                urgent = true;
                accent = 'red';
                body = `Urgent. ${contactLine(contactName, reqName, account)} Deposit deadline has passed.`;
            } else if (d === 1) {
                urgent = true;
                accent = 'red';
                body = `Urgent. ${contactLine(contactName, reqName, account)} 1 day left.`;
            } else if (d === 2) {
                body = `${contactLine(contactName, reqName, account)} 2 days left.`;
            } else {
                body = contactLine(contactName, reqName, account);
            }
            out.push({
                ...base,
                dismissKey: dk,
                kind: 'deposit',
                title: 'Deposit',
                body,
                accent,
                urgent,
                anchorDate: normalizeAlertDate(req?.depositDeadline) || undefined,
            });
        }
    }

    // Full payment — Tentative, tiers 3 / 2 / 1 (green for 3 & 2, red urgent at 1 or overdue)
    if (!isExcludedStatus(req) && normStatus(req) === 'Tentative') {
        const d = daysUntilLocal(req?.paymentDeadline, today);
        if (d === null) {
            /* skip */
        } else if (d > 3) {
            /* skip */
        } else {
            const dk = `payment:${req.id}`;
            let body: string;
            let accent: RequestAlertAccent = 'green';
            let urgent = false;
            if (d <= 0) {
                urgent = true;
                accent = 'red';
                body = `Urgent. ${contactLine(contactName, reqName, account)} Full payment deadline has passed.`;
            } else if (d === 1) {
                urgent = true;
                accent = 'red';
                body = `Urgent. ${contactLine(contactName, reqName, account)} 1 day left.`;
            } else if (d === 2) {
                body = `${contactLine(contactName, reqName, account)} 2 days left.`;
            } else {
                body = contactLine(contactName, reqName, account);
            }
            out.push({
                ...base,
                dismissKey: dk,
                kind: 'payment',
                title: 'Full Payment',
                body,
                accent,
                urgent,
                anchorDate: normalizeAlertDate(req?.paymentDeadline) || undefined,
            });
        }
    }
}

function pushGisBeoAlerts(
    out: RequestAlert[],
    req: any,
    creatorName: string,
    account: string,
    reqName: string,
    today: Date
): void {
    const base = { requestId: String(req.id), creatorName };

    // GIS
    if (
        !isExcludedStatus(req) &&
        isGisType(req) &&
        gisStatusAllowed(req)
    ) {
        const dates = collectGisArrivalDates(req);
        for (const arrival of dates) {
            const d = daysUntilLocal(arrival, today);
            if (d === null) continue;
            if (d !== 1 && d !== 0 && d > 0) continue;
            if (d < 0) continue;
            const dk = `gis:${req.id}:${arrival}`;
            const dateNote = d === 0 ? ' (arrival today)' : '';
            out.push({
                ...base,
                dismissKey: dk,
                kind: 'gis',
                title: 'Group Information Sheet',
                body: `Urgent. Please Release the GIS for ${reqName} (${account})${dateNote}.`,
                accent: 'lightGreen',
                urgent: true,
                anchorDate: arrival,
            });
        }
    }

    // BEO — Definite only
    if (!isExcludedStatus(req) && normStatus(req) === 'Definite' && isBeoType(req)) {
        const starts = collectBeoStartDates(req);
        for (const start of starts) {
            const d = daysUntilLocal(start, today);
            if (d === null) continue;
            if (d > 2) continue;

            if (d <= 0) {
                out.push({
                    ...base,
                    dismissKey: `beo:${req.id}:${start}:overdue`,
                    kind: 'beo',
                    title: 'Banquet Event Order',
                    body: `Urgent. Please Release the BEO for ${reqName} (${account}). Event start ${start} has passed or is today.`,
                    accent: 'red',
                    urgent: true,
                    anchorDate: start,
                });
            } else if (d === 2) {
                out.push({
                    ...base,
                    dismissKey: `beo:${req.id}:${start}:d2`,
                    kind: 'beo',
                    title: 'Banquet Event Order',
                    body: `Please Release the BEO for ${reqName} (${account}). 2 days until event start (${start}).`,
                    accent: 'lightBlue',
                    urgent: false,
                    anchorDate: start,
                });
            } else if (d === 1) {
                out.push({
                    ...base,
                    dismissKey: `beo:${req.id}:${start}:d1`,
                    kind: 'beo',
                    title: 'Banquet Event Order',
                    body: `Urgent. Please Release the BEO for ${reqName} (${account}). 1 day until event start (${start}).`,
                    accent: 'red',
                    urgent: true,
                    anchorDate: start,
                });
            }
        }
    }
}

/**
 * Build all alerts for the given requests (already scoped to property).
 * One row per rule anchor; no duplicate tiers for the same day.
 */
export function computeAllRequestAlerts(inputs: RequestAlertInput[], today: Date): RequestAlert[] {
    const out: RequestAlert[] = [];
    for (const { request, contactName, creatorName } of inputs) {
        if (!request?.id) continue;
        pushDeadlineAlerts(out, request, contactName, creatorName, today);
        const { name: reqName, account } = requestNameAccount(request);
        pushGisBeoAlerts(out, request, creatorName, account, reqName, today);
    }
    return out;
}
