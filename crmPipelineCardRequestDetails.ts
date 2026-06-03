import {
    calculateEventAgendaDays,
    calculateNights,
    getEventDateWindow,
    normalizeRequestTypeKey,
} from './beoShared';

export type PipelineLinkedRequestDisplay = {
    requestName: string;
    confirmationNo: string;
    startLabel: string;
    startDate: string;
    endLabel: string;
    endDate: string;
};

function formatYmd(ymd: string): string {
    const s = String(ymd || '').trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s || '—';
    const d = new Date(`${s}T12:00:00`);
    if (Number.isNaN(d.getTime())) return s;
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function resolveLeadLinkedRequest(lead: any, requests: any[]): any | null {
    const id = String(lead?.linkedRequestId || '').trim();
    if (!id || !Array.isArray(requests)) return null;
    return requests.find((r: any) => String(r?.id || '') === id) || null;
}

/** Date labels for pipeline kanban when a request is linked to the card. */
export function getPipelineLinkedRequestDisplay(req: any): PipelineLinkedRequestDisplay | null {
    if (!req) return null;
    const typeKey = normalizeRequestTypeKey(req?.requestType);
    let startLabel = 'Start';
    let startRaw = '';
    let endLabel = 'End';
    let endRaw = '';

    if (typeKey === 'accommodation') {
        startLabel = 'Check-in';
        startRaw = String(req?.checkIn || '').trim();
        endLabel = 'Check-out';
        endRaw = String(req?.checkOut || '').trim();
    } else if (typeKey === 'event') {
        startLabel = 'Start date';
        const ev = getEventDateWindow(req);
        startRaw = String(ev?.start || req?.eventStart || '').trim();
        endLabel = 'End date';
        endRaw = String(ev?.end || req?.eventEnd || '').trim();
    } else if (typeKey === 'event_rooms' || typeKey === 'series') {
        startLabel = 'Start of request';
        startRaw = String(req?.requestDate || req?.eventStart || req?.checkIn || '').trim();
        const ev = getEventDateWindow(req);
        if (!startRaw && ev?.start) startRaw = String(ev.start).trim();
        endLabel = 'End';
        endRaw = String(req?.checkOut || req?.eventEnd || ev?.end || '').trim();
    } else {
        startLabel = 'Check-in';
        startRaw = String(req?.checkIn || req?.requestDate || '').trim();
        endLabel = 'Check-out';
        endRaw = String(req?.checkOut || '').trim();
    }

    return {
        requestName: String(req?.requestName || req?.eventName || req?.requestType || 'Request').trim() || 'Request',
        confirmationNo: String(req?.confirmationNo || '').trim() || '—',
        startLabel,
        startDate: formatYmd(startRaw),
        endLabel,
        endDate: formatYmd(endRaw),
    };
}

export function countRequestRooms(req: any): number {
    const total = Number(req?.totalRooms || 0);
    if (Number.isFinite(total) && total > 0) return Math.floor(total);
    const rooms = req?.rooms;
    if (Array.isArray(rooms)) {
        return rooms.reduce((sum: number, r: any) => sum + Math.max(0, Number(r?.count || 0)), 0);
    }
    if (rooms && typeof rooms === 'object') {
        return Object.values(rooms).reduce(
            (sum: number, r: any) => sum + Math.max(0, Number((r as any)?.count || 0)),
            0
        );
    }
    return 0;
}

export function countRequestNights(req: any): number {
    const n = Number(req?.nights || 0);
    if (Number.isFinite(n) && n > 0) return Math.floor(n);
    return Math.max(0, calculateNights(String(req?.checkIn || ''), String(req?.checkOut || '')));
}

export function getRequestCreatorName(
    req: any,
    userDirectory?: { id: string; name: string }[]
): string {
    const uid = String(req?.createdByUserId || '').trim();
    if (uid && Array.isArray(userDirectory)) {
        const hit = userDirectory.find((u) => String(u.id) === uid);
        if (hit?.name) return String(hit.name).trim();
    }
    const logs = Array.isArray(req?.logs) ? req.logs : [];
    for (const log of logs) {
        const u = String(log?.user || '').trim();
        if (u) return u;
    }
    return '—';
}

export type RequestKanbanCardDetails = PipelineLinkedRequestDisplay & {
    nights: number;
    rooms: number;
    eventDays: number;
    isEventOnly: boolean;
    isEventWithAccommodation: boolean;
    creatorName: string;
};

/** Full card metadata for CRM Request View kanban (matches Requests list INFO column). */
export function getRequestKanbanCardDetails(
    req: any,
    userDirectory?: { id: string; name: string }[]
): RequestKanbanCardDetails | null {
    const base = getPipelineLinkedRequestDisplay(req);
    if (!base) return null;
    const typeKey = normalizeRequestTypeKey(req?.requestType);
    const isEventOnly = typeKey === 'event';
    const isEventWithAccommodation = typeKey === 'event_rooms';
    return {
        ...base,
        nights: countRequestNights(req),
        rooms: countRequestRooms(req),
        eventDays: calculateEventAgendaDays(req?.agenda || []),
        isEventOnly,
        isEventWithAccommodation,
        creatorName: getRequestCreatorName(req, userDirectory),
    };
}
