import React, { useMemo, useState } from 'react';
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
} from 'lucide-react';
import { filterRequestsForAccount, computeAccountMetrics } from './accountProfileData';
import { formatCompactCurrency } from './formatCompactCurrency';
import { convertCurrencyToSar, convertSarToCurrency, formatCurrencyAmount, resolveCurrencyCode, type CurrencyCode } from './currency';

interface ReportsProps {
    theme: any;
    activeProperty?: any;
    sharedRequests?: any[];
    accounts?: any[];
    tasks?: any[];
    currency?: CurrencyCode;
}

const initialSavedReports: any[] = [];

type ReportEntity = 'Requests' | 'Accounts' | 'MICE' | 'Tasks';

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

function calculateNights(inDate: string, outDate: string) {
    if (!inDate || !outDate) return 0;
    const diff = new Date(outDate).getTime() - new Date(inDate).getTime();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
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
    tasks = [],
    currency = 'SAR',
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
    });
    const [selectedColumns, setSelectedColumns] = useState<string[]>([
        'Request ID', 'Line', 'Client', 'Request Type', 'Date', 'Status', 'Payment Status', 'Paid Amount', 'Unpaid Amount', 'Amount',
    ]);
    const [exportFormat, setExportFormat] = useState<'pdf' | 'excel' | 'csv'>('pdf');
    const [showPreview, setShowPreview] = useState(false);
    const [savedReports] = useState(initialSavedReports);

    const pid = activeProperty?.id;

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

    const entities = [
        { id: 'Requests' as ReportEntity, icon: BedDouble, label: 'Requests' },
        { id: 'Accounts' as ReportEntity, icon: Briefcase, label: 'Accounts' },
        { id: 'MICE' as ReportEntity, icon: Wine, label: 'MICE' },
        { id: 'Tasks' as ReportEntity, icon: Users, label: 'Tasks' },
    ];

    const availableColumns: Record<ReportEntity, string[]> = {
        Requests: ['Request ID', 'Line', 'Client', 'Request Type', 'Date', 'Status', 'Payment Status', 'Nights', 'Room Nights', 'PAX', 'DDR', 'AVG ADR', 'Paid Amount', 'Unpaid Amount', 'Amount'],
        Accounts: ['ID', 'Name', 'Segment', 'Total Bookings', 'Total Revenue'],
        MICE: ['Request ID', 'Line', 'Client', 'Request Type', 'Date', 'Status', 'Payment Status', 'PAX', 'DDR', 'Event Revenue', 'Paid Amount', 'Unpaid Amount', 'Amount'],
        Tasks: ['ID', 'Task', 'Client', 'Due Date', 'Priority', 'Assignee'],
    };

    const statusOptions = ['Inquiry', 'Accepted', 'Tentative', 'Definite', 'Actual', 'Cancelled'];

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
        const { start, end } = filters.dateRange || {};
        const st = filters.statuses || [];
        const vmin = Number(filters.valueRange?.min) || 0;
        const vmax = Number(filters.valueRange?.max) || Number.MAX_SAFE_INTEGER;

        const passRequestFilters = (r: any, miceOnly: boolean) => {
            const k = normalizeRequestTypeKey(r.requestType);
            const agenda = Array.isArray(r?.agenda) ? r.agenda : [];
            if (miceOnly && agenda.length === 0) return false;
            if (!matchesStatusFilter(st, r.status)) return false;
            const amt = requestTotalValue(r);
            if (amt < vmin || amt > vmax) return false;
            if (!inDateRangeYMD(requestPrimaryDate(r), start, end)) return false;
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
                return sum + (Number(row?.rate || 0) * Number(row?.pax || 0)) + Number(row?.rental || 0);
            }, 0);
            const ddr = pax > 0 ? eventRevenue / pax : 0;
            return { pax, eventRevenue, ddr };
        };

        const paymentBlock = (r: any) => {
            const total = requestTotalValue(r);
            const paid = Array.isArray(r?.payments) && r.payments.length
                ? r.payments.reduce((sum: number, p: any) => sum + (Number(p?.amount || 0) || 0), 0)
                : parseFloat(String(r?.paidAmount ?? 0).replace(/,/g, '')) || 0;
            const unpaid = Math.max(0, total - paid);
            const status = String(r?.paymentStatus || '').trim()
                || (paid >= total && total > 0 ? 'Paid' : paid > 0 ? 'Deposit' : 'Unpaid');
            return { paid, unpaid, status };
        };

        const requestsFiltered = scopedRequests.filter((r) => passRequestFilters(r, false));
        const miceFiltered = scopedRequests.filter((r) => passRequestFilters(r, true));

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

                const date = requestPrimaryDate(r) || '—';
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
                    'Event Revenue': eventBlock.eventRevenue ? formatSar(eventBlock.eventRevenue, selectedCurrency) : '—',
                    'Paid Amount': formatSar(pay.paid, selectedCurrency),
                    'Unpaid Amount': formatSar(pay.unpaid, selectedCurrency),
                    Amount: formatSar(total, selectedCurrency),
                });
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
                    ? ['Request ID', 'Line', 'Client', 'Request Type', 'Date', 'Status', 'Payment Status', 'PAX', 'DDR', 'Event Revenue', 'Paid Amount', 'Unpaid Amount', 'Amount']
                    : ['Request ID', 'Line', 'Client', 'Request Type', 'Date', 'Status', 'Payment Status', 'Nights', 'Room Nights', 'PAX', 'DDR', 'AVG ADR', 'Paid Amount', 'Unpaid Amount', 'Amount'],
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
        };
    }, [selectedEntity, scopedRequests, scopedTasks, accounts, filters.dateRange, filters.statuses, filters.valueRange, selectedCurrency]);

    const previewData = reportPack.rows;

    const showDateFilters = selectedEntity !== 'Accounts';
    const showStatusFilters = selectedEntity === 'Requests' || selectedEntity === 'MICE';
    const showValueFilters = selectedEntity === 'Requests' || selectedEntity === 'MICE';

    const handleExport = () => {
        if (!showPreview || !reportPack.rows.length) return;
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

    return (
        <div className="h-full flex flex-col overflow-hidden">
            <div className="shrink-0 p-4 border-b" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                <div className="flex justify-between items-center">
                    <div>
                        <h1 className="text-2xl font-bold" style={{ color: colors.textMain }}>Report Builder</h1>
                        <p className="text-sm" style={{ color: colors.textMuted }}>
                            Professional reporting for Requests, Accounts, MICE, and Tasks.
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
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 max-w-7xl mx-auto">
                    <div className="lg:col-span-1 space-y-4">
                        <div className="p-4 rounded-xl border" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                            <h3 className="text-sm font-bold uppercase tracking-wider mb-3" style={{ color: colors.textMuted }}>Data Source</h3>
                            <div className="space-y-2">
                                {entities.map((entity) => {
                                    const Icon = entity.icon;
                                    return (
                                        <button
                                            key={entity.id}
                                            type="button"
                                            onClick={() => handleEntityChange(entity.id)}
                                            className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-all ${selectedEntity === entity.id ? 'border-2' : ''}`}
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
                        </div>
                    </div>

                    <div className="lg:col-span-2 space-y-4">
                        <div className="p-4 rounded-xl border" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                            <div className="flex justify-between items-center">
                                <h3 className="text-sm font-bold uppercase tracking-wider" style={{ color: colors.textMuted }}>Data preview</h3>
                                <button
                                    type="button"
                                    onClick={handleGeneratePreview}
                                    className="px-4 py-2 rounded flex items-center gap-2 hover:brightness-110 transition-all text-sm"
                                    style={{ backgroundColor: colors.primary, color: '#000' }}
                                >
                                    <RefreshCw size={16} /> Generate preview
                                </button>
                            </div>
                        </div>

                        {showPreview && (
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
                                disabled={!showPreview}
                                onClick={handleExport}
                                className="w-full py-3 rounded flex items-center justify-center gap-2 hover:brightness-110 transition-all disabled:opacity-50"
                                style={{ backgroundColor: colors.green, color: '#000' }}
                            >
                                <Download size={18} />
                                Export as {exportFormat.toUpperCase()}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
