/**
 * Request revenue split by operational line segments that overlap a date range.
 * Shared by Reports and the main dashboard for consistent period revenue.
 */

export function inDateRangeYMD(dateStr: string, start: string, end: string): boolean {
    const d = String(dateStr || '').slice(0, 10);
    if (!start || !end) return true;
    if (!d) return false;
    return d >= start && d <= end;
}

export function rangesOverlapYmd(aStart: string, aEnd: string, filterStart: string, filterEnd: string): boolean {
    if (!filterStart || !filterEnd) return true;
    const as = aStart || aEnd;
    const ae = aEnd || aStart;
    if (!as && !ae) return false;
    return !(ae < filterStart || as > filterEnd);
}

export function inclusiveAgendaDayCount(startYmd: string, endYmd: string): number {
    if (!startYmd || !endYmd) return 0;
    const a = new Date(`${startYmd}T00:00:00`).getTime();
    const b = new Date(`${endYmd}T00:00:00`).getTime();
    if (Number.isNaN(a) || Number.isNaN(b)) return 0;
    return Math.max(1, Math.floor((b - a) / 86400000) + 1);
}

export function parseYmdAgenda(v: any): string {
    const raw = String(v || '').trim().slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    const dt = new Date(raw);
    if (Number.isNaN(dt.getTime())) return '';
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const d = String(dt.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function calculateNights(inDate: string, outDate: string): number {
    if (!inDate || !outDate) return 0;
    const diff = new Date(outDate).getTime() - new Date(inDate).getTime();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

function asNumberReport(v: any): number {
    return parseFloat(String(v ?? 0).replace(/,/g, '')) || 0;
}

export function computeRequestRevenueBreakdownNoTax(r: any): {
    roomsRevenue: number;
    eventRevenue: number;
    transportRevenue: number;
    totalLineNoTax: number;
} {
    const rooms = Array.isArray(r?.rooms) ? r.rooms : [];
    const agenda = Array.isArray(r?.agenda) ? r.agenda : [];
    const transport = Array.isArray(r?.transportation) ? r.transportation : [];
    const reqNights = (() => {
        const inDate = parseYmdAgenda(r?.checkIn);
        const outDate = parseYmdAgenda(r?.checkOut);
        if (!inDate || !outDate) return 0;
        const ms = new Date(`${outDate}T00:00:00`).getTime() - new Date(`${inDate}T00:00:00`).getTime();
        if (Number.isNaN(ms)) return 0;
        return Math.max(0, Math.ceil(ms / 86400000));
    })();
    const roomsRevenue = rooms.reduce((sum: number, row: any) => {
        const count = Number(row?.count || 0);
        const rate = Number(row?.rate || 0);
        const inDate = parseYmdAgenda(row?.arrival || r?.checkIn);
        const outDate = parseYmdAgenda(row?.departure || r?.checkOut);
        let nights = reqNights;
        if (inDate && outDate) {
            const ms = new Date(`${outDate}T00:00:00`).getTime() - new Date(`${inDate}T00:00:00`).getTime();
            if (!Number.isNaN(ms)) nights = Math.max(0, Math.ceil(ms / 86400000));
        }
        return sum + count * rate * nights;
    }, 0);
    let eventRevenue = agenda.reduce((sum: number, item: any) => {
        const start = parseYmdAgenda(item?.startDate);
        const end = parseYmdAgenda(item?.endDate || item?.startDate);
        let rowDays = 1;
        if (start && end) {
            const ms = new Date(`${end}T00:00:00`).getTime() - new Date(`${start}T00:00:00`).getTime();
            if (!Number.isNaN(ms)) rowDays = Math.max(1, Math.floor(ms / 86400000) + 1);
        }
        const rowCost = (Number(item?.rate || 0) * Number(item?.pax || 0)) + Number(item?.rental || 0);
        return sum + rowCost * rowDays;
    }, 0);
    const transportRevenue = transport.reduce((sum: number, row: any) => sum + Number(row?.costPerWay || 0), 0);
    let lineSum = roomsRevenue + eventRevenue + transportRevenue;
    const storedNoTax = asNumberReport(
        r?.grandTotalNoTax ?? r?.totalCostNoTax ?? r?.totalCost ?? r?.grandTotal ?? r?.totalAmount ?? 0
    );
    if (lineSum <= 0 && storedNoTax > 0) {
        const t = String(r?.requestType || '').toLowerCase();
        const miceLike =
            t === 'event' || t === 'event_rooms' || t.includes('series') || t.includes('event with');
        if (miceLike) {
            eventRevenue = storedNoTax;
            lineSum = roomsRevenue + eventRevenue + transportRevenue;
        } else {
            return {
                roomsRevenue: storedNoTax,
                eventRevenue: 0,
                transportRevenue: 0,
                totalLineNoTax: storedNoTax,
            };
        }
    }
    return {
        roomsRevenue,
        eventRevenue,
        transportRevenue,
        totalLineNoTax: lineSum,
    };
}

function fallbackOperationalAnchorYmd(r: any): string {
    const rooms = Array.isArray(r?.rooms) ? r.rooms : [];
    for (const row of rooms) {
        const a = parseYmdAgenda(row?.arrival || r?.checkIn);
        if (a) return a;
    }
    const ci = parseYmdAgenda(r?.checkIn);
    if (ci) return ci;
    if (Array.isArray(r?.agenda) && r.agenda[0]) {
        const a = parseYmdAgenda(r.agenda[0]?.startDate);
        if (a) return a;
    }
    const d = r?.receivedDate || r?.requestDate || (typeof r?.createdAt === 'string' ? r.createdAt.split('T')[0] : '');
    return String(d || '').slice(0, 10);
}

export type ReportSegment = {
    key: string;
    line: string;
    displayDate: string;
    roomRev: number;
    eventRev: number;
    roomNights: number;
    stayNights: number;
    pax: number;
    agendaStart: string;
    agendaEnd: string;
    agendaDays: number;
};

export function segmentLineTotalExTax(s: ReportSegment, transportOnThisRow: number): number {
    return s.roomRev + s.eventRev + transportOnThisRow;
}

/**
 * One row per room stay and/or per agenda line that overlaps [filterStart, filterEnd].
 * Transport (no tax) is attached to the first segment only.
 */
export function buildReportSegmentsForRequest(r: any, filterStart: string, filterEnd: string): ReportSegment[] {
    if (!filterStart || !filterEnd) return [];
    const out: ReportSegment[] = [];
    const rooms = Array.isArray(r?.rooms) ? r.rooms : [];
    for (let i = 0; i < rooms.length; i += 1) {
        const row = rooms[i];
        const inA = parseYmdAgenda(row?.arrival || r?.checkIn);
        const outA = parseYmdAgenda(row?.departure || r?.checkOut);
        if (!inA || !outA) continue;
        if (!rangesOverlapYmd(inA, outA, filterStart, filterEnd)) continue;
        const nights = Math.max(0, calculateNights(inA, outA));
        const count = Number(row?.count || 0);
        const rate = Number(row?.rate || 0);
        const roomRev = count * rate * nights;
        out.push({
            key: `room-${i}-${inA}`,
            line: `Room · ${inA}`,
            displayDate: inA,
            roomRev,
            eventRev: 0,
            roomNights: count * nights,
            stayNights: nights,
            pax: 0,
            agendaStart: '',
            agendaEnd: '',
            agendaDays: 0,
        });
    }
    if (!rooms.length) {
        const inA = parseYmdAgenda(r?.checkIn);
        const outA = parseYmdAgenda(r?.checkOut);
        if (inA && outA && rangesOverlapYmd(inA, outA, filterStart, filterEnd)) {
            const br = computeRequestRevenueBreakdownNoTax(r);
            const nights = Math.max(0, calculateNights(inA, outA));
            const roomRev = br.roomsRevenue;
            if (roomRev > 0) {
                out.push({
                    key: `accom-${inA}`,
                    line: 'Accommodation (request dates)',
                    displayDate: inA,
                    roomRev,
                    eventRev: 0,
                    roomNights: nights * (Number(r?.totalRooms) || 1) || 0,
                    stayNights: nights,
                    pax: 0,
                    agendaStart: '',
                    agendaEnd: '',
                    agendaDays: 0,
                });
            }
        }
    }
    const agenda = Array.isArray(r?.agenda) ? r.agenda : [];
    for (let i = 0; i < agenda.length; i += 1) {
        const item = agenda[i];
        if (!item || typeof item !== 'object') continue;
        const sd = parseYmdAgenda(item.startDate);
        const ed = parseYmdAgenda(item.endDate || item.startDate) || sd;
        if (!sd) continue;
        if (!rangesOverlapYmd(sd, ed, filterStart, filterEnd)) continue;
        let rowDays = 1;
        if (sd && ed) {
            const ms = new Date(`${ed}T00:00:00`).getTime() - new Date(`${sd}T00:00:00`).getTime();
            if (!Number.isNaN(ms)) rowDays = Math.max(1, Math.floor(ms / 86400000) + 1);
        }
        const rowCost = (Number(item.rate || 0) * Number(item.pax || 0)) + Number(item.rental || 0);
        const eventRev = rowCost * rowDays;
        const paxN = Number(item.pax || 0) || 0;
        out.push({
            key: `agenda-${i}-${sd}`,
            line: `Event · ${sd}`,
            displayDate: sd,
            roomRev: 0,
            eventRev,
            roomNights: 0,
            stayNights: 0,
            pax: paxN,
            agendaStart: sd,
            agendaEnd: ed,
            agendaDays: inclusiveAgendaDayCount(sd, ed),
        });
    }
    if (out.length) return out;
    const br = computeRequestRevenueBreakdownNoTax(r);
    if (br.totalLineNoTax <= 0) return [];
    const anchor = fallbackOperationalAnchorYmd(r);
    if (anchor && inDateRangeYMD(anchor, filterStart, filterEnd)) {
        const t = String(r?.requestType || '').toLowerCase();
        const evHeavy =
            t === 'event' || t === 'event_rooms' || t.includes('event') || t === 'event with rooms' || t.includes('series');
        const trans = br.transportRevenue;
        if (evHeavy) {
            return [
                {
                    key: 'fallback-1',
                    line: 'Request total (line detail not split)',
                    displayDate: anchor,
                    roomRev: br.roomsRevenue + trans,
                    eventRev: br.eventRevenue,
                    roomNights: 0,
                    stayNights: 0,
                    pax: 0,
                    agendaStart: '',
                    agendaEnd: '',
                    agendaDays: 0,
                },
            ];
        }
        return [
            {
                key: 'fallback-1',
                line: 'Request total (line detail not split)',
                displayDate: anchor,
                roomRev: br.totalLineNoTax,
                eventRev: 0,
                roomNights: 0,
                stayNights: 0,
                pax: 0,
                agendaStart: '',
                agendaEnd: '',
                agendaDays: 0,
            },
        ];
    }
    return [];
}

export function requestTouchesOperationalDateRange(r: any, filterStart: string, filterEnd: string): boolean {
    if (!filterStart || !filterEnd) return true;
    return buildReportSegmentsForRequest(r, filterStart, filterEnd).length > 0;
}

/** Ex-tax: sum of segment line totals in range (transport on first segment only), same as Reports. */
export function sumRequestSegmentRevenueExTaxInRange(r: any, filterStart: string, filterEnd: string): number {
    const segs = buildReportSegmentsForRequest(r, filterStart, filterEnd);
    if (!segs.length) return 0;
    const br0 = computeRequestRevenueBreakdownNoTax(r);
    let t = 0;
    for (let si = 0; si < segs.length; si += 1) {
        const tPart = si === 0 ? br0.transportRevenue : 0;
        t += segmentLineTotalExTax(segs[si], tPart);
    }
    return t;
}

// --- Dashboard / account-profile charts: night- and agenda-day-level proration (not used by Reports vs LY) ---

function toYmdUtcMidnight(ms: number): string {
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

/** Occupied night dates: arrival night through night before checkout (same convention as dashboard overlap walks). */
export function eachOccupiedNightYmd(arrivalYmd: string, departureYmd: string): string[] {
    if (!arrivalYmd || !departureYmd) return [];
    const out: string[] = [];
    let c = new Date(`${arrivalYmd}T00:00:00`).getTime();
    const endMs = new Date(`${departureYmd}T00:00:00`).getTime();
    if (Number.isNaN(c) || Number.isNaN(endMs)) return [];
    while (c < endMs) {
        const y = toYmdUtcMidnight(c);
        if (y) out.push(y);
        c += 86400000;
    }
    return out;
}

function ymdInInclusiveRange(ymd: string, start: string, end: string): boolean {
    if (!ymd || !start || !end) return false;
    return ymd >= start && ymd <= end;
}

/** Inclusive agenda calendar days (start through end). */
export function eachInclusiveAgendaDayYmd(startYmd: string, endYmd: string): string[] {
    if (!startYmd) return [];
    const ed = endYmd || startYmd;
    const out: string[] = [];
    let c = new Date(`${startYmd}T00:00:00`).getTime();
    const endAt = new Date(`${ed}T00:00:00`).getTime();
    if (Number.isNaN(c) || Number.isNaN(endAt)) return [];
    while (c <= endAt) {
        const y = toYmdUtcMidnight(c);
        if (y) out.push(y);
        c += 86400000;
    }
    return out;
}

function isSeriesRequestDash(r: any): boolean {
    return String(r?.requestType || '').toLowerCase().includes('series');
}

function isMiceChartEligibleDash(r: any): boolean {
    if (isSeriesRequestDash(r)) return false;
    const t = String(r?.requestType || '').toLowerCase();
    if (t === 'event') return true;
    if (t === 'event_rooms') return true;
    if (t.includes('event with')) return true;
    return false;
}

export type DashboardFinancialBucket = {
    revenue: number;
    rooms: number;
    roomNights: number;
    roomsRevenue: number;
    miceRequests: number;
    miceRevenue: number;
};

/** Room count on a given calendar night from room lines (staggered series) or request totalRooms / 1. */
function nightlyRoomInventoryForNightYmd(r: any, ny: string): number {
    const rows = Array.isArray(r?.rooms) ? r.rooms : [];
    let s = 0;
    for (const row of rows) {
        const inA = parseYmdAgenda(row?.arrival || r?.checkIn);
        const outA = parseYmdAgenda(row?.departure || r?.checkOut);
        if (!inA || !outA) continue;
        for (const d of eachOccupiedNightYmd(inA, outA)) {
            if (d === ny) {
                s += Math.max(0, Number(row?.count || 0));
                break;
            }
        }
    }
    if (s > 0) return s;
    const tr = Number(r?.totalRooms ?? 0);
    if (Number.isFinite(tr) && tr > 0) return Math.round(tr);
    return 1;
}

function proratedRoomRevenueSubtotal(
    r: any,
    rangeStart: string,
    rangeEnd: string,
    br: { roomsRevenue: number; totalLineNoTax: number }
): number {
    let room = 0;
    const rooms = Array.isArray(r?.rooms) ? r.rooms : [];
    let rowRoomSum = 0;

    for (const row of rooms) {
        const inA = parseYmdAgenda(row?.arrival || r?.checkIn);
        const outA = parseYmdAgenda(row?.departure || r?.checkOut);
        if (!inA || !outA) continue;
        const count = Number(row?.count || 0);
        const rate = Number(row?.rate || 0);
        for (const ny of eachOccupiedNightYmd(inA, outA)) {
            if (!ymdInInclusiveRange(ny, rangeStart, rangeEnd)) continue;
            room += count * rate;
        }
        const tn = Math.max(0, calculateNights(inA, outA));
        if (tn > 0) rowRoomSum += count * Number(row?.rate || 0) * tn;
    }

    if (!rooms.length) {
        const inA = parseYmdAgenda(r?.checkIn);
        const outA = parseYmdAgenda(r?.checkOut);
        if (inA && outA) {
            const tn = Math.max(0, calculateNights(inA, outA));
            const ni = eachOccupiedNightYmd(inA, outA).filter((d) => ymdInInclusiveRange(d, rangeStart, rangeEnd)).length;
            if (tn > 0 && br.roomsRevenue > 0) room += (br.roomsRevenue * ni) / tn;
        }
    } else if (rowRoomSum <= 0 && br.roomsRevenue > 0) {
        const inA = parseYmdAgenda(r?.checkIn);
        const outA = parseYmdAgenda(r?.checkOut);
        if (inA && outA) {
            const tn = Math.max(0, calculateNights(inA, outA));
            const ni = eachOccupiedNightYmd(inA, outA).filter((d) => ymdInInclusiveRange(d, rangeStart, rangeEnd)).length;
            if (tn > 0) room += (br.roomsRevenue * ni) / tn;
        }
    }
    return room;
}

function proratedEventRevenueSubtotal(r: any, rangeStart: string, rangeEnd: string): number {
    let event = 0;
    const agenda = Array.isArray(r?.agenda) ? r.agenda : [];
    for (const item of agenda) {
        if (!item || typeof item !== 'object') continue;
        const sd = parseYmdAgenda(item.startDate);
        const ed = parseYmdAgenda(item.endDate || item.startDate) || sd;
        if (!sd) continue;
        let rowDays = 1;
        if (sd && ed) {
            const ms = new Date(`${ed}T00:00:00`).getTime() - new Date(`${sd}T00:00:00`).getTime();
            if (!Number.isNaN(ms)) rowDays = Math.max(1, Math.floor(ms / 86400000) + 1);
        }
        const rowCost = Number(item?.rate || 0) * Number(item?.pax || 0) + Number(item?.rental || 0);
        const lineTotal = rowCost * rowDays;
        const days = eachInclusiveAgendaDayYmd(sd, ed);
        const hit = days.filter((d) => ymdInInclusiveRange(d, rangeStart, rangeEnd));
        if (hit.length === 0) continue;
        event += lineTotal * (hit.length / rowDays);
    }
    return event;
}

/** Room-only ex-tax portion in range (dashboard performance vs budget). */
export function sumRequestProratedRoomRevenueExTaxInRange(r: any, rangeStart: string, rangeEnd: string): number {
    if (!rangeStart || !rangeEnd) return 0;
    const br = computeRequestRevenueBreakdownNoTax(r);
    let room = proratedRoomRevenueSubtotal(r, rangeStart, rangeEnd, br);
    const event = proratedEventRevenueSubtotal(r, rangeStart, rangeEnd);
    const sub = room + event;
    let fallbackRoom = 0;
    if (sub <= 0 && br.totalLineNoTax > 0) {
        const anchor = fallbackOperationalAnchorYmd(r);
        if (anchor && ymdInInclusiveRange(anchor, rangeStart, rangeEnd)) {
            const t = String(r?.requestType || '').toLowerCase();
            const evHeavy =
                t === 'event' || t === 'event_rooms' || t.includes('event') || t === 'event with rooms' || t.includes('series');
            if (!evHeavy) {
                const inA = parseYmdAgenda(r?.checkIn);
                const outA = parseYmdAgenda(r?.checkOut);
                if (inA && outA) {
                    const tn = Math.max(0, calculateNights(inA, outA));
                    const ni = eachOccupiedNightYmd(inA, outA).filter((d) => ymdInInclusiveRange(d, rangeStart, rangeEnd)).length;
                    if (tn > 0) fallbackRoom += (br.totalLineNoTax * ni) / tn;
                    else fallbackRoom += br.totalLineNoTax;
                } else fallbackRoom += br.totalLineNoTax;
            }
        }
    }
    return room + fallbackRoom;
}

/** Event / agenda ex-tax portion in range (dashboard F&B performance). */
export function sumRequestProratedEventRevenueExTaxInRange(r: any, rangeStart: string, rangeEnd: string): number {
    if (!rangeStart || !rangeEnd) return 0;
    const br = computeRequestRevenueBreakdownNoTax(r);
    const room = proratedRoomRevenueSubtotal(r, rangeStart, rangeEnd, br);
    let event = proratedEventRevenueSubtotal(r, rangeStart, rangeEnd);
    const sub = room + event;
    if (sub <= 0 && br.totalLineNoTax > 0) {
        const anchor = fallbackOperationalAnchorYmd(r);
        if (anchor && ymdInInclusiveRange(anchor, rangeStart, rangeEnd)) {
            const t = String(r?.requestType || '').toLowerCase();
            const evHeavy =
                t === 'event' || t === 'event_rooms' || t.includes('event') || t === 'event with rooms' || t.includes('series');
            if (evHeavy) {
                const inA = parseYmdAgenda(r?.checkIn);
                const outA = parseYmdAgenda(r?.checkOut);
                if (inA && outA) {
                    const tn = Math.max(0, calculateNights(inA, outA));
                    const ni = eachOccupiedNightYmd(inA, outA).filter((d) => ymdInInclusiveRange(d, rangeStart, rangeEnd)).length;
                    if (tn > 0) {
                        const tot = br.eventRevenue + br.roomsRevenue + br.transportRevenue;
                        event += (tot * ni) / tn;
                    } else event += br.totalLineNoTax;
                } else event += br.totalLineNoTax;
            }
        }
    }
    return event;
}

/**
 * Ex-tax total for [rangeStart, rangeEnd]: room revenue by occupied nights in range,
 * agenda/event revenue by calendar days in range, transport once if any room/event attributed.
 * (Dashboard KPIs / feed — not Reports export.)
 */
export function sumRequestProratedRevenueExTaxInRange(r: any, rangeStart: string, rangeEnd: string): number {
    if (!rangeStart || !rangeEnd) return 0;
    const br = computeRequestRevenueBreakdownNoTax(r);
    const room = proratedRoomRevenueSubtotal(r, rangeStart, rangeEnd, br);
    const event = proratedEventRevenueSubtotal(r, rangeStart, rangeEnd);
    const sub = room + event;
    const transport = sub > 0 ? br.transportRevenue : 0;
    let fallback = 0;
    if (sub <= 0 && br.totalLineNoTax > 0) {
        const anchor = fallbackOperationalAnchorYmd(r);
        if (anchor && ymdInInclusiveRange(anchor, rangeStart, rangeEnd)) {
            const t = String(r?.requestType || '').toLowerCase();
            const evHeavy =
                t === 'event' || t === 'event_rooms' || t.includes('event') || t === 'event with rooms' || t.includes('series');
            if (evHeavy) {
                const inA = parseYmdAgenda(r?.checkIn);
                const outA = parseYmdAgenda(r?.checkOut);
                if (inA && outA) {
                    const tn = Math.max(0, calculateNights(inA, outA));
                    const ni = eachOccupiedNightYmd(inA, outA).filter((d) => ymdInInclusiveRange(d, rangeStart, rangeEnd)).length;
                    if (tn > 0) fallback += (br.totalLineNoTax * ni) / tn;
                    else fallback += br.totalLineNoTax;
                } else {
                    fallback += br.totalLineNoTax;
                }
            } else {
                const inA = parseYmdAgenda(r?.checkIn);
                const outA = parseYmdAgenda(r?.checkOut);
                if (inA && outA) {
                    const tn = Math.max(0, calculateNights(inA, outA));
                    const ni = eachOccupiedNightYmd(inA, outA).filter((d) => ymdInInclusiveRange(d, rangeStart, rangeEnd)).length;
                    if (tn > 0) fallback += (br.totalLineNoTax * ni) / tn;
                    else fallback += br.totalLineNoTax;
                } else {
                    fallback += br.totalLineNoTax;
                }
            }
        }
    }

    return room + event + transport + fallback;
}

/**
 * Add prorated revenue / room nights / MICE slices into dashboard-style month (or day) buckets.
 * Caller supplies `includeRoomsChart` / `includeMiceChart` (same gates as AS.tsx).
 */
export function addProratedRequestFinancialsToDashboardBuckets(
    r: any,
    rangeStart: string,
    rangeEnd: string,
    keyFor: (isoYmd: string) => string,
    getBucket: (key: string) => DashboardFinancialBucket | undefined,
    opts: { skipPerf: boolean; includeRoomsChart: boolean; includeMiceChart: boolean }
): void {
    if (opts.skipPerf || !rangeStart || !rangeEnd) return;
    const br = computeRequestRevenueBreakdownNoTax(r);
    const transport = br.transportRevenue;
    const allocDates: string[] = [];

    const touch = (ymd: string, fn: (b: DashboardFinancialBucket) => void) => {
        const k = keyFor(ymd);
        const b = getBucket(k);
        if (!b) return;
        fn(b);
        allocDates.push(ymd);
    };

    const rooms = Array.isArray(r?.rooms) ? r.rooms : [];
    const anyRowWithRate = rooms.some((rr: any) => Number(rr?.rate || 0) > 0);

    const addRatedRoomRows = (alsoRoomsChart: boolean) => {
        for (const row of rooms) {
            if (anyRowWithRate && Number(row?.rate || 0) <= 0) continue;
            const inA = parseYmdAgenda(row?.arrival || r?.checkIn);
            const outA = parseYmdAgenda(row?.departure || r?.checkOut);
            if (!inA || !outA) continue;
            const count = Number(row?.count || 0);
            const rate = Number(row?.rate || 0);
            const tn = Math.max(0, calculateNights(inA, outA));
            if (tn <= 0) continue;
            const perNight = count * rate;
            for (const ny of eachOccupiedNightYmd(inA, outA)) {
                if (!ymdInInclusiveRange(ny, rangeStart, rangeEnd)) continue;
                touch(ny, (b) => {
                    b.revenue += perNight;
                    if (alsoRoomsChart) {
                        b.roomsRevenue += perNight;
                        b.roomNights += count;
                        // Per occupied night: full line count (rooms on that night). count/tn prorates to
                        // fractions so day/month buckets round to 0 and cross-month lines disappear.
                        b.rooms += count;
                    }
                });
            }
        }
    };

    if (!anyRowWithRate && br.roomsRevenue > 0) {
        const inA = parseYmdAgenda(r?.checkIn);
        const outA = parseYmdAgenda(r?.checkOut);
        if (inA && outA) {
            const tn = Math.max(0, calculateNights(inA, outA));
            const nights = eachOccupiedNightYmd(inA, outA).filter((d) => ymdInInclusiveRange(d, rangeStart, rangeEnd));
            if (tn > 0 && nights.length) {
                const perNightRoomRev = br.roomsRevenue / tn;
                for (const ny of nights) {
                    const nightlyR = nightlyRoomInventoryForNightYmd(r, ny);
                    touch(ny, (b) => {
                        b.revenue += perNightRoomRev;
                        if (opts.includeRoomsChart) {
                            b.roomsRevenue += perNightRoomRev;
                            b.roomNights += nightlyR;
                            b.rooms += nightlyR;
                        }
                    });
                }
            }
        }
    } else {
        addRatedRoomRows(opts.includeRoomsChart);
        let rowSum = 0;
        for (const row of rooms) {
            const inA = parseYmdAgenda(row?.arrival || r?.checkIn);
            const outA = parseYmdAgenda(row?.departure || r?.checkOut);
            if (!inA || !outA) continue;
            const count = Number(row?.count || 0);
            const rate = Number(row?.rate || 0);
            rowSum += count * rate * Math.max(0, calculateNights(inA, outA));
        }
        if (rowSum <= 0 && br.roomsRevenue > 0) {
            const inA = parseYmdAgenda(r?.checkIn);
            const outA = parseYmdAgenda(r?.checkOut);
            const tn = Math.max(0, calculateNights(inA, outA));
            const nights = inA && outA ? eachOccupiedNightYmd(inA, outA).filter((d) => ymdInInclusiveRange(d, rangeStart, rangeEnd)) : [];
            if (tn > 0 && nights.length) {
                const perNight = br.roomsRevenue / tn;
                for (const ny of nights) {
                    const nightlyR = nightlyRoomInventoryForNightYmd(r, ny);
                    touch(ny, (b) => {
                        b.revenue += perNight;
                        if (opts.includeRoomsChart) {
                            b.roomsRevenue += perNight;
                            b.roomNights += nightlyR;
                            b.rooms += nightlyR;
                        }
                    });
                }
            }
        }
    }

    const agenda = Array.isArray(r?.agenda) ? r.agenda : [];
    for (const item of agenda) {
        if (!item || typeof item !== 'object') continue;
        const sd = parseYmdAgenda(item.startDate);
        const ed = parseYmdAgenda(item.endDate || item.startDate) || sd;
        if (!sd) continue;
        let rowDays = 1;
        if (sd && ed) {
            const ms = new Date(`${ed}T00:00:00`).getTime() - new Date(`${sd}T00:00:00`).getTime();
            if (!Number.isNaN(ms)) rowDays = Math.max(1, Math.floor(ms / 86400000) + 1);
        }
        const rowCost = Number(item?.rate || 0) * Number(item?.pax || 0) + Number(item?.rental || 0);
        const lineTotal = rowCost * rowDays;
        const hit = eachInclusiveAgendaDayYmd(sd, ed).filter((d) => ymdInInclusiveRange(d, rangeStart, rangeEnd));
        if (!hit.length) continue;
        const daily = lineTotal / rowDays;
        for (const dy of hit) {
            touch(dy, (b) => {
                b.revenue += daily;
            });
        }
        if (opts.includeMiceChart && isMiceChartEligibleDash(r) && lineTotal > 0) {
            for (const dy of hit) {
                const k = keyFor(dy);
                const b = getBucket(k);
                if (!b) continue;
                b.miceRevenue += daily;
                b.miceRequests += 1 / rowDays;
            }
        }
    }

    let subForTransport = 0;
    for (const row of rooms) {
        const inA = parseYmdAgenda(row?.arrival || r?.checkIn);
        const outA = parseYmdAgenda(row?.departure || r?.checkOut);
        if (!inA || !outA) continue;
        const count = Number(row?.count || 0);
        const rate = Number(row?.rate || 0);
        for (const ny of eachOccupiedNightYmd(inA, outA)) {
            if (ymdInInclusiveRange(ny, rangeStart, rangeEnd)) subForTransport += count * rate;
        }
    }
    if (!rooms.length) {
        const inA = parseYmdAgenda(r?.checkIn);
        const outA = parseYmdAgenda(r?.checkOut);
        const tn = inA && outA ? Math.max(0, calculateNights(inA, outA)) : 0;
        const ni = inA && outA ? eachOccupiedNightYmd(inA, outA).filter((d) => ymdInInclusiveRange(d, rangeStart, rangeEnd)).length : 0;
        if (tn > 0 && br.roomsRevenue > 0 && ni > 0) subForTransport += (br.roomsRevenue * ni) / tn;
    } else {
        let rowSum = 0;
        for (const row of rooms) {
            const inA = parseYmdAgenda(row?.arrival || r?.checkIn);
            const outA = parseYmdAgenda(row?.departure || r?.checkOut);
            if (!inA || !outA) continue;
            const count = Number(row?.count || 0);
            const rate = Number(row?.rate || 0);
            rowSum += count * rate * Math.max(0, calculateNights(inA, outA));
        }
        if (rowSum <= 0 && br.roomsRevenue > 0) {
            const inA = parseYmdAgenda(r?.checkIn);
            const outA = parseYmdAgenda(r?.checkOut);
            const tn = inA && outA ? Math.max(0, calculateNights(inA, outA)) : 0;
            const ni = inA && outA ? eachOccupiedNightYmd(inA, outA).filter((d) => ymdInInclusiveRange(d, rangeStart, rangeEnd)).length : 0;
            if (tn > 0 && ni > 0) subForTransport += (br.roomsRevenue * ni) / tn;
        }
    }
    for (const item of agenda) {
        if (!item || typeof item !== 'object') continue;
        const sd = parseYmdAgenda(item.startDate);
        const ed = parseYmdAgenda(item.endDate || item.startDate) || sd;
        if (!sd) continue;
        let rowDays = 1;
        if (sd && ed) {
            const ms = new Date(`${ed}T00:00:00`).getTime() - new Date(`${sd}T00:00:00`).getTime();
            if (!Number.isNaN(ms)) rowDays = Math.max(1, Math.floor(ms / 86400000) + 1);
        }
        const rowCost = Number(item?.rate || 0) * Number(item?.pax || 0) + Number(item?.rental || 0);
        const lineTotal = rowCost * rowDays;
        const hit = eachInclusiveAgendaDayYmd(sd, ed).filter((d) => ymdInInclusiveRange(d, rangeStart, rangeEnd));
        if (hit.length) subForTransport += lineTotal * (hit.length / rowDays);
    }

    if (transport > 0 && subForTransport > 0) {
        const sorted = [...new Set(allocDates)].sort();
        const anchor = sorted[0] || rangeStart;
        const k = keyFor(anchor);
        const b = getBucket(k);
        if (b) b.revenue += transport;
    }
}
