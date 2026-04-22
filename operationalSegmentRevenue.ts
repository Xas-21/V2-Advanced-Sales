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
