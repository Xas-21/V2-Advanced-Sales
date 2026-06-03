import {
    CRM_QUARTER_MONTH_BLOCKS,
    type CrmSalesPeriod,
    getCallDueDate,
    isActivityCompleted,
    parseYmdToLocalDate,
} from './crmActivitiesUtils';
import { resolveCrmCallCreatorName } from './userProfileMetrics';

export type SalesCallLogEntry = {
    id: string;
    at: string;
    description: string;
    clientFeedback?: string;
    nextStep?: string;
    loggedByUserId?: string;
    loggedByName?: string;
};

export type CallReportRow = {
    id: string;
    leadId: string;
    at: string;
    atLabel: string;
    monthLabel: string;
    subject: string;
    account: string;
    contactPerson: string;
    callDescription: string;
    clientFeedback: string;
    nextStep: string;
    assignedUser: string;
    completed: boolean;
    statusLabel: string;
    sortKey: string;
};

export type CallReportStatusFilter = 'all' | 'completed' | 'not_completed';
export type CallReportSort = 'newest' | 'oldest';

const MONTH_NAMES = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
];

function parseYearMonth(ymd: string): { year: number; month: number } {
    const s = String(ymd || '').trim().slice(0, 10);
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return { year: 0, month: 0 };
    return { year: Number(m[1]) || 0, month: Number(m[2]) || 0 };
}

export function formatMonthLabelFromYmd(ymd: string): string {
    const { year, month } = parseYearMonth(ymd);
    if (!year || !month || month < 1 || month > 12) return '—';
    return `${MONTH_NAMES[month - 1]} ${year}`;
}

export function formatCallReportDateLabel(ymd: string): string {
    const dt = parseYmdToLocalDate(ymd);
    if (!dt) return ymd || '—';
    return dt.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/** Period filter on row anchor date (includes future dates in range; never caps at today). */
export function dateMatchesCrmSalesPeriod(
    ymd: string,
    period: CrmSalesPeriod,
    quarterBuckets: Record<string, number[]> = CRM_QUARTER_MONTH_BLOCKS
): boolean {
    const { year: y, month: mo } = parseYearMonth(ymd);
    if (!y || !mo) return false;
    if (period.mode === 'month') {
        return y === period.year && mo === period.month;
    }
    if (period.mode === 'year') {
        return y === period.year;
    }
    if (period.mode === 'quarter' && period.quarter) {
        const months = quarterBuckets[period.quarter];
        return Boolean(months?.length) && y === period.year && months.includes(mo);
    }
    return false;
}

export function crmSalesPeriodLabel(period: CrmSalesPeriod): string {
    if (period.mode === 'month') {
        const m = MONTH_NAMES[Math.max(0, Math.min(11, period.month - 1))]?.slice(0, 3) || '';
        return `${m} ${period.year}`;
    }
    if (period.mode === 'quarter' && period.quarter) {
        return `${period.quarter} ${period.year}`;
    }
    return String(period.year);
}

function scheduledRowDate(lead: any): string {
    const due = getCallDueDate(lead);
    if (due) return due.slice(0, 10);
    const entered = String(lead?.enteredFunnelAt || lead?.date || '').trim().slice(0, 10);
    return entered || '';
}

export function parseLegacyCallLogsFromDescription(lead: any): SalesCallLogEntry[] {
    const desc = String(lead?.description || '').trim();
    if (!desc) return [];
    const lines = desc.split('\n').filter(Boolean);
    const out: SalesCallLogEntry[] = [];
    let parsedAny = false;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const m = line.match(/^\[(\d{4}-\d{2}-\d{2})\]\s*(.*)$/);
        if (m) {
            parsedAny = true;
            out.push({
                id: `${lead.id}-legacy-${i}`,
                at: m[1],
                description: m[2] || '',
                nextStep: '',
            });
        }
    }
    if (!parsedAny) {
        const at =
            String(lead?.callLoggedAt || '').slice(0, 10) ||
            scheduledRowDate(lead) ||
            new Date().toISOString().slice(0, 10);
        out.push({
            id: `${lead.id}-legacy-desc`,
            at,
            description: desc,
            nextStep: String(lead?.nextStep || '').trim(),
        });
    } else if (out.length && String(lead?.nextStep || '').trim()) {
        const latest = out.reduce((best, cur) => (cur.at >= best.at ? cur : best));
        latest.nextStep = String(lead.nextStep).trim();
    }
    return out;
}

export function getCallLogEntriesForLead(lead: any): SalesCallLogEntry[] {
    const raw = Array.isArray(lead?.callLogs) ? lead.callLogs : [];
    if (raw.length) {
        return raw
            .map((e: any, i: number) => ({
                id: String(e?.id || `${lead.id}-log-${i}`),
                at: String(e?.at || '').slice(0, 10),
                description: String(e?.description || '').trim(),
                clientFeedback: String(e?.clientFeedback || '').trim(),
                nextStep: String(e?.nextStep || '').trim(),
                loggedByUserId: String(e?.loggedByUserId || '').trim() || undefined,
                loggedByName: String(e?.loggedByName || '').trim() || undefined,
            }))
            .filter((e) => e.at);
    }
    return parseLegacyCallLogsFromDescription(lead);
}

function buildRowFromParts(
    lead: any,
    parts: {
        id: string;
        at: string;
        description: string;
        clientFeedback: string;
        nextStep: string;
        loggedByName?: string;
    },
    userDirectory?: { id: string; name: string }[]
): CallReportRow | null {
    const at = String(parts.at || '').slice(0, 10);
    if (!at) return null;
    const completed = isActivityCompleted(lead);
    const assigned =
        parts.loggedByName ||
        resolveCrmCallCreatorName(lead, userDirectory);
    return {
        id: parts.id,
        leadId: String(lead.id || ''),
        at,
        atLabel: formatCallReportDateLabel(at),
        monthLabel: formatMonthLabelFromYmd(at),
        subject: String(lead?.subject || 'Sales call'),
        account: String(lead?.company || '—'),
        contactPerson: String(lead?.contact || '—'),
        callDescription: parts.description,
        clientFeedback: parts.clientFeedback,
        nextStep: parts.nextStep,
        assignedUser: assigned,
        completed,
        statusLabel: completed ? 'Completed' : 'Not completed',
        sortKey: `${at}T${parts.id}`,
    };
}

export function buildCallReportRows(
    salesCalls: any[],
    options: {
        crmSalesPeriod: CrmSalesPeriod;
        activePropertyId?: string;
        createdByUserFilterId?: string;
        crmFilterUsers?: { id: string; name: string }[];
        statusFilter?: CallReportStatusFilter;
        sort?: CallReportSort;
        crmLeadAttributedToUser?: (lead: any, user: { id: string; name: string }) => boolean;
    }
): CallReportRow[] {
    const {
        crmSalesPeriod,
        activePropertyId,
        createdByUserFilterId,
        crmFilterUsers = [],
        statusFilter = 'all',
        sort = 'newest',
        crmLeadAttributedToUser,
    } = options;

    const pid = String(activePropertyId || '').trim();
    let leads = Array.isArray(salesCalls) ? salesCalls : [];

    if (pid) {
        leads = leads.filter((l: any) => {
            const p = String(l?.propertyId || '').trim();
            return !p || p === pid || p === 'P-GLOBAL';
        });
    }

    const fid = String(createdByUserFilterId || '').trim();
    if (fid) {
        const userRow = crmFilterUsers.find((u) => String(u.id) === fid);
        if (userRow && crmLeadAttributedToUser) {
            leads = leads.filter((l: any) => crmLeadAttributedToUser(l, userRow));
        }
    }

    const rows: CallReportRow[] = [];

    for (const lead of leads) {
        const logs = getCallLogEntriesForLead(lead);
        if (logs.length) {
            for (const log of logs) {
                const row = buildRowFromParts(
                    lead,
                    {
                        id: log.id,
                        at: log.at,
                        description: log.description,
                        clientFeedback: log.clientFeedback || '',
                        nextStep: log.nextStep || '',
                        loggedByName: log.loggedByName,
                    },
                    crmFilterUsers
                );
                if (row && dateMatchesCrmSalesPeriod(row.at, crmSalesPeriod)) {
                    rows.push(row);
                }
            }
        } else {
            const at = scheduledRowDate(lead);
            const row = buildRowFromParts(
                lead,
                {
                    id: `${lead.id}-scheduled`,
                    at,
                    description: String(lead?.description || '').trim(),
                    clientFeedback: '',
                    nextStep: String(lead?.nextStep || '').trim(),
                },
                crmFilterUsers
            );
            if (row && dateMatchesCrmSalesPeriod(row.at, crmSalesPeriod)) {
                rows.push(row);
            }
        }
    }

    let filtered = rows;
    if (statusFilter === 'completed') {
        filtered = filtered.filter((r) => r.completed);
    } else if (statusFilter === 'not_completed') {
        filtered = filtered.filter((r) => !r.completed);
    }

    filtered.sort((a, b) => {
        const cmp = a.at.localeCompare(b.at);
        if (sort === 'oldest') {
            if (cmp !== 0) return cmp;
            return a.id.localeCompare(b.id);
        }
        if (cmp !== 0) return -cmp;
        return b.id.localeCompare(a.id);
    });

    return filtered;
}

export type CallReportChartBucket = {
    key: string;
    label: string;
    count: number;
    year: number;
    month: number;
};

export function buildCallReportChartBuckets(
    rows: CallReportRow[],
    period: CrmSalesPeriod
): CallReportChartBucket[] {
    const countByKey = new Map<string, number>();

    for (const row of rows) {
        const { year, month } = parseYearMonth(row.at);
        if (!year || !month) continue;
        const key = `${year}-${String(month).padStart(2, '0')}`;
        countByKey.set(key, (countByKey.get(key) || 0) + 1);
    }

    const buckets: CallReportChartBucket[] = [];

    if (period.mode === 'month') {
        const key = `${period.year}-${String(period.month).padStart(2, '0')}`;
        buckets.push({
            key,
            label: `${MONTH_NAMES[period.month - 1]} ${period.year}`,
            count: countByKey.get(key) || 0,
            year: period.year,
            month: period.month,
        });
        return buckets;
    }

    let months: number[] = [];
    if (period.mode === 'year') {
        months = Array.from({ length: 12 }, (_, i) => i + 1);
    } else if (period.mode === 'quarter' && period.quarter) {
        months = CRM_QUARTER_MONTH_BLOCKS[period.quarter] || [];
    }

    for (const mo of months) {
        const key = `${period.year}-${String(mo).padStart(2, '0')}`;
        buckets.push({
            key,
            label: `${MONTH_NAMES[mo - 1]} ${period.year}`,
            count: countByKey.get(key) || 0,
            year: period.year,
            month: mo,
        });
    }

    return buckets;
}

function csvEscape(value: string): string {
    const s = String(value ?? '');
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
}

const EXPORT_HEADERS = [
    'Month',
    'Date of the Call',
    'Subject',
    'Account',
    'Contact person',
    'Call Description',
    'Client Concern & Feedback',
    'Next Step',
    'Assigned User',
    'Status',
];

export function exportCallReportCsv(rows: CallReportRow[]): string {
    const lines = [
        EXPORT_HEADERS.map(csvEscape).join(','),
        ...rows.map((r) =>
            [
                r.monthLabel,
                r.atLabel,
                r.subject,
                r.account,
                r.contactPerson,
                r.callDescription,
                r.clientFeedback,
                r.nextStep,
                r.assignedUser,
                r.statusLabel,
            ]
                .map(csvEscape)
                .join(',')
        ),
    ];
    return `\uFEFF${lines.join('\r\n')}`;
}

export function exportCallReportExcelHtml(rows: CallReportRow[], title: string): string {
    const headerCells = EXPORT_HEADERS.map((h) => `<th>${h.replace(/</g, '&lt;')}</th>`).join('');
    const bodyRows = rows
        .map(
            (r) =>
                `<tr>${[
                    r.monthLabel,
                    r.atLabel,
                    r.subject,
                    r.account,
                    r.contactPerson,
                    r.callDescription,
                    r.clientFeedback,
                    r.nextStep,
                    r.assignedUser,
                    r.statusLabel,
                ]
                    .map((c) => `<td>${String(c).replace(/</g, '&lt;').replace(/\n/g, '<br/>')}</td>`)
                    .join('')}</tr>`
        )
        .join('');
    return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${title.replace(/</g, '&lt;')}</title></head><body><h3>${title.replace(/</g, '&lt;')}</h3><table border="1"><thead><tr>${headerCells}</tr></thead><tbody>${bodyRows}</tbody></table></body></html>`;
}

export function buildCallReportExportFilename(period: CrmSalesPeriod, format: 'csv' | 'xls'): string {
    const ext = format === 'csv' ? 'csv' : 'xls';
    if (period.mode === 'month') {
        return `crm_call_report_${period.year}-${String(period.month).padStart(2, '0')}.${ext}`;
    }
    if (period.mode === 'quarter' && period.quarter) {
        return `crm_call_report_${period.quarter}_${period.year}.${ext}`;
    }
    return `crm_call_report_${period.year}.${ext}`;
}

export function downloadCallReportFile(content: BlobPart, fileName: string, mimeType: string): void {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}
