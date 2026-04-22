import React, { useEffect, useMemo, useState } from 'react';
import {
    BarChart3,
    Download,
    FileText,
    FileSpreadsheet,
    FileDown,
    RefreshCw,
    Eye,
    Trash2,
    Edit,
    Briefcase,
    Wine,
    BedDouble,
    Users,
    PhoneCall,
    LineChart,
} from 'lucide-react';
import { filterRequestsForAccount, computeAccountMetrics, flattenCrmLeads } from './accountProfileData';
import { formatCompactCurrency } from './formatCompactCurrency';
import { convertCurrencyToSar, convertSarToCurrency, formatCurrencyAmount, resolveCurrencyCode, type CurrencyCode } from './currency';
import { canReportsPreviewSourceRows, canReportsUseDataSource } from './userPermissions';
import { paymentsMeetOrExceedTotal } from './beoShared';
import {
    buildYearOptionsForReports,
    buildVsLyMatrix,
    defaultVsReportYear,
    exportVsLyMatrixCsv,
    exportVsLyMatrixExcelHtml,
    type VsLyMatrixRow,
} from './reportsVsLastYear';
import { resolveAccountTypesForProperty, resolveSegmentsForProperty } from './propertyTaxonomy';

interface ReportsProps {
    theme: any;
    activeProperty?: any;
    sharedRequests?: any[];
    accounts?: any[];
    crmLeads?: Record<string, any[]>;
    tasks?: any[];
    currency?: CurrencyCode;
    currentUser?: any;
}

const initialSavedReports: any[] = [];

type ReportEntity = 'Requests' | 'Accounts' | 'MICE' | 'Tasks' | 'Sales Calls' | 'Rooms vs LY' | 'MICE vs LY';

function normalizeRequestTypeKey(raw: string = '') {
    const t = String(raw || '').toLowerCase().trim();
    if (t === 'event' || t === 'event only') return 'event';
    if (t === 'event_rooms' || t === 'event with rooms' || t === 'event with room' || t.includes('event with room')) return 'event_rooms';
    if (t === 'series' || t === 'series group') return 'series';
    if (t === 'accommodation' || t === 'accommodation only') return 'accommodation';
    return t || 'accommodation';
}

function requestTypeLabel(raw: string = '') {
    const k = normalizeRequestTypeKey(raw);
    if (k === 'event') return 'Event only';
    if (k === 'event_rooms') return 'Event with rooms';
    if (k === 'series') return 'Series group';
    return 'Accommodation';
}

function requestTotalValue(r: any): number {
    return parseFloat(String(r.totalCost ?? r.grandTotalWithTax ?? r.totalCostWithTax ?? 0).replace(/,/g, '')) || 0;
}

function requestPrimaryDate(r: any): string {
    const d = r.receivedDate || r.requestDate || r.checkIn || (typeof r.createdAt === 'string' ? r.createdAt.split('T')[0] : '');
    return String(d || '').slice(0, 10);
}

function inDateRangeYMD(dateStr: string, start: string, end: string): boolean {
    const d = String(dateStr || '').slice(0, 10);
    if (!start || !end) return true;
    if (!d) return false;
    return d >= start && d <= end;
}

/** Earliest agenda start and latest agenda end (YYYY-MM-DD). */
function agendaSpanFromRequest(r: any): { start: string; end: string } {
    const agenda = Array.isArray(r?.agenda) ? r.agenda : [];
    let minS = '';
    let maxE = '';
    for (const row of agenda) {
        const s = parseYmdAgenda(row?.startDate);
        const e = parseYmdAgenda(row?.endDate || row?.startDate) || s;
        if (s && (!minS || s < minS)) minS = s;
        if (e && (!maxE || e > maxE)) maxE = e;
    }
    return { start: minS, end: maxE || minS };
}

function rangesOverlapYmd(aStart: string, aEnd: string, filterStart: string, filterEnd: string): boolean {
    if (!filterStart || !filterEnd) return true;
    const as = aStart || aEnd;
    const ae = aEnd || aStart;
    if (!as && !ae) return false;
    return !(ae < filterStart || as > filterEnd);
}

function inclusiveAgendaDayCount(startYmd: string, endYmd: string): number {
    if (!startYmd || !endYmd) return 0;
    const a = new Date(`${startYmd}T00:00:00`).getTime();
    const b = new Date(`${endYmd}T00:00:00`).getTime();
    if (Number.isNaN(a) || Number.isNaN(b)) return 0;
    return Math.max(1, Math.floor((b - a) / 86400000) + 1);
}

function parseYmdAgenda(v: any): string {
    const raw = String(v || '').trim().slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    const dt = new Date(raw);
    if (Number.isNaN(dt.getTime())) return '';
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const d = String(dt.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function calculateNights(inDate: string, outDate: string) {
    if (!inDate || !outDate) return 0;
    const diff = new Date(outDate).getTime() - new Date(inDate).getTime();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

function asNumberReport(v: any): number {
    return parseFloat(String(v ?? 0).replace(/,/g, '')) || 0;
}

/**
 * Rooms + event + transport line revenue without tax (same rules as operational dashboard).
 * When lines are empty but a stored no-tax total exists: MICE-like types attribute to event;
 * other types attribute the full stored amount to rooms.
 */
function computeRequestRevenueBreakdownNoTax(r: any): {
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
            t === 'event' ||
            t === 'event_rooms' ||
            t.includes('series') ||
            t.includes('event with');
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

function isEventOrEventRoomsType(r: any): boolean {
    const k = normalizeRequestTypeKey(r?.requestType);
    return k === 'event' || k === 'event_rooms';
}

function matchesStatusFilter(selected: string[], rawStatus: string): boolean {
    if (!selected.length) return true;
    const r = String(rawStatus || '').trim().toLowerCase();
    return selected.some((s) => {
        const sl = s.toLowerCase();
        if (sl === 'inquiry' && (r === 'draft' || r === 'inquiry')) return true;
        return sl === r;
    });
}

function defaultMonthRange() {
    const today = new Date();
    const y = today.getFullYear();
    const mo = today.getMonth();
    const start = `${y}-${String(mo + 1).padStart(2, '0')}-01`;
    const last = new Date(y, mo + 1, 0).getDate();
    const end = `${y}-${String(mo + 1).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
    return { start, end };
}

function formatSar(n: number, currency: CurrencyCode): string {
    return formatCurrencyAmount(Number(n) || 0, currency, { maximumFractionDigits: 2 });
}

function csvEscape(v: any): string {
    const s = String(v ?? '');
    return `"${s.replace(/"/g, '""')}"`;
}

function triggerDownload(content: BlobPart, fileName: string, type: string) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

export default function Reports({
    theme,
    activeProperty,
    sharedRequests = [],
    accounts = [],
    crmLeads = {},
    tasks = [],
    currency = 'SAR',
    currentUser,
}: ReportsProps) {
    const colors = theme.colors;
    const selectedCurrency = resolveCurrencyCode(currency);
    const month = defaultMonthRange();
    const [currentView, setCurrentView] = useState<'builder' | 'saved'>('builder');
    const [selectedEntity, setSelectedEntity] = useState<ReportEntity>('Requests');
    const [filters, setFilters] = useState<any>({
        dateRange: { start: month.start, end: month.end },
        statuses: [] as string[],
        valueRange: { min: 0, max: 500_000_000 },
        vsReportYear: new Date().getFullYear(),
        /** Rooms / MICE vs LY: show request-segment and/or account-type breakdown rows */
        vsLyByRequestSegment: true,
        vsLyByAccountType: true,
    });
    const [selectedColumns, setSelectedColumns] = useState<string[]>([
        'Request ID', 'Line', 'Client', 'Request Type', 'Date', 'Status', 'Payment Status', 'Paid Amount', 'Unpaid Amount', 'Amount',
    ]);
    const [exportFormat, setExportFormat] = useState<'pdf' | 'excel' | 'csv'>('pdf');
    const [showPreview, setShowPreview] = useState(false);
    const [savedReports] = useState(initialSavedReports);
    /** Vs LY: row id or segmentGroupKey to exclude from preview + export (unchecked in Columns) */
    const [vsLyRowHidden, setVsLyRowHidden] = useState<Set<string>>(() => new Set());

    const pid = activeProperty?.id;

    const propertyRequestSegments = useMemo(
        () => resolveSegmentsForProperty(String(pid || ''), activeProperty),
        [pid, activeProperty]
    );
    const propertyAccountTypes = useMemo(
        () => resolveAccountTypesForProperty(String(pid || ''), activeProperty),
        [pid, activeProperty]
    );

    const scopedRequests = useMemo(() => {
        return (sharedRequests || []).filter(
            (r: any) => !pid || !r.propertyId || String(r.propertyId) === String(pid)
        );
    }, [sharedRequests, pid]);

    const scopedTasks = useMemo(() => {
        return (tasks || []).filter(
            (t: any) => !pid || !t.propertyId || String(t.propertyId) === String(pid)
        );
    }, [tasks, pid]);

    const scopedSalesCalls = useMemo(() => {
        const flat = flattenCrmLeads(crmLeads || {});
        return flat.filter((call: any) => {
            if (!pid) return true;
            if (call?.propertyId && String(call.propertyId) === String(pid)) return true;
            const aid = String(call?.accountId || '').trim();
            const acc = aid ? (accounts || []).find((a: any) => String(a?.id || '') === aid) : null;
            if (acc?.propertyId && String(acc.propertyId) === String(pid)) return true;
            return false;
        });
    }, [crmLeads, accounts, pid]);

    const entities = [
        { id: 'Requests' as ReportEntity, icon: BedDouble, label: 'Requests' },
        { id: 'Accounts' as ReportEntity, icon: Briefcase, label: 'Accounts' },
        { id: 'MICE' as ReportEntity, icon: Wine, label: 'MICE' },
        { id: 'Rooms vs LY' as ReportEntity, icon: LineChart, label: 'Rooms vs LY' },
        { id: 'MICE vs LY' as ReportEntity, icon: BarChart3, label: 'MICE vs LY' },
        { id: 'Tasks' as ReportEntity, icon: Users, label: 'Tasks' },
        { id: 'Sales Calls' as ReportEntity, icon: PhoneCall, label: 'Sales Calls' },
    ];

    const isVsLySource = selectedEntity === 'Rooms vs LY' || selectedEntity === 'MICE vs LY';

    useEffect(() => {
        setVsLyRowHidden(new Set());
    }, [selectedEntity, filters.vsReportYear]);

    const canUseSelectedSource = canReportsUseDataSource(currentUser, selectedEntity);
    const canPreviewRows = canReportsPreviewSourceRows(currentUser);

    const availableColumns: Record<ReportEntity, string[]> = {
        Requests: [
            'Request ID',
            'Line',
            'Client',
            'Request Type',
            'Date',
            'Status',
            'Payment Status',
            'Nights',
            'Room Nights',
            'PAX',
            'DDR',
            'AVG ADR',
            'Paid Amount',
            'Unpaid Amount',
            'Event Revenue',
            'Rooms Revenue',
            'Rooms + Event',
            'Amount',
        ],
        Accounts: ['ID', 'Name', 'Segment', 'Total Bookings', 'Total Revenue'],
        MICE: [
            'Request ID',
            'Line',
            'Client',
            'Request Type',
            'Agenda start',
            'Agenda end',
            'Agenda days',
            'Status',
            'Payment Status',
            'PAX',
            'DDR',
            'Event Revenue',
            'Paid Amount',
            'Unpaid Amount',
            'Amount',
        ],
        Tasks: ['ID', 'Task', 'Client', 'Due Date', 'Priority', 'Assignee'],
        'Sales Calls': [
            'ID',
            'Date',
            'Location',
            'Address',
            'Name',
            'Position',
            'Contact email',
            'Contact phone',
            'Subject',
            'Company',
            'Stage',
            'Outcome',
            'Follow-up',
            'Next Step',
            'Expected Revenue',
            'Owner',
        ],
        'Rooms vs LY': [],
        'MICE vs LY': [],
    };

    useEffect(() => {
        const firstAllowed = entities.find((e) => canReportsUseDataSource(currentUser, e.id));
        if (!firstAllowed) return;
        if (!canReportsUseDataSource(currentUser, selectedEntity)) {
            setSelectedEntity(firstAllowed.id);
            setSelectedColumns([...(availableColumns[firstAllowed.id] || [])]);
            setShowPreview(false);
        }
    }, [currentUser, selectedEntity]);

    const yearOptionsForVs = useMemo(() => buildYearOptionsForReports(scopedRequests), [scopedRequests]);

    useEffect(() => {
        if (!isVsLySource) return;
        if (!yearOptionsForVs.length) return;
        const y = Number(filters.vsReportYear);
        if (!yearOptionsForVs.includes(y)) {
            setFilters((f: any) => ({ ...f, vsReportYear: defaultVsReportYear(yearOptionsForVs) }));
        }
    }, [isVsLySource, yearOptionsForVs, filters.vsReportYear]);

    const statusOptions = selectedEntity === 'Sales Calls'
        ? ['Upcoming Sales Calls', 'Waiting list', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'WON', 'Not Interested']
        : ['Inquiry', 'Accepted', 'Tentative', 'Definite', 'Actual', 'Cancelled'];

    const handleEntityChange = (entity: ReportEntity) => {
        setSelectedEntity(entity);
        setSelectedColumns([...(availableColumns[entity] || [])]);
        setShowPreview(false);
    };

    const toggleColumn = (column: string) => {
        if (selectedColumns.includes(column)) {
            setSelectedColumns(selectedColumns.filter((c) => c !== column));
        } else {
            setSelectedColumns([...selectedColumns, column]);
        }
    };

    const toggleStatus = (status: string) => {
        if (filters.statuses.includes(status)) {
            setFilters({ ...filters, statuses: filters.statuses.filter((s: string) => s !== status) });
        } else {
            setFilters({ ...filters, statuses: [...filters.statuses, status] });
        }
    };

    const handleGeneratePreview = () => {
        setShowPreview(true);
    };

    const reportPack = useMemo(() => {
        if (selectedEntity === 'Rooms vs LY' || selectedEntity === 'MICE vs LY') {
            const y = Number(filters.vsReportYear) || new Date().getFullYear();
            const kind = selectedEntity === 'Rooms vs LY' ? 'rooms' : 'mice';
            const { rows: vsRows, yearLy } = buildVsLyMatrix(
                kind,
                scopedRequests,
                accounts || [],
                y,
                selectedCurrency,
                {
                    propertyRequestSegments,
                    propertyAccountTypes,
                    includeRequestSegments: Boolean(filters.vsLyByRequestSegment),
                    includeAccountTypes: Boolean(filters.vsLyByAccountType),
                }
            );
            return {
                rows: [] as any[],
                summary: {
                    'Report year (CY)': y,
                    'Vs last year (LY)': yearLy,
                    'Revenue basis': 'Line-based (excl. cancelled from all slices)',
                    'Definite + Actual': 'CY / LY comparison columns',
                    OTB: 'Inquiry + Accepted + Tentative (chosen year; excl. cancelled)',
                } as Record<string, string | number>,
                exportColumns: [] as string[],
                vsLyRows: vsRows,
                vsLyMeta: { kind, year: y, yearLy },
                isVsLyMatrix: true,
            };
        }

        const { start, end } = filters.dateRange || {};
        const st = filters.statuses || [];
        const vmin = Number(filters.valueRange?.min) || 0;
        const vmax = Number(filters.valueRange?.max) || Number.MAX_SAFE_INTEGER;

        const passRequestFilters = (r: any, miceOnly: boolean) => {
            const agenda = Array.isArray(r?.agenda) ? r.agenda : [];
            if (miceOnly && agenda.length === 0) return false;
            if (!matchesStatusFilter(st, r.status)) return false;
            const amt = requestTotalValue(r);
            if (amt < vmin || amt > vmax) return false;
            if (miceOnly) {
                const span = agendaSpanFromRequest(r);
                if (!span.start) return false;
                if (!rangesOverlapYmd(span.start, span.end, start, end)) return false;
            } else if (!inDateRangeYMD(requestPrimaryDate(r), start, end)) {
                return false;
            }
            return true;
        };

        const calculateRoomBlock = (r: any) => {
            const rooms = Array.isArray(r.rooms) ? r.rooms : [];
            const reqNights = calculateNights(String(r.checkIn || ''), String(r.checkOut || ''));
            let roomNights = 0;
            let roomRevenue = 0;
            let weightedRate = 0;
            for (const room of rooms) {
                const count = Number(room?.count || 0);
                const rate = Number(room?.rate || 0);
                const nights = normalizeRequestTypeKey(r.requestType) === 'series'
                    ? calculateNights(String(room?.arrival || ''), String(room?.departure || ''))
                    : reqNights;
                const n = Math.max(0, nights) * Math.max(0, count);
                roomNights += n;
                roomRevenue += n * rate;
                weightedRate += rate * n;
            }
            const avgAdr = roomNights > 0 ? weightedRate / roomNights : 0;
            const ratePerNight = roomNights > 0 ? roomRevenue / roomNights : 0;
            return { roomNights, roomRevenue, avgAdr, ratePerNight, reqNights };
        };

        const calculateEventBlock = (r: any) => {
            const agenda = Array.isArray(r.agenda) ? r.agenda : [];
            const pax = agenda.reduce((sum: number, row: any) => sum + (Number(row?.pax || 0) || 0), 0);
            const eventRevenue = agenda.reduce((sum: number, row: any) => {
                const sd = parseYmdAgenda(row?.startDate);
                const ed = parseYmdAgenda(row?.endDate || row?.startDate);
                let rowDays = 1;
                if (sd && ed) {
                    const ms = new Date(`${ed}T00:00:00`).getTime() - new Date(`${sd}T00:00:00`).getTime();
                    if (!Number.isNaN(ms)) rowDays = Math.max(1, Math.floor(ms / 86400000) + 1);
                }
                const rowCost = (Number(row?.rate || 0) * Number(row?.pax || 0)) + Number(row?.rental || 0);
                return sum + rowCost * rowDays;
            }, 0);
            const ddr = pax > 0 ? eventRevenue / pax : 0;
            const span = agendaSpanFromRequest(r);
            const agendaDays = inclusiveAgendaDayCount(span.start, span.end);
            return {
                pax,
                eventRevenue,
                ddr,
                agendaStart: span.start,
                agendaEnd: span.end,
                agendaDays,
            };
        };

        const paymentBlock = (r: any) => {
            const total = requestTotalValue(r);
            const paid = Array.isArray(r?.payments) && r.payments.length
                ? r.payments.reduce((sum: number, p: any) => sum + (Number(p?.amount || 0) || 0), 0)
                : parseFloat(String(r?.paidAmount ?? 0).replace(/,/g, '')) || 0;
            const unpaid = Math.max(0, total - paid);
            const status = String(r?.paymentStatus || '').trim()
                || (paymentsMeetOrExceedTotal(paid, total) ? 'Paid' : paid > 0 ? 'Deposit' : 'Unpaid');
            return { paid, unpaid, status };
        };

        const requestsFiltered = scopedRequests.filter((r) => passRequestFilters(r, false));
        const miceFiltered = scopedRequests.filter((r) => passRequestFilters(r, true));

        if (selectedEntity === 'Sales Calls') {
            const stageLabel = (raw: string) => {
                const s = String(raw || '').toLowerCase().trim();
                if (s === 'new') return 'Upcoming Sales Calls';
                if (s === 'waiting') return 'Waiting list';
                if (s === 'qualified') return 'QUALIFIED';
                if (s === 'proposal') return 'PROPOSAL';
                if (s === 'negotiation') return 'NEGOTIATION';
                if (s === 'won') return 'WON';
                if (s === 'notinterested') return 'Not Interested';
                return String(raw || '—');
            };
            const selectedStatusesNormalized = (st || []).map((x: string) => x.trim().toLowerCase());
            const rows = scopedSalesCalls
                .filter((lead: any) => {
                    const date = String(lead?.lastContact || lead?.date || '').slice(0, 10);
                    if (!inDateRangeYMD(date, start, end)) return false;
                    if (!selectedStatusesNormalized.length) return true;
                    const label = stageLabel(String(lead?.stage || '')).toLowerCase();
                    return selectedStatusesNormalized.includes(label);
                })
                .map((lead: any) => {
                    const stage = stageLabel(String(lead?.stage || ''));
                    const city = String(lead?.city || '').trim();
                    const country = String(lead?.country || '').trim();
                    const street = String(lead?.street || '').trim();
                    const address = [street, city, country].filter(Boolean).join(', ');
                    const outcome = String(lead?.description || '').trim() || '—';
                    const followUpDate = String(lead?.followUpDate || '').trim();
                    return {
                        ID: String(lead?.id || '—'),
                        Date: String(lead?.lastContact || lead?.date || '—').slice(0, 10) || '—',
                        Location: [city, country].filter(Boolean).join(', ') || '—',
                        Address: address || '—',
                        Name: String(lead?.contact || '—'),
                        Position: String(lead?.position || '—'),
                        'Contact email': String(lead?.email || '').trim() || '—',
                        'Contact phone': String(lead?.phone || '').trim() || '—',
                        Subject: String(lead?.subject || '—'),
                        Company: String(lead?.company || '—'),
                        Stage: stage,
                        Outcome: outcome,
                        'Follow-up': followUpDate || 'No follow-up',
                        'Next Step': String(lead?.nextStep || '—'),
                        'Expected Revenue': formatSar(Number(lead?.value || 0), selectedCurrency),
                        Owner: String(lead?.accountManager || lead?.ownerUserId || '—'),
                    };
                });

            return {
                rows,
                summary: {
                    'Total sales calls': rows.length,
                    'With follow-up': rows.filter((r: any) => String(r['Follow-up']) !== 'No follow-up').length,
                    'Open opportunities': rows.filter((r: any) =>
                        ['Upcoming Sales Calls', 'Waiting list', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION'].includes(String(r.Stage))
                    ).length,
                    'Expected revenue': formatSar(
                        rows.reduce((sum: number, r: any) => sum + (parseFloat(String(r['Expected Revenue']).replace(/[^\d.-]/g, '')) || 0), 0),
                        selectedCurrency
                    ),
                },
                exportColumns: availableColumns['Sales Calls'],
                isVsLyMatrix: false,
                vsLyRows: null,
                vsLyMeta: null,
            };
        }

        if (selectedEntity === 'Requests' || selectedEntity === 'MICE') {
            const source = selectedEntity === 'MICE' ? miceFiltered : requestsFiltered;
            const rows: any[] = [];

            let totalAmount = 0;
            let totalPax = 0;
            let totalRoomNights = 0;
            let weightedAdrSum = 0;
            let totalPaid = 0;
            let totalUnpaid = 0;
            let totalEventRevenue = 0;
            let totalMiceEventRevNoTax = 0;
            let totalMiceRoomsRevNoTax = 0;
            let requestCount = 0;
            const typeCounter: Record<string, number> = {
                accommodation: 0,
                event: 0,
                event_rooms: 0,
                series: 0,
            };

            for (const r of source) {
                requestCount += 1;
                const typeKey = normalizeRequestTypeKey(r.requestType);
                typeCounter[typeKey] = (typeCounter[typeKey] || 0) + 1;

                const status = r.status || '—';
                const client = r.account || r.accountName || '—';
                const total = requestTotalValue(r);
                totalAmount += total;

                const roomBlock = calculateRoomBlock(r);
                const eventBlock = calculateEventBlock(r);
                const pay = paymentBlock(r);
                totalPax += eventBlock.pax;
                totalRoomNights += roomBlock.roomNights;
                weightedAdrSum += roomBlock.avgAdr * roomBlock.roomNights;
                totalEventRevenue += eventBlock.eventRevenue;
                totalPaid += pay.paid;
                totalUnpaid += pay.unpaid;

                if (selectedEntity === 'MICE') {
                    const revNoTax = computeRequestRevenueBreakdownNoTax(r);
                    totalMiceEventRevNoTax += revNoTax.eventRevenue;
                    totalMiceRoomsRevNoTax += revNoTax.roomsRevenue;
                    rows.push({
                        'Request ID': r.id || '—',
                        Line: 'Single',
                        Client: client,
                        'Request Type': requestTypeLabel(r.requestType),
                        'Agenda start': eventBlock.agendaStart || '—',
                        'Agenda end': eventBlock.agendaEnd || '—',
                        'Agenda days': eventBlock.agendaDays || 0,
                        Status: status,
                        'Payment Status': pay.status,
                        PAX: eventBlock.pax || 0,
                        DDR: eventBlock.ddr ? formatSar(eventBlock.ddr, selectedCurrency) : '—',
                        'Event Revenue': eventBlock.eventRevenue ? formatSar(eventBlock.eventRevenue, selectedCurrency) : '—',
                        'Paid Amount': formatSar(pay.paid, selectedCurrency),
                        'Unpaid Amount': formatSar(pay.unpaid, selectedCurrency),
                        Amount: formatSar(total, selectedCurrency),
                    });
                } else {
                    const date = requestPrimaryDate(r) || '—';
                    const revNoTax = computeRequestRevenueBreakdownNoTax(r);
                    const isEv = isEventOrEventRoomsType(r);
                    const fmtNoTax = (n: number) => formatSar(Number(n) || 0, selectedCurrency);
                    const roomsEvSum = (Number(revNoTax.roomsRevenue) || 0) + (Number(revNoTax.eventRevenue) || 0);
                    rows.push({
                        'Request ID': r.id || '—',
                        Line: 'Single',
                        Client: client,
                        'Request Type': requestTypeLabel(r.requestType),
                        Date: date,
                        Status: status,
                        'Payment Status': pay.status,
                        Nights: roomBlock.reqNights || 0,
                        'Room Nights': roomBlock.roomNights || 0,
                        PAX: eventBlock.pax || 0,
                        DDR: eventBlock.ddr ? formatSar(eventBlock.ddr, selectedCurrency) : '—',
                        'AVG ADR': roomBlock.avgAdr ? formatSar(roomBlock.avgAdr, selectedCurrency) : '—',
                        'Paid Amount': formatSar(pay.paid, selectedCurrency),
                        'Unpaid Amount': formatSar(pay.unpaid, selectedCurrency),
                        'Event Revenue': isEv ? fmtNoTax(revNoTax.eventRevenue) : '—',
                        'Rooms Revenue': fmtNoTax(revNoTax.roomsRevenue),
                        'Rooms + Event': isEv ? fmtNoTax(roomsEvSum) : '—',
                        Amount: formatSar(total, selectedCurrency),
                    });
                }
            }

            const avgAdr = totalRoomNights > 0 ? weightedAdrSum / totalRoomNights : 0;
            const avgValue = requestCount > 0 ? totalAmount / requestCount : 0;
            const avgDdr = totalPax > 0 ? totalEventRevenue / totalPax : 0;

            const baseSummary: Record<string, string | number> = {
                [selectedEntity === 'MICE' ? 'Total MICE requests' : 'Total requests']: requestCount,
                'Total value': formatSar(totalAmount, selectedCurrency),
                'AVG Value': formatSar(avgValue, selectedCurrency),
                'Total PAX': totalPax.toLocaleString(),
                'AVG DDR': formatSar(avgDdr, selectedCurrency),
                'Total paid': formatSar(totalPaid, selectedCurrency),
                'Total unpaid': formatSar(totalUnpaid, selectedCurrency),
            };
            if (selectedEntity === 'MICE') {
                baseSummary['Event Revenue'] = formatSar(totalMiceEventRevNoTax, selectedCurrency);
                baseSummary['Rooms Revenue'] = formatSar(totalMiceRoomsRevNoTax, selectedCurrency);
                baseSummary['MICE total'] = formatSar(totalMiceEventRevNoTax + totalMiceRoomsRevNoTax, selectedCurrency);
            }
            if (selectedEntity === 'Requests') {
                baseSummary['AVG ADR'] = formatSar(avgAdr, selectedCurrency);
                baseSummary.Accommodation = typeCounter.accommodation || 0;
                baseSummary['Event only'] = typeCounter.event || 0;
                baseSummary['Event with rooms'] = typeCounter.event_rooms || 0;
                baseSummary['Series groups'] = typeCounter.series || 0;
            }
            return {
                rows,
                summary: baseSummary,
                exportColumns: selectedEntity === 'MICE'
                    ? [
                          'Request ID',
                          'Line',
                          'Client',
                          'Request Type',
                          'Agenda start',
                          'Agenda end',
                          'Agenda days',
                          'Status',
                          'Payment Status',
                          'PAX',
                          'DDR',
                          'Event Revenue',
                          'Paid Amount',
                          'Unpaid Amount',
                          'Amount',
                      ]
                    : [
                          'Request ID',
                          'Line',
                          'Client',
                          'Request Type',
                          'Date',
                          'Status',
                          'Payment Status',
                          'Nights',
                          'Room Nights',
                          'PAX',
                          'DDR',
                          'AVG ADR',
                          'Paid Amount',
                          'Unpaid Amount',
                          'Event Revenue',
                          'Rooms Revenue',
                          'Rooms + Event',
                          'Amount',
                      ],
                isVsLyMatrix: false,
                vsLyRows: null,
                vsLyMeta: null,
            };
        }

        if (selectedEntity === 'Accounts') {
            const rows = (accounts || []).map((acc: any) => {
                const reqs = filterRequestsForAccount(scopedRequests, acc.id, acc.name);
                const m = computeAccountMetrics(reqs);
                return {
                    ID: acc.id,
                    Name: acc.name,
                    Segment: acc.type || '—',
                    'Total Bookings': String(m.totalRequests),
                    'Total Revenue': formatCompactCurrency(m.totalSpend, selectedCurrency),
                };
            });
            return {
                rows,
                summary: {
                    'Total accounts': rows.length,
                    'Total bookings': rows.reduce((s, r) => s + (Number(r['Total Bookings']) || 0), 0).toLocaleString(),
                },
                exportColumns: availableColumns.Accounts,
                isVsLyMatrix: false,
                vsLyRows: null,
                vsLyMeta: null,
            };
        }

        const rows = scopedTasks
            .filter((t: any) => {
                const d = String(t.date || '').slice(0, 10);
                return inDateRangeYMD(d, start, end);
            })
            .map((t: any) => ({
                ID: String(t.id),
                Task: t.task || '—',
                Client: t.client || '—',
                'Due Date': t.date || '—',
                Priority: t.priority || '—',
                Assignee: t.assignedTo || '—',
            }));
        return {
            rows,
            summary: {
                'Total tasks': rows.length,
                'High priority': rows.filter((r) => String(r.Priority).toLowerCase() === 'high').length,
            },
            exportColumns: availableColumns.Tasks,
            isVsLyMatrix: false,
            vsLyRows: null,
            vsLyMeta: null,
        };
    }, [
        selectedEntity,
        scopedRequests,
        scopedTasks,
        scopedSalesCalls,
        accounts,
        activeProperty,
        propertyRequestSegments,
        propertyAccountTypes,
        filters.dateRange,
        filters.statuses,
        filters.valueRange,
        filters.vsReportYear,
        filters.vsLyByRequestSegment,
        filters.vsLyByAccountType,
        selectedCurrency,
    ]);

    const previewData = reportPack.rows;
    const reportPackAny = reportPack as any;
    const isVsMatrixPack = Boolean(reportPackAny.isVsLyMatrix);

    const vsLyRowsAll: VsLyMatrixRow[] = reportPackAny.vsLyRows || [];
    const vsLyColumnToggleItems = useMemo(() => {
        const seen = new Set<string>();
        const out: { key: string; label: string; isSectionHeader: boolean }[] = [];
        for (const row of vsLyRowsAll) {
            if (row.rowKind === 'sectionHeader') {
                if (seen.has(row.id)) continue;
                seen.add(row.id);
                out.push({ key: row.id, label: row.label, isSectionHeader: true });
                continue;
            }
            const k = row.segmentGroupKey ?? row.id;
            if (seen.has(k)) continue;
            seen.add(k);
            out.push({ key: k, label: row.label, isSectionHeader: false });
        }
        return out;
    }, [vsLyRowsAll]);
    const vsLyRowsFiltered = useMemo(() => {
        const all = (reportPackAny.vsLyRows || []) as VsLyMatrixRow[];
        return all.filter((r) => {
            const k = r.segmentGroupKey ?? r.id;
            return !vsLyRowHidden.has(k);
        });
    }, [reportPack, vsLyRowHidden]);

    const toggleVsLyRowInReport = (rowId: string) => {
        setVsLyRowHidden((prev) => {
            const n = new Set(prev);
            if (n.has(rowId)) n.delete(rowId);
            else n.add(rowId);
            return n;
        });
    };

    const showDateFilters = selectedEntity !== 'Accounts' && !isVsLySource;
    const showStatusFilters =
        (selectedEntity === 'Requests' || selectedEntity === 'MICE' || selectedEntity === 'Sales Calls') && !isVsLySource;
    const showValueFilters = (selectedEntity === 'Requests' || selectedEntity === 'MICE') && !isVsLySource;

    const pctClass = (pct: string) => {
        const p = String(pct || '').trim();
        if (!p || p === '-' || p === '0%') return { color: colors.textMuted };
        const n = parseFloat(p.replace(/%/g, ''));
        if (Number.isNaN(n)) return { color: colors.textMuted };
        if (n > 0) return { color: colors.green || '#22c55e' };
        if (n < 0) return { color: colors.red || '#ef4444' };
        return { color: colors.textMuted };
    };

    const handleExport = () => {
        if (!canReportsUseDataSource(currentUser, selectedEntity)) return;
        if (isVsMatrixPack && reportPackAny.vsLyRows?.length) {
            const vsRows = vsLyRowsFiltered;
            if (!vsRows.length) return;
            const stamp = new Date().toISOString().slice(0, 10);
            const y = reportPackAny.vsLyMeta?.year || 'year';
            const base = `${selectedEntity === 'Rooms vs LY' ? 'rooms' : 'mice'}-vs-ly-${y}-${stamp}`;
            const meta = reportPackAny.vsLyMeta;
            const propName = activeProperty?.name || 'All properties';
            if (exportFormat === 'csv') {
                const csv = exportVsLyMatrixCsv(vsRows, meta, propName);
                triggerDownload(csv, `${base}.csv`, 'text/csv;charset=utf-8;');
            } else if (exportFormat === 'excel') {
                const html = exportVsLyMatrixExcelHtml(vsRows, meta, propName);
                triggerDownload(html, `${base}.xls`, 'application/vnd.ms-excel');
            } else {
                const html = exportVsLyMatrixExcelHtml(vsRows, meta, propName);
                const w = window.open('', '_blank', 'width=1400,height=900');
                if (w) {
                    w.document.write(html);
                    w.document.close();
                    w.focus();
                    w.print();
                }
            }
            return;
        }
        if (!reportPack.rows.length) return;
        const stamp = new Date().toISOString().slice(0, 10);
        const base = `${String(selectedEntity).toLowerCase()}-report-${stamp}`;
        const cols = (selectedColumns && selectedColumns.length ? selectedColumns : reportPack.exportColumns)
            .filter((c) => reportPack.exportColumns.includes(c));
        const rows = reportPack.rows;

        if (exportFormat === 'csv') {
            const csv = [
                cols.map(csvEscape).join(','),
                ...rows.map((row) => cols.map((c) => csvEscape(row[c] ?? '—')).join(',')),
            ].join('\n');
            triggerDownload(csv, `${base}.csv`, 'text/csv;charset=utf-8;');
            return;
        }

        if (exportFormat === 'excel') {
            const tableHead = cols.map((c) => `<th style="padding:8px;border:1px solid #ddd;background:#f7f7f7;text-align:left;">${c}</th>`).join('');
            const tableRows = rows
                .map((row) => `<tr>${cols.map((c) => `<td style="padding:8px;border:1px solid #ddd;">${String(row[c] ?? '—')}</td>`).join('')}</tr>`)
                .join('');
            const summaryHtml = Object.entries(reportPack.summary)
                .map(([k, v]) => `<tr><td style="padding:6px 8px;border:1px solid #eee;">${k}</td><td style="padding:6px 8px;border:1px solid #eee;">${String(v)}</td></tr>`)
                .join('');
            const html = `
                <html><head><meta charset="utf-8" /></head><body>
                <h2>${selectedEntity} Report</h2>
                <table style="border-collapse:collapse;margin-bottom:16px;">${summaryHtml}</table>
                <table style="border-collapse:collapse;">
                  <thead><tr>${tableHead}</tr></thead>
                  <tbody>${tableRows}</tbody>
                </table>
                </body></html>
            `;
            triggerDownload(html, `${base}.xls`, 'application/vnd.ms-excel');
            return;
        }

        const w = window.open('', '_blank', 'width=1200,height=900');
        if (!w) return;
        const summaryCards = Object.entries(reportPack.summary)
            .map(([k, v]) => `<div style="padding:10px 12px;border:1px solid #ddd;border-radius:8px;"><div style="font-size:11px;color:#666;text-transform:uppercase;">${k}</div><div style="font-size:16px;font-weight:700;">${String(v)}</div></div>`)
            .join('');
        const head = cols.map((c) => `<th>${c}</th>`).join('');
        const body = rows
            .map((row) => `<tr>${cols.map((c) => `<td>${String(row[c] ?? '—')}</td>`).join('')}</tr>`)
            .join('');
        w.document.write(`
            <html>
              <head>
                <title>${selectedEntity} Report</title>
                <style>
                  body { font-family: Arial, sans-serif; padding: 24px; color: #111; }
                  h1 { margin: 0 0 8px; }
                  .meta { color: #555; margin-bottom: 16px; }
                  .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 16px; }
                  table { border-collapse: collapse; width: 100%; font-size: 12px; }
                  th, td { border: 1px solid #ddd; padding: 7px; text-align: left; vertical-align: top; }
                  th { background: #f5f5f5; font-size: 11px; text-transform: uppercase; }
                </style>
              </head>
              <body>
                <h1>${selectedEntity} Report</h1>
                <div class="meta">Property: ${activeProperty?.name || 'All properties'} | Generated: ${new Date().toLocaleString()}</div>
                <div class="grid">${summaryCards}</div>
                <table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
              </body>
            </html>
        `);
        w.document.close();
        w.focus();
        w.print();
    };

    if (currentView === 'saved') {
        return (
            <div className="h-full flex flex-col overflow-hidden">
                <div className="shrink-0 p-4 border-b" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                    <div className="flex justify-between items-center">
                        <div>
                            <h1 className="text-2xl font-bold" style={{ color: colors.textMain }}>Saved Reports</h1>
                            <p className="text-sm" style={{ color: colors.textMuted }}>View and manage your saved reports</p>
                        </div>
                        <button
                            onClick={() => setCurrentView('builder')}
                            className="px-4 py-2 rounded border hover:bg-white/5 transition-colors text-sm"
                            style={{ borderColor: colors.border, color: colors.textMain }}
                        >
                            <BarChart3 size={16} className="inline mr-2" />
                            New Report
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-auto p-4">
                    <div className="space-y-3">
                        {savedReports.map((report: any) => (
                            <div
                                key={report.id}
                                className="p-4 rounded-xl border hover:shadow-lg transition-all group"
                                style={{ backgroundColor: colors.card, borderColor: colors.border }}
                            >
                                <div className="flex justify-between items-start">
                                    <div className="flex-1">
                                        <h3 className="font-bold text-lg mb-1" style={{ color: colors.textMain }}>{report.name}</h3>
                                        <div className="flex items-center gap-4 text-sm mb-2" style={{ color: colors.textMuted }}>
                                            <span className="px-2 py-1 rounded text-xs" style={{ backgroundColor: colors.primary + '20', color: colors.primary }}>
                                                {report.entity}
                                            </span>
                                            <span>Created: {report.createdDate}</span>
                                            <span>Last run: {report.lastRun}</span>
                                        </div>
                                    </div>
                                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button type="button" className="p-2 rounded hover:bg-white/10 transition-colors" style={{ color: colors.textMuted }}><Eye size={16} /></button>
                                        <button type="button" className="p-2 rounded hover:bg-white/10 transition-colors" style={{ color: colors.blue }}><RefreshCw size={16} /></button>
                                        <button type="button" className="p-2 rounded hover:bg-white/10 transition-colors" style={{ color: colors.textMuted }}><Edit size={16} /></button>
                                        <button type="button" className="p-2 rounded hover:bg-red-500/10 transition-colors" style={{ color: colors.red }}><Trash2 size={16} /></button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    const anyDataSourceAllowed = entities.some((e) => canReportsUseDataSource(currentUser, e.id));

    return (
        <div className="h-full flex flex-col overflow-hidden">
            <div className="shrink-0 p-4 border-b" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                <div className="flex justify-between items-center">
                    <div>
                        <h1 className="text-2xl font-bold" style={{ color: colors.textMain }}>Report Builder</h1>
                        <p className="text-sm" style={{ color: colors.textMuted }}>
                            Professional reporting for Requests, Accounts, MICE, Tasks, and Sales Calls.
                            {activeProperty?.name ? (
                                <span className="block mt-1 text-xs font-bold" style={{ color: colors.primary }}>Scope: {activeProperty.name}</span>
                            ) : null}
                        </p>
                    </div>
                    <button
                        onClick={() => setCurrentView('saved')}
                        className="px-4 py-2 rounded border hover:bg-white/5 transition-colors text-sm"
                        style={{ borderColor: colors.border, color: colors.textMain }}
                    >
                        <FileText size={16} className="inline mr-2" />
                        Saved Reports
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-auto p-4">
                {!anyDataSourceAllowed ? (
                    <div
                        className="max-w-xl mx-auto mt-8 p-6 rounded-xl border text-center"
                        style={{ backgroundColor: colors.card, borderColor: colors.border }}
                    >
                        <p className="font-semibold" style={{ color: colors.textMain }}>No report data sources enabled</p>
                        <p className="text-sm mt-2" style={{ color: colors.textMuted }}>
                            Your account can open Reports but has no permission to use Requests, Accounts, MICE, Tasks, or Sales Calls.
                            Ask an administrator to assign the matching checkboxes under Reports in user permissions.
                        </p>
                    </div>
                ) : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 max-w-7xl mx-auto">
                    <div className="lg:col-span-1 space-y-4">
                        <div className="p-4 rounded-xl border" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                            <h3 className="text-sm font-bold uppercase tracking-wider mb-3" style={{ color: colors.textMuted }}>Data Source</h3>
                            <div className="space-y-2">
                                {entities.map((entity) => {
                                    const Icon = entity.icon;
                                    const allowed = canReportsUseDataSource(currentUser, entity.id);
                                    return (
                                        <button
                                            key={entity.id}
                                            type="button"
                                            disabled={!allowed}
                                            onClick={() => allowed && handleEntityChange(entity.id)}
                                            className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-all ${selectedEntity === entity.id ? 'border-2' : ''} disabled:opacity-40 disabled:cursor-not-allowed`}
                                            style={{
                                                borderColor: selectedEntity === entity.id ? colors.primary : colors.border,
                                                backgroundColor: selectedEntity === entity.id ? colors.primary + '10' : colors.bg,
                                            }}
                                        >
                                            <Icon size={20} style={{ color: selectedEntity === entity.id ? colors.primary : colors.textMuted }} />
                                            <span className="font-medium" style={{ color: colors.textMain }}>{entity.label}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="p-4 rounded-xl border" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                            <h3 className="text-sm font-bold uppercase tracking-wider mb-3" style={{ color: colors.textMuted }}>Filters</h3>

                            {isVsLySource && (
                                <div className="mb-4">
                                    <label className="block text-xs font-medium mb-2" style={{ color: colors.textMuted }}>Report year (CY)</label>
                                    <select
                                        value={Number(filters.vsReportYear) || new Date().getFullYear()}
                                        onChange={(e) =>
                                            setFilters({ ...filters, vsReportYear: Number(e.target.value) })
                                        }
                                        className="w-full px-3 py-2 rounded border bg-black/20 text-sm outline-none"
                                        style={{ borderColor: colors.border, color: colors.textMain }}
                                    >
                                        {yearOptionsForVs.map((y) => (
                                            <option key={y} value={y}>
                                                {y}
                                            </option>
                                        ))}
                                    </select>
                                    <div className="mt-3 space-y-2">
                                        <label className="flex items-center gap-2 cursor-pointer text-sm" style={{ color: colors.textMain }}>
                                            <input
                                                type="checkbox"
                                                checked={Boolean(filters.vsLyByAccountType)}
                                                onChange={(e) =>
                                                    setFilters({ ...filters, vsLyByAccountType: e.target.checked })
                                                }
                                                className="w-4 h-4 rounded"
                                                style={{ accentColor: colors.primary }}
                                            />
                                            By account type
                                        </label>
                                        <label className="flex items-center gap-2 cursor-pointer text-sm" style={{ color: colors.textMain }}>
                                            <input
                                                type="checkbox"
                                                checked={Boolean(filters.vsLyByRequestSegment)}
                                                onChange={(e) =>
                                                    setFilters({ ...filters, vsLyByRequestSegment: e.target.checked })
                                                }
                                                className="w-4 h-4 rounded"
                                                style={{ accentColor: colors.primary }}
                                            />
                                            By request segment
                                        </label>
                                    </div>
                                </div>
                            )}

                            {showDateFilters && (
                                <div className="mb-4">
                                    <label className="block text-xs font-medium mb-2" style={{ color: colors.textMuted }}>Date range</label>
                                    <div className="grid grid-cols-2 gap-2">
                                        <input
                                            type="date"
                                            value={filters.dateRange.start}
                                            onChange={(e) => setFilters({ ...filters, dateRange: { ...filters.dateRange, start: e.target.value } })}
                                            className="px-3 py-2 rounded border bg-black/20 text-sm outline-none"
                                            style={{ borderColor: colors.border, color: colors.textMain }}
                                        />
                                        <input
                                            type="date"
                                            value={filters.dateRange.end}
                                            onChange={(e) => setFilters({ ...filters, dateRange: { ...filters.dateRange, end: e.target.value } })}
                                            className="px-3 py-2 rounded border bg-black/20 text-sm outline-none"
                                            style={{ borderColor: colors.border, color: colors.textMain }}
                                        />
                                    </div>
                                </div>
                            )}

                            {showStatusFilters && (
                                <div className="mb-4">
                                    <label className="block text-xs font-medium mb-2" style={{ color: colors.textMuted }}>Status</label>
                                    <div className="flex flex-wrap gap-2">
                                        {statusOptions.map((status) => (
                                            <button
                                                key={status}
                                                type="button"
                                                onClick={() => toggleStatus(status)}
                                                className={`px-3 py-1 rounded-full text-xs border transition-all ${filters.statuses.includes(status) ? 'border-2' : ''}`}
                                                style={{
                                                    borderColor: filters.statuses.includes(status) ? colors.primary : colors.border,
                                                    backgroundColor: filters.statuses.includes(status) ? colors.primary + '20' : colors.bg,
                                                    color: filters.statuses.includes(status) ? colors.primary : colors.textMuted,
                                                }}
                                            >
                                                {status}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {showValueFilters && (
                                <div>
                                    <label className="block text-xs font-medium mb-2" style={{ color: colors.textMuted }}>{`Value range (${selectedCurrency})`}</label>
                                    <div className="grid grid-cols-2 gap-2">
                                        <input
                                            type="number"
                                            value={Math.round(convertSarToCurrency(Number(filters.valueRange.min) || 0, selectedCurrency))}
                                            onChange={(e) => setFilters({ ...filters, valueRange: { ...filters.valueRange, min: convertCurrencyToSar(Number(e.target.value), selectedCurrency) } })}
                                            className="px-3 py-2 rounded border bg-black/20 text-sm outline-none"
                                            style={{ borderColor: colors.border, color: colors.textMain }}
                                        />
                                        <input
                                            type="number"
                                            value={Math.round(convertSarToCurrency(Number(filters.valueRange.max) || 0, selectedCurrency))}
                                            onChange={(e) => setFilters({ ...filters, valueRange: { ...filters.valueRange, max: convertCurrencyToSar(Number(e.target.value), selectedCurrency) } })}
                                            className="px-3 py-2 rounded border bg-black/20 text-sm outline-none"
                                            style={{ borderColor: colors.border, color: colors.textMain }}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="p-4 rounded-xl border" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                            <h3 className="text-sm font-bold uppercase tracking-wider mb-3" style={{ color: colors.textMuted }}>Columns</h3>
                            {isVsLySource ? (
                                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                                    <p className="text-xs mb-2" style={{ color: colors.textMuted }}>
                                        Check which rows to include in the preview and in CSV, Excel, and PDF exports.
                                    </p>
                                    {vsLyColumnToggleItems.map((item) => (
                                        <label
                                            key={item.key}
                                            className="flex items-start gap-2 cursor-pointer rounded-md px-1 py-0.5 hover:bg-white/5"
                                        >
                                            <input
                                                type="checkbox"
                                                checked={!vsLyRowHidden.has(item.key)}
                                                onChange={() => toggleVsLyRowInReport(item.key)}
                                                className="w-4 h-4 rounded mt-0.5 shrink-0"
                                                style={{ accentColor: colors.primary }}
                                            />
                                            <span className="text-xs leading-snug break-words" style={{ color: colors.textMain }}>
                                                {item.isSectionHeader ? (
                                                    <span className="font-bold uppercase tracking-wide" style={{ color: colors.primary }}>
                                                        {item.label}
                                                    </span>
                                                ) : (
                                                    item.label
                                                )}
                                            </span>
                                        </label>
                                    ))}
                                </div>
                            ) : (
                            <div className="space-y-2">
                                {availableColumns[selectedEntity]?.map((column: string) => (
                                    <label key={column} className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={selectedColumns.includes(column)}
                                            onChange={() => toggleColumn(column)}
                                            className="w-4 h-4 rounded"
                                            style={{ accentColor: colors.primary }}
                                        />
                                        <span className="text-sm" style={{ color: colors.textMain }}>{column}</span>
                                    </label>
                                ))}
                            </div>
                            )}
                        </div>
                    </div>

                    <div className="lg:col-span-2 space-y-4">
                        <div className="p-4 rounded-xl border" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
                                <h3 className="text-sm font-bold uppercase tracking-wider" style={{ color: colors.textMuted }}>Data preview</h3>
                                {canPreviewRows && canUseSelectedSource ? (
                                    <button
                                        type="button"
                                        onClick={handleGeneratePreview}
                                        className="px-4 py-2 rounded flex items-center gap-2 hover:brightness-110 transition-all text-sm shrink-0"
                                        style={{ backgroundColor: colors.primary, color: '#000' }}
                                    >
                                        <RefreshCw size={16} /> Generate preview
                                    </button>
                                ) : (
                                    <p className="text-xs sm:text-right max-w-md" style={{ color: colors.textMuted }}>
                                        {canUseSelectedSource
                                            ? 'Row-by-row preview is off for your account. You can still configure filters and export.'
                                            : 'Select an allowed data source to continue.'}
                                    </p>
                                )}
                            </div>
                        </div>

                        {isVsMatrixPack && canUseSelectedSource && showPreview && vsLyRowsAll.length > 0 && (() => {
                            const vHead = vsLyRowsAll[0];
                            const dataColCount = 4 * (vHead?.months?.length || 12) + 4;
                            const itemAndDataColSpan = 1 + dataColCount;
                            return (
                            <div className="p-4 rounded-xl border space-y-4" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                                <h3 className="text-sm font-bold uppercase tracking-wider" style={{ color: colors.textMuted }}>Year vs last year (monthly)</h3>
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                                    {Object.entries(reportPack.summary).map(([label, value]) => (
                                        <div key={label} className="p-3 rounded-lg border bg-black/10" style={{ borderColor: colors.border }}>
                                            <p className="text-[10px] font-bold uppercase opacity-60" style={{ color: colors.textMuted }}>{label}</p>
                                            <p className="text-sm font-bold mt-1 break-words" style={{ color: colors.textMain }}>{String(value)}</p>
                                        </div>
                                    ))}
                                </div>
                                {vsLyRowsFiltered.length === 0 && (
                                    <p className="text-sm font-medium" style={{ color: colors.textMuted }}>
                                        All rows are hidden. Select at least one row in Columns to preview and export.
                                    </p>
                                )}
                                <div
                                    className="overflow-x-auto rounded-lg border"
                                    style={{ borderColor: colors.border, backgroundColor: colors.card }}
                                >
                                    <table className="w-full min-w-[1400px] text-xs" style={{ color: colors.textMain }}>
                                        <thead>
                                            <tr style={{ backgroundColor: colors.bg }}>
                                                <th
                                                    rowSpan={2}
                                                    className="text-left p-2 sticky left-0 z-20 min-w-[11rem] border-r align-bottom"
                                                    style={{ color: colors.textMuted, backgroundColor: colors.card, borderColor: colors.border }}
                                                >
                                                    Item
                                                </th>
                                                {vHead.months.map((mo: { month: number; monthLabel: string }) => (
                                                    <th
                                                        key={mo.month}
                                                        colSpan={4}
                                                        className="text-center p-2 border-b font-bold"
                                                        style={{
                                                            color: colors.primary,
                                                            borderColor: colors.border,
                                                            backgroundColor: colors.bg,
                                                        }}
                                                    >
                                                        {mo.monthLabel} (CY {reportPackAny.vsLyMeta?.year} / LY {reportPackAny.vsLyMeta?.yearLy})
                                                    </th>
                                                ))}
                                                <th
                                                    colSpan={4}
                                                    className="text-center p-2 font-bold"
                                                    style={{
                                                        color: colors.primary,
                                                        borderColor: colors.border,
                                                        backgroundColor: colors.bg,
                                                    }}
                                                >
                                                    YTD (full year)
                                                </th>
                                            </tr>
                                            <tr style={{ backgroundColor: colors.bg }}>
                                                {vHead.months.map((mo: { month: number }) => (
                                                    <React.Fragment key={mo.month}>
                                                        <th
                                                            className="p-1.5 text-[10px] font-semibold"
                                                            style={{ color: colors.textMain, backgroundColor: colors.card, borderColor: colors.border }}
                                                        >
                                                            CY
                                                        </th>
                                                        <th
                                                            className="p-1.5 text-[10px] font-semibold"
                                                            style={{ color: colors.textMain, backgroundColor: colors.card, borderColor: colors.border }}
                                                        >
                                                            LY
                                                        </th>
                                                        <th
                                                            className="p-1.5 text-[10px] font-semibold"
                                                            style={{ color: colors.textMain, backgroundColor: colors.card, borderColor: colors.border }}
                                                        >
                                                            %
                                                        </th>
                                                        <th
                                                            className="p-1.5 text-[10px] font-semibold"
                                                            style={{ color: colors.textMain, backgroundColor: colors.card, borderColor: colors.border }}
                                                        >
                                                            OTB
                                                        </th>
                                                    </React.Fragment>
                                                ))}
                                                {['CY', 'LY', '%', 'OTB'].map((h) => (
                                                    <th
                                                        key={h}
                                                        className="p-1.5 text-[10px] font-bold"
                                                        style={{ color: colors.primary, borderColor: colors.border, backgroundColor: colors.card }}
                                                    >
                                                        YTD {h}
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {vsLyRowsFiltered.length === 0 ? null : vsLyRowsFiltered.map((r) => {
                                                if (r.rowKind === 'sectionHeader') {
                                                    return (
                                                        <tr key={r.id} style={{ backgroundColor: colors.bg }}>
                                                            <td
                                                                colSpan={itemAndDataColSpan}
                                                                className="p-2 text-xs font-bold uppercase tracking-wide border-t border-r"
                                                                style={{ color: colors.textMain, borderColor: colors.border }}
                                                            >
                                                                {r.label}
                                                            </td>
                                                        </tr>
                                                    );
                                                }
                                                const isTotal = r.rowKind === 'totalRevenue';
                                                const rowBg = isTotal ? colors.primary + '22' : colors.card;
                                                const labelBg = isTotal ? colors.primary + '2e' : colors.card;
                                                const ytdBg = colors.bg;
                                                return (
                                                <tr
                                                    key={r.id}
                                                    style={{
                                                        borderTop: `1px solid ${colors.border}`,
                                                        backgroundColor: rowBg,
                                                    }}
                                                >
                                                    <td
                                                        className="p-2 font-medium text-xs align-top sticky left-0 z-10 border-r max-w-[16rem]"
                                                        style={{ color: colors.textMain, backgroundColor: labelBg, borderColor: colors.border }}
                                                    >
                                                        {r.label}
                                                    </td>
                                                    {r.months.map((mo) => (
                                                        <React.Fragment key={`${r.id}-m${mo.month}`}>
                                                            <td className="p-1.5 font-mono align-top whitespace-pre-wrap" style={{ color: colors.textMain, maxWidth: '8rem' }}>{mo.cy}</td>
                                                            <td className="p-1.5 font-mono align-top whitespace-pre-wrap" style={{ color: colors.textMain, maxWidth: '8rem' }}>{mo.ly}</td>
                                                            <td className="p-1.5 font-mono align-top font-bold" style={pctClass(mo.pct)}>{mo.pct}</td>
                                                            <td className="p-1.5 font-mono align-top whitespace-pre-wrap" style={{ color: colors.textMain, maxWidth: '8rem' }}>{mo.otb}</td>
                                                        </React.Fragment>
                                                    ))}
                                                    <td className="p-1.5 font-mono align-top" style={{ color: colors.textMain, backgroundColor: ytdBg }}>{r.ytd.cy}</td>
                                                    <td className="p-1.5 font-mono align-top" style={{ color: colors.textMain, backgroundColor: ytdBg }}>{r.ytd.ly}</td>
                                                    <td className="p-1.5 font-mono font-bold" style={{ ...pctClass(r.ytd.pct), backgroundColor: ytdBg }}>{r.ytd.pct}</td>
                                                    <td className="p-1.5 font-mono align-top" style={{ color: colors.textMain, backgroundColor: ytdBg }}>{r.ytd.otb}</td>
                                                </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                            );
                        })()}

                        {showPreview && canPreviewRows && canUseSelectedSource && !isVsMatrixPack && (
                            <div className="p-4 rounded-xl border space-y-4" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                    {Object.entries(reportPack.summary).map(([label, value]) => (
                                        <div key={label} className="p-3 rounded-lg border bg-black/10" style={{ borderColor: colors.border }}>
                                            <p className="text-[10px] font-bold uppercase opacity-60" style={{ color: colors.textMuted }}>{label}</p>
                                            <p className="text-sm font-bold mt-1" style={{ color: colors.textMain }}>{String(value)}</p>
                                        </div>
                                    ))}
                                </div>
                                <p className="text-sm" style={{ color: colors.textMuted }}>Showing {previewData.length} rows</p>
                                <div className="overflow-x-auto rounded-lg border" style={{ borderColor: colors.border }}>
                                    <table className="w-full">
                                        <thead>
                                            <tr style={{ backgroundColor: colors.bg }}>
                                                {selectedColumns.map((col) => (
                                                    <th key={col} className="text-left p-3 text-xs font-bold uppercase tracking-wider" style={{ color: colors.textMuted }}>
                                                        {col}
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {previewData.map((row: any, idx: number) => (
                                                <tr key={`${row['Request ID'] || row.ID || 'row'}-${idx}`} className="hover:bg-white/5 transition-colors" style={{ borderTop: `1px solid ${colors.border}` }}>
                                                    {selectedColumns.map((col) => (
                                                        <td key={col} className="p-3 text-sm" style={{ color: colors.textMain }}>
                                                            {row[col] != null && row[col] !== '' ? String(row[col]) : '—'}
                                                        </td>
                                                    ))}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        <div className="p-4 rounded-xl border" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                            <h3 className="text-sm font-bold uppercase tracking-wider mb-4" style={{ color: colors.textMuted }}>Export options</h3>

                            <div className="grid grid-cols-3 gap-3 mb-4">
                                {[
                                    { id: 'pdf', label: 'PDF', icon: FileText, color: colors.red },
                                    { id: 'excel', label: 'Excel', icon: FileSpreadsheet, color: colors.green },
                                    { id: 'csv', label: 'CSV', icon: FileDown, color: colors.blue },
                                ].map((format) => {
                                    const Icon = format.icon;
                                    return (
                                        <button
                                            key={format.id}
                                            type="button"
                                            onClick={() => setExportFormat(format.id as 'pdf' | 'excel' | 'csv')}
                                            className={`p-4 rounded-lg border transition-all ${exportFormat === format.id ? 'border-2' : ''}`}
                                            style={{
                                                borderColor: exportFormat === format.id ? colors.primary : colors.border,
                                                backgroundColor: exportFormat === format.id ? colors.primary + '10' : colors.bg,
                                            }}
                                        >
                                            <Icon size={24} className="mx-auto mb-2" style={{ color: format.color }} />
                                            <p className="text-sm font-medium" style={{ color: colors.textMain }}>{format.label}</p>
                                        </button>
                                    );
                                })}
                            </div>

                            <button
                                type="button"
                                disabled={
                                    !canUseSelectedSource ||
                                    (!isVsMatrixPack && !reportPack.rows.length) ||
                                    (isVsMatrixPack && (!vsLyRowsAll.length || !vsLyRowsFiltered.length))
                                }
                                onClick={handleExport}
                                className="w-full py-3 rounded flex items-center justify-center gap-2 hover:brightness-110 transition-all disabled:opacity-50"
                                style={{ backgroundColor: colors.green, color: '#000' }}
                            >
                                <Download size={18} />
                                {isVsMatrixPack
                                    ? `Export (${exportFormat === 'pdf' ? 'print / PDF' : exportFormat === 'excel' ? 'Excel' : 'CSV'})`
                                    : `Export as ${exportFormat.toUpperCase()}`}
                            </button>
                        </div>
                    </div>
                </div>
                )}
            </div>
        </div>
    );
}
