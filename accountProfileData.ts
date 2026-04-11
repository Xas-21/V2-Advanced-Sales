/** Join requests to an account by stable id, then by normalized account name. */
export function requestMatchesAccount(req: any, accountId: string | undefined, accountName: string | undefined): boolean {
    const aid = String(accountId || '').trim();
    if (aid && String(req.accountId || '').trim() === aid) return true;
    const n = String(accountName || '').trim().toLowerCase();
    if (!n) return false;
    const ra = String(req.account || req.accountName || '').trim().toLowerCase();
    return ra === n;
}

export function filterRequestsForAccount(requests: any[], accountId: string | undefined, accountName: string | undefined): any[] {
    if (!requests?.length) return [];
    return requests.filter((r) => requestMatchesAccount(r, accountId, accountName));
}

const WON = new Set(['definite', 'actual']);
const OPEN = new Set(['inquiry', 'tentative', 'accepted']);

export function filterOpenBookingRequests(requestsForAccount: any[]): any[] {
    if (!requestsForAccount?.length) return [];
    return requestsForAccount.filter((r) => OPEN.has(String(r.status || '').toLowerCase()));
}

export function computeAccountMetrics(requestsForAccount: any[]): {
    totalRequests: number;
    totalSpend: number;
    winRate: number;
    openPipelineCount: number;
} {
    if (!requestsForAccount.length) {
        return { totalRequests: 0, totalSpend: 0, winRate: 0, openPipelineCount: 0 };
    }
    let totalSpend = 0;
    let won = 0;
    let eligible = 0;
    let openCount = 0;
    for (const r of requestsForAccount) {
        const paid = parseFloat(String(r.paidAmount || '0').replace(/,/g, '')) || 0;
        totalSpend += paid;
        const st = String(r.status || '').toLowerCase();
        if (st === 'cancelled' || st === 'lost') continue;
        eligible += 1;
        if (WON.has(st)) won += 1;
        if (OPEN.has(st)) openCount += 1;
    }
    const winRate = eligible > 0 ? Math.round((won / eligible) * 100) : 0;
    return {
        totalRequests: requestsForAccount.length,
        totalSpend,
        winRate,
        openPipelineCount: openCount
    };
}

export type TimelineItem = {
    id: string;
    sortKey: number;
    icon: 'call' | 'doc' | 'visit' | 'request' | 'note';
    title: string;
    body: string;
    whenLabel: string;
    by: string;
    meta?: { requestId?: string; stage?: string; activityId?: string; source?: 'manual' | 'call' | 'request' };
};

function parseWhen(s: string | undefined): number {
    if (!s) return 0;
    const t = Date.parse(s);
    return Number.isNaN(t) ? 0 : t;
}

/** Flatten CRM pipeline leads with stage label for matching & display */
export function flattenCrmLeads(leads: Record<string, any[]>): any[] {
    if (!leads || typeof leads !== 'object') return [];
    const out: any[] = [];
    for (const [stage, arr] of Object.entries(leads)) {
        if (!Array.isArray(arr)) continue;
        for (const l of arr) {
            out.push({ ...l, stage });
        }
    }
    return out;
}

export function filterSalesCallsForAccount(
    flatLeads: any[],
    accountId: string | undefined,
    accountName: string | undefined
): any[] {
    const aid = String(accountId || '').trim();
    const name = String(accountName || '').trim().toLowerCase();
    return flatLeads.filter((l) => {
        if (aid && String(l.accountId || '').trim() === aid) return true;
        const c = String(l.company || '').trim().toLowerCase();
        return name && c === name;
    });
}

const STAGE_OPPORTUNITY = new Set(['new', 'qualified', 'proposal', 'negotiation']);

export function filterOpenOpportunityLeads(flatLeads: any[], accountId: string | undefined, accountName: string | undefined): any[] {
    return filterSalesCallsForAccount(flatLeads, accountId, accountName).filter((l) =>
        STAGE_OPPORTUNITY.has(String(l.stage || '').toLowerCase())
    );
}

export function buildAccountTimeline(input: {
    requestsForAccount: any[];
    salesCalls: any[];
    manualActivities?: any[];
}): TimelineItem[] {
    const items: TimelineItem[] = [];

    for (const call of input.salesCalls) {
        const when = call.lastContact || call.followUpDate || '';
        const title = call.subject || `${String(call.stage || 'Call').toUpperCase()} — ${call.company || 'Sales call'}`;
        const body = [call.description, call.nextStep].filter(Boolean).join('\n') || '—';
        items.push({
            id: `call-${call.id}`,
            sortKey: parseWhen(when) || parseWhen(call.followUpDate),
            icon: 'call',
            title,
            body,
            whenLabel: when ? String(when) : '—',
            by: call.accountManager || '—',
            meta: { stage: call.stage, source: 'call' }
        });
    }

    for (const req of input.requestsForAccount) {
        const logs = Array.isArray(req.logs) ? req.logs : [];
        for (let i = 0; i < logs.length; i++) {
            const log = logs[i];
            items.push({
                id: `req-${req.id}-log-${i}`,
                sortKey: parseWhen(log.date),
                icon: 'request',
                title: log.action || 'Request activity',
                body: log.details || '',
                whenLabel: log.date ? new Date(log.date).toLocaleString() : '—',
                by: log.user || '—',
                meta: { requestId: req.id, source: 'request' }
            });
        }
    }

    const manual = input.manualActivities || [];
    for (let i = 0; i < manual.length; i++) {
        const a = manual[i];
        const aid = a.id != null ? String(a.id) : `i${i}`;
        items.push({
            id: `act-${aid}`,
            sortKey: parseWhen(a.at || a.date),
            icon: 'note',
            title: a.title || 'Activity',
            body: a.body || '',
            whenLabel: a.at || a.date ? new Date(a.at || a.date).toLocaleString() : '—',
            by: a.user || a.userName || '—',
            meta: { activityId: aid, source: 'manual' }
        });
    }

    items.sort((a, b) => b.sortKey - a.sortKey);
    return items;
}
