import {
    calculateNights,
    getEventDateWindow,
    normalizeRequestTypeKey,
} from './beoShared';
import type {
    DeadlineAlertKind,
    PropertyAlertSettingsMap,
    SystemAlertKind,
} from './propertyAlertSettings';
import {
    CLIENT_FEEDBACK_LOOKBACK_DAYS,
    CLIENT_FEEDBACK_URGENT_LAST_DAYS,
    getDeadlineAlertRule,
    isAlertKindActive,
    mergePropertyAlertSettings,
} from './propertyAlertSettings';

export type RequestAlertKind = SystemAlertKind;

export type RequestAlertAccent = 'yellow' | 'blue' | 'green' | 'lightGreen' | 'lightBlue' | 'red';

export interface RequestAlert {
    dismissKey: string;
    kind: SystemAlertKind;
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

/** Normalize a `requestDeadlineType` token to the configurable deadline kind. */
export function deadlineKindForType(deadlineType: string): DeadlineAlertKind | null {
    const t = String(deadlineType || '').trim();
    if (t === 'offer_acceptance' || t === 'offer') return 'offer';
    if (t === 'deposit') return 'deposit';
    if (t === 'full_payment' || t === 'payment') return 'payment';
    return null;
}

/** Default linked status for a deadline type (legacy hardcoded mapping). */
export function requestStatusForDeadlineType(deadlineType: string): string | null {
    const kind = deadlineKindForType(deadlineType);
    if (kind === 'offer') return 'Inquiry';
    if (kind === 'deposit') return 'Accepted';
    if (kind === 'payment') return 'Tentative';
    return null;
}

/**
 * Whether a request deadline call/alert applies to this request's current status.
 * Pass `linkedStatuses` (from alert/call settings) to use configurable statuses; otherwise the
 * legacy default mapping is used so existing callers keep current behavior.
 */
export function requestDeadlineAppliesToRequest(
    deadlineType: string,
    req: any,
    linkedStatuses?: string[]
): boolean {
    if (isExcludedStatus(req)) return false;
    const statuses =
        Array.isArray(linkedStatuses) && linkedStatuses.length
            ? linkedStatuses
            : (() => {
                  const def = requestStatusForDeadlineType(deadlineType);
                  return def ? [def] : [];
              })();
    if (!statuses.length) return false;
    const cur = normStatus(req).toLowerCase();
    return statuses.some((s) => String(s || '').trim().toLowerCase() === cur);
}

function applyMessageTokens(
    template: string,
    tokens: { contact: string; request: string; account: string; days: number }
): string {
    return String(template || '')
        .replace(/\{contact\}/g, tokens.contact)
        .replace(/\{request\}/g, tokens.request)
        .replace(/\{account\}/g, tokens.account)
        .replace(/\{days\}/g, String(Math.max(tokens.days, 0)));
}

/** Definition table linking each deadline kind to its request date field + display labels. */
const DEADLINE_ALERT_DEFS: {
    kind: DeadlineAlertKind;
    dateKey: string;
    deadlineType: string;
    title: string;
    pastLabel: string;
}[] = [
    { kind: 'offer', dateKey: 'offerDeadline', deadlineType: 'offer_acceptance', title: 'Acceptance', pastLabel: 'Offer acceptance' },
    { kind: 'deposit', dateKey: 'depositDeadline', deadlineType: 'deposit', title: 'Deposit', pastLabel: 'Deposit' },
    { kind: 'payment', dateKey: 'paymentDeadline', deadlineType: 'full_payment', title: 'Full Payment', pastLabel: 'Full payment' },
];

function requestNameAccount(req: any): { name: string; account: string } {
    const name = String(req?.requestName || req?.confirmationNo || req?.id || '—').trim() || '—';
    const account = String(req?.account || req?.accountName || '—').trim() || '—';
    return { name, account };
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
    today: Date,
    settings: PropertyAlertSettingsMap
): void {
    const { name: reqName, account } = requestNameAccount(req);
    const base = { requestId: String(req.id), creatorName };

    for (const def of DEADLINE_ALERT_DEFS) {
        const rule = getDeadlineAlertRule(settings, def.kind);
        if (!rule.enabled) continue;
        if (!requestDeadlineAppliesToRequest(def.deadlineType, req, rule.linkedStatuses)) continue;

        const d = daysUntilLocal(req?.[def.dateKey], today);
        if (d === null) continue;

        // Offsets are days-before-deadline; on-day (0) also covers overdue (d < 0).
        const offsets = rule.offsets && rule.offsets.length ? rule.offsets : [0, 1, 2, 3];
        const onDayEnabled = offsets.includes(0);
        const triggers = offsets.includes(d) || (onDayEnabled && d < 0);
        if (!triggers) continue;

        const urgentWithin = Number.isFinite(rule.urgentWithinDays) ? rule.urgentWithinDays : 1;
        const urgent = d <= urgentWithin;
        const accent: RequestAlertAccent = urgent ? 'red' : ((rule.accent || 'yellow') as RequestAlertAccent);

        const baseMsg = applyMessageTokens(rule.message, {
            contact: contactName,
            request: reqName,
            account,
            days: d,
        });
        // Auto tier suffix preserves today's wording.
        let suffix = '';
        if (d <= 0) suffix = ` ${def.pastLabel} deadline has passed.`;
        else if (d === 1) suffix = ' 1 day left.';
        else if (d === 2) suffix = ' 2 days left.';

        const urgentPrefix = urgent ? 'Urgent. ' : '';
        const tag = String(rule.tag || '').trim();
        const tagPrefix = tag ? `[${tag}] ` : '';
        const body = `${urgentPrefix}${tagPrefix}${baseMsg}${suffix}`;

        out.push({
            ...base,
            dismissKey: `${def.kind}:${req.id}`,
            kind: def.kind,
            title: def.title,
            body,
            accent,
            urgent,
            anchorDate: normalizeAlertDate(req?.[def.dateKey]) || undefined,
        });
    }
}

function pushGisBeoAlerts(
    out: RequestAlert[],
    req: any,
    creatorName: string,
    account: string,
    reqName: string,
    today: Date,
    settings: PropertyAlertSettingsMap
): void {
    const base = { requestId: String(req.id), creatorName };

    // GIS
    if (
        isAlertKindActive(settings, 'gis') &&
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
    if (isAlertKindActive(settings, 'beo') && !isExcludedStatus(req) && normStatus(req) === 'Definite' && isBeoType(req)) {
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

/** Collect candidate end-of-service dates (checkout, last departure, agenda end, event window end). */
function collectCheckoutOrEndDates(req: any): string[] {
    const t = normalizeRequestTypeKey(req?.requestType);
    const set = new Set<string>();
    const push = (raw: unknown) => {
        const x = normalizeAlertDate(raw);
        if (x) set.add(x);
    };

    if (t === 'accommodation') {
        push(req?.checkOut);
        return [...set].sort();
    }

    if (t === 'event') {
        const w = getEventDateWindow(req);
        push(w?.end);
        return [...set].sort();
    }

    push(req?.checkOut);
    const rooms = Array.isArray(req?.rooms) ? req.rooms : [];
    for (const g of rooms) {
        push(g?.departure);
    }
    const agenda = Array.isArray(req?.agenda) ? req.agenda : [];
    for (const row of agenda) {
        push(row?.endDate);
        push(row?.startDate);
    }
    return [...set].sort();
}

function latestServiceEndIso(req: any): string | null {
    const dates = collectCheckoutOrEndDates(req).filter(Boolean);
    if (!dates.length) return null;
    return dates[dates.length - 1] ?? null;
}

function pushClientFeedbackAlerts(
    out: RequestAlert[],
    req: any,
    contactName: string,
    creatorName: string,
    today: Date,
    settings: PropertyAlertSettingsMap
): void {
    if (!isAlertKindActive(settings, 'client_feedback')) return;
    if (isExcludedStatus(req)) return;

    const end = latestServiceEndIso(req);
    if (!end) return;

    const d = daysUntilLocal(end, today);
    if (d === null) return;
    // d = calendar days from today to end: negative = end is in the past. Show from day after end through lookback window.
    if (d > -1 || d < -CLIENT_FEEDBACK_LOOKBACK_DAYS) return;

    const { name: reqName, account } = requestNameAccount(req);
    const base = { requestId: String(req.id), creatorName };
    const dk = `client_feedback:${req.id}:${end}`;
    const urgent = d >= -CLIENT_FEEDBACK_URGENT_LAST_DAYS;
    out.push({
        ...base,
        dismissKey: dk,
        kind: 'client_feedback',
        title: 'Client experience feedback',
        body: `Contact ${contactName} and collect feedback regarding "${reqName}" (${account}). Service ended ${end}.`,
        accent: urgent ? 'red' : 'lightBlue',
        urgent,
        anchorDate: end,
    });
}

/**
 * Build all alerts for the given requests (already scoped to property).
 * One row per rule anchor; no duplicate tiers for the same day.
 */
export function computeAllRequestAlerts(
    inputs: RequestAlertInput[],
    today: Date,
    settings?: PropertyAlertSettingsMap
): RequestAlert[] {
    const resolved = settings ?? mergePropertyAlertSettings(null);
    const out: RequestAlert[] = [];
    for (const { request, contactName, creatorName } of inputs) {
        if (!request?.id) continue;
        const resolvedContactName =
            String(request?.bookerName || request?.booker || '').trim() ||
            String(contactName || '').trim() ||
            'the contact person';
        pushDeadlineAlerts(out, request, resolvedContactName, creatorName, today, resolved);
        const { name: reqName, account } = requestNameAccount(request);
        pushGisBeoAlerts(out, request, creatorName, account, reqName, today, resolved);
        pushClientFeedbackAlerts(out, request, resolvedContactName, creatorName, today, resolved);
    }
    return out;
}
