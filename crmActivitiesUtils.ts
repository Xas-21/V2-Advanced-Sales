import { flattenCrmLeads } from './accountProfileData';

export type CrmSalesPeriod = {
    mode: 'month' | 'year' | 'quarter';
    year: number;
    month: number;
    quarter: 'Q1' | 'Q2' | 'Q3' | 'Q4' | null;
};

export const CRM_QUARTER_MONTH_BLOCKS: Record<'Q1' | 'Q2' | 'Q3' | 'Q4', number[]> = {
    Q1: [1, 2, 3],
    Q2: [4, 5, 6],
    Q3: [7, 8, 9],
    Q4: [10, 11, 12],
};

/** Due date for Activities list: follow-up date, else explicit due date, else scheduled call date. */
export function getCallDueDate(lead: any): string {
    const fu = String(lead?.followUpDate ?? '').trim();
    if (fu) return fu;
    const due = String(lead?.dueDate ?? '').trim();
    if (due) return due;
    const d = String(lead?.date ?? '').trim();
    if (d) return d;
    return String(lead?.lastContact ?? '').trim();
}

export function parseYmdToLocalDate(ymd: string): Date | null {
    const s = String(ymd || '').trim();
    if (!s) return null;
    const ymdLike = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
    if (ymdLike) {
        const y = Number(ymdLike[1]);
        const m = Number(ymdLike[2]) - 1;
        const d = Number(ymdLike[3]);
        const dt = new Date(y, m, d);
        return Number.isNaN(dt.getTime()) ? null : dt;
    }
    const dt = new Date(s);
    return Number.isNaN(dt.getTime()) ? null : dt;
}

export function toLocalYmd(d: Date = new Date()): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

export function isCallDueToday(lead: any, todayYmd: string = toLocalYmd()): boolean {
    const due = getCallDueDate(lead);
    if (!due) return false;
    const dt = parseYmdToLocalDate(due);
    if (!dt) return false;
    return toLocalYmd(dt) === todayYmd;
}

export function formatCallDueDate(leadOrDate: any): string {
    const due =
        typeof leadOrDate === 'string'
            ? String(leadOrDate || '').trim()
            : getCallDueDate(leadOrDate);
    if (!due) return '—';
    const dt = parseYmdToLocalDate(due);
    if (!dt) return due;
    return dt.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function isActivityCompleted(lead: any): boolean {
    const v = lead?.activityCompleted;
    return v === true || v === 1 || String(v).toLowerCase() === 'true';
}

export function appendCallDescription(existing: string | undefined, note: string, at: Date = new Date()): string {
    const stamp = at.toISOString().slice(0, 10);
    const line = `[${stamp}] ${note.trim()}`;
    const prev = String(existing || '').trim();
    return prev ? `${prev}\n${line}` : line;
}

function parseLeadYearMonth(raw: any): { year: number; month: number } {
    const s = String(raw || '').trim();
    if (!s) return { year: 0, month: 0 };
    const ymdLike = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
    if (ymdLike) {
        const month = Number(ymdLike[2]) || 0;
        return { year: Number(ymdLike[1]) || 0, month: month >= 1 && month <= 12 ? month : 0 };
    }
    const dmyOrMdyLike = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
    if (dmyOrMdyLike) {
        const a = Number(dmyOrMdyLike[1]) || 0;
        const b = Number(dmyOrMdyLike[2]) || 0;
        const year = Number(dmyOrMdyLike[3]) || 0;
        let month = 0;
        if (a > 12 && b >= 1 && b <= 12) month = b;
        else if (b > 12 && a >= 1 && a <= 12) month = a;
        else if (b >= 1 && b <= 12) month = b;
        return { year, month };
    }
    const dt = new Date(s);
    if (!Number.isNaN(dt.getTime())) return { year: dt.getFullYear(), month: dt.getMonth() + 1 };
    return { year: 0, month: 0 };
}

/** Period filter for Activities using due date as anchor. */
export function leadMatchesDueDatePeriod(
    lead: any,
    period: CrmSalesPeriod,
    quarterBuckets: Record<string, number[]>
): boolean {
    const due = getCallDueDate(lead);
    const { year: y, month: mo } = parseLeadYearMonth(due);
    if (!Number.isFinite(y) || !Number.isFinite(mo) || y <= 0 || mo <= 0) return false;
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

export type CallTimelineEntry = {
    id: string;
    at: string;
    atLabel: string;
    title: string;
    body: string;
    description?: string;
    nextStep?: string;
    kind: 'call_created' | 'log' | 'next_step' | 'completed' | 'follow_up';
    leadId?: string;
    subject?: string;
    stage?: string;
};

function formatTimelineDate(raw: string): string {
    const dt = parseYmdToLocalDate(raw);
    if (!dt) return raw || '—';
    return dt.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function relatedLeadsForAccount(
    crmLeads: Record<string, any[]>,
    accountId: string,
    accountName?: string,
    focusLeadId?: string
): any[] {
    const aid = String(accountId || '').trim();
    const name = String(accountName || '').trim().toLowerCase();
    const all = flattenCrmLeads(crmLeads).filter((l: any) => {
        if (aid && String(l?.accountId || '').trim() === aid) return true;
        if (name && String(l?.company || '').trim().toLowerCase() === name) return true;
        return false;
    });
    const fid = String(focusLeadId || '').trim();
    if (!fid) return all;

    const byId = new Map<string, any>();
    for (const l of all) {
        const id = String(l?.id || '').trim();
        if (id) byId.set(id, l);
    }
    if (!byId.has(fid)) return all;

    // Thread = focused call + parent chain + any follow-ups recursively.
    const threadIds = new Set<string>([fid]);
    let cursor = byId.get(fid);
    while (cursor) {
        const parentId = String(cursor?.parentCallId || '').trim();
        if (!parentId || threadIds.has(parentId)) break;
        if (!byId.has(parentId)) break;
        threadIds.add(parentId);
        cursor = byId.get(parentId);
    }
    let expanded = true;
    while (expanded) {
        expanded = false;
        for (const l of all) {
            const id = String(l?.id || '').trim();
            const parentId = String(l?.parentCallId || '').trim();
            if (!id || !parentId) continue;
            if (threadIds.has(parentId) && !threadIds.has(id)) {
                threadIds.add(id);
                expanded = true;
            }
        }
    }
    return all.filter((l: any) => threadIds.has(String(l?.id || '').trim()));
}

/** Account call history for Activities "See Details" — newest first. */
export function buildAccountCallTimeline(
    crmLeads: Record<string, any[]>,
    accountId: string,
    accountName?: string,
    focusLeadId?: string
): CallTimelineEntry[] {
    const related = relatedLeadsForAccount(crmLeads, accountId, accountName, focusLeadId);
    const entries: CallTimelineEntry[] = [];

    for (const lead of related) {
        const subject = String(lead?.subject || 'Sales call');
        const stage = String(lead?.stage || '');
        const scheduled = String(lead?.enteredFunnelAt || lead?.date || getCallDueDate(lead) || '').trim();
        if (scheduled) {
            entries.push({
                id: `${lead.id}-scheduled`,
                at: scheduled,
                atLabel: formatTimelineDate(scheduled),
                title: subject,
                body: lead?.parentCallId ? 'Follow-up call scheduled' : 'Call scheduled',
                kind: lead?.parentCallId ? 'follow_up' : 'call_created',
                leadId: lead.id,
                subject,
                stage,
            });
        }

        const nextStep = String(lead?.nextStep || '').trim();
        const logEntries: CallTimelineEntry[] = [];
        const structuredLogs = Array.isArray(lead?.callLogs) ? lead.callLogs : [];

        if (structuredLogs.length) {
            for (let i = 0; i < structuredLogs.length; i++) {
                const row = structuredLogs[i];
                const at = String(row?.at || '').trim().slice(0, 10);
                if (!at) continue;
                const feedback = String(row?.clientFeedback || '').trim();
                const bodyParts = [
                    feedback ? `Client feedback: ${feedback}` : '',
                ].filter(Boolean);
                logEntries.push({
                    id: String(row?.id || `${lead.id}-log-${i}`),
                    at,
                    atLabel: formatTimelineDate(at),
                    title: 'Call logged',
                    body: bodyParts.join('\n'),
                    description: String(row?.description || '').trim(),
                    nextStep: String(row?.nextStep || '').trim(),
                    kind: 'log',
                    leadId: lead.id,
                    subject,
                    stage,
                });
            }
        } else {
            const desc = String(lead?.description || '').trim();
            if (desc) {
                const lines = desc.split('\n').filter(Boolean);
                let parsedAny = false;
                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i];
                    const m = line.match(/^\[(\d{4}-\d{2}-\d{2})\]\s*(.*)$/);
                    if (m) {
                        parsedAny = true;
                        logEntries.push({
                            id: `${lead.id}-log-${i}`,
                            at: m[1],
                            atLabel: formatTimelineDate(m[1]),
                            title: 'Call logged',
                            body: '',
                            description: m[2] || '',
                            kind: 'log',
                            leadId: lead.id,
                            subject,
                            stage,
                        });
                    }
                }
                if (!parsedAny) {
                    const at = String(lead?.callLoggedAt || scheduled || '').slice(0, 10) || scheduled;
                    logEntries.push({
                        id: `${lead.id}-desc`,
                        at: at || '1970-01-01',
                        atLabel: at ? formatTimelineDate(at) : '—',
                        title: 'Call logged',
                        body: '',
                        description: desc,
                        kind: 'log',
                        leadId: lead.id,
                        subject,
                        stage,
                    });
                }
            }
            if (logEntries.length && nextStep) {
                const latest = logEntries.reduce((best, cur) => (cur.at >= best.at ? cur : best));
                latest.nextStep = nextStep;
            }
        }

        entries.push(...logEntries);

        if (isActivityCompleted(lead)) {
            const at = String(lead?.activityCompletedAt || lead?.callLoggedAt || scheduled || '').slice(0, 10);
            if (at) {
                entries.push({
                    id: `${lead.id}-done`,
                    at,
                    atLabel: formatTimelineDate(at),
                    title: 'Marked completed',
                    body: subject,
                    kind: 'completed',
                    leadId: lead.id,
                    subject,
                    stage,
                });
            }
        }
    }

    const kindPriority: Record<CallTimelineEntry['kind'], number> = {
        completed: 4,
        log: 3,
        next_step: 2,
        follow_up: 1,
        call_created: 0,
    };
    return entries.sort((a, b) => {
        const cmp = b.at.localeCompare(a.at);
        if (cmp !== 0) return cmp;
        const kp = (kindPriority[b.kind] || 0) - (kindPriority[a.kind] || 0);
        if (kp !== 0) return kp;
        return b.id.localeCompare(a.id);
    });
}

export function accountHasCallHistory(
    lead: any,
    crmLeads: Record<string, any[]>
): boolean {
    const accountId = String(lead?.accountId || '').trim();
    const accountName = String(lead?.company || '').trim();
    if (!accountId && !accountName) {
        return Boolean(String(lead?.description || '').trim() || lead?.callLoggedAt);
    }
    return buildAccountCallTimeline(crmLeads, accountId, accountName, String(lead?.id || '')).length > 0;
}
