import { flattenCrmLeads } from './accountProfileData';

export const PROFILE_MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

function parseYmd(raw: any): string {
    if (!raw) return '';
    const s = String(raw).trim().slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const dt = new Date(raw);
    if (Number.isNaN(dt.getTime())) return '';
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const d = String(dt.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

export function getPrimaryOperationalDate(req: any): string {
    const checkIn = parseYmd(req?.checkIn);
    const eventStart = parseYmd(req?.eventStart);
    if (checkIn && eventStart) return checkIn <= eventStart ? checkIn : eventStart;
    return checkIn || eventStart || '';
}

const asNumber = (v: any) => parseFloat(String(v ?? 0).replace(/,/g, '')) || 0;

const normStatus = (s: any) => String(s || '').trim().toLowerCase();

/** Pre-tax value aligned with dashboard request breakdown (no circular import from AS). */
export function computeProfileRequestPreTax(req: any): number {
    if (normStatus(req?.status) === 'cancelled') return 0;
    const rooms = Array.isArray(req?.rooms) ? req.rooms : [];
    const agenda = Array.isArray(req?.agenda) ? req.agenda : [];
    const transport = Array.isArray(req?.transportation) ? req.transportation : [];
    const inD = parseYmd(req?.checkIn);
    const outD = parseYmd(req?.checkOut);
    let nights = 0;
    if (inD && outD) {
        const ms = new Date(`${outD}T00:00:00`).getTime() - new Date(`${inD}T00:00:00`).getTime();
        if (!Number.isNaN(ms)) nights = Math.max(0, Math.ceil(ms / 86400000));
    }
    let roomsRevenue = 0;
    for (const row of rooms) {
        const count = Number(row?.count || 0);
        const rate = Number(row?.rate || 0);
        let n = nights;
        const a = parseYmd(row?.arrival || req?.checkIn);
        const b = parseYmd(row?.departure || req?.checkOut);
        if (a && b) {
            const m2 = new Date(`${b}T00:00:00`).getTime() - new Date(`${a}T00:00:00`).getTime();
            if (!Number.isNaN(m2)) n = Math.max(0, Math.ceil(m2 / 86400000));
        }
        roomsRevenue += count * rate * n;
    }
    const eventRevenue = agenda.reduce(
        (s: number, item: any) => s + Number(item?.rate || 0) * Number(item?.pax || 0) + Number(item?.rental || 0),
        0
    );
    const transportRevenue = transport.reduce((s: number, t: any) => s + Number(t?.costPerWay || 0), 0);
    let lineSum = roomsRevenue + eventRevenue + transportRevenue;
    const storedNoTax = asNumber(req?.grandTotalNoTax ?? req?.totalCostNoTax);
    if (lineSum <= 0 && storedNoTax > 0) lineSum = storedNoTax;
    return lineSum;
}

export function logUserMatchesLog(logUser: string | undefined, user: any): boolean {
    const lu = String(logUser || '').trim().toLowerCase();
    if (!lu) return false;
    const parts = [user?.name, user?.username, user?.email]
        .filter(Boolean)
        .map((x: string) => String(x).trim().toLowerCase());
    return parts.some((c) => {
        if (!c) return false;
        if (lu === c) return true;
        const first = c.split(/\s+/)[0] || '';
        return (first && lu.includes(first)) || c.includes(lu);
    });
}

export function requestAttributedToUser(req: any, user: any): boolean {
    if (!user?.id) return false;
    if (req?.createdByUserId != null && String(req.createdByUserId) === String(user.id)) return true;
    const logs = Array.isArray(req?.logs) ? req.logs : [];
    const created = logs.find((l: any) => String(l?.action || '').toLowerCase().includes('request created'));
    if (created && logUserMatchesLog(created.user, user)) return true;
    if (logs.length && logUserMatchesLog(logs[0]?.user, user)) return true;
    return false;
}

export function accountAttributedToUser(acc: any, user: any): boolean {
    if (!user?.id) return false;
    if (acc?.createdByUserId != null && String(acc.createdByUserId) === String(user.id)) return true;
    if (acc?.ownerUserId != null && String(acc.ownerUserId) === String(user.id)) return true;

    // Legacy fallback only when owner/creator ids are missing.
    if (acc?.createdByUserId != null || acc?.ownerUserId != null) return false;

    const acts = Array.isArray(acc?.activities) ? acc.activities : [];
    for (const a of acts) {
        const t = String(a?.title || a?.action || '').toLowerCase();
        if (
            (t.includes('account') && t.includes('creat')) ||
            t.includes('new account') ||
            t.includes('account created')
        ) {
            if (logUserMatchesLog(a.user, user)) return true;
        }
    }
    return false;
}

export function crmLeadAttributedToUser(lead: any, user: any): boolean {
    if (!user?.id) return false;
    if (lead?.ownerUserId != null && String(lead.ownerUserId) === String(user.id)) return true;
    const am = String(lead?.accountManager || '').trim().toLowerCase();
    const unm = String(user?.name || '').trim().toLowerCase();
    const unu = String(user?.username || '').trim().toLowerCase();
    if (am && unm && (am === unm || unm.startsWith(am) || am.startsWith(unm.split(/\s+/)[0] || ''))) return true;
    if (am && unu && am === unu) return true;
    return false;
}

export function requestInProperty(req: any, propertyId: string | undefined): boolean {
    if (!propertyId) return true;
    return !req?.propertyId || String(req.propertyId) === String(propertyId);
}

export function taskAssignedToUser(task: any, user: any): boolean {
    const a = String(task?.assignedTo || '').trim().toLowerCase();
    if (!a) return false;
    const n = String(user?.name || '').trim().toLowerCase();
    const u = String(user?.username || '').trim().toLowerCase();
    if (n && (a === n || n.includes(a) || a.includes(n.split(/\s+/)[0] || ''))) return true;
    if (u && a === u) return true;
    return false;
}

const OPEN_PIPELINE = new Set(['inquiry', 'draft', 'accepted', 'tentative']);

export function monthlySalesCallTarget(user: any, year: number): number {
    const yt = user?.stats?.yearlyTargets || {};
    const raw = Number(yt[String(year)] ?? yt[year] ?? 0);
    if (!raw) return 0;
    return Math.max(1, Math.round(raw / 12));
}

export function filterUserRequests(requests: any[], propertyId: string | undefined, user: any) {
    return (requests || []).filter((r) => requestInProperty(r, propertyId) && requestAttributedToUser(r, user));
}

export function filterUserAccounts(accounts: any[], user: any) {
    return (accounts || []).filter((a) => accountAttributedToUser(a, user));
}

export function filterUserCrmLeads(crmLeads: Record<string, any[]>, propertyId: string | undefined, user: any) {
    const flat = flattenCrmLeads(crmLeads || {});
    return flat.filter((lead) => {
        if (propertyId && lead.propertyId && String(lead.propertyId) !== String(propertyId)) return false;
        if (!propertyId && lead.propertyId) return false;
        return crmLeadAttributedToUser(lead, user);
    });
}

export function countCallsInMonth(leads: any[], ymPrefix: string): number {
    return leads.filter((l) => {
        const d = parseYmd(l?.lastContact || l?.date);
        return d.startsWith(ymPrefix);
    }).length;
}

export function countCallsInYear(leads: any[], year: number): number {
    const p = `${year}-`;
    return leads.filter((l) => {
        const d = parseYmd(l?.lastContact || l?.date);
        return d.startsWith(p);
    }).length;
}

export function buildMonthlyHistory(
    requests: any[],
    userLeads: any[],
    propertyId: string | undefined,
    user: any,
    anchor: Date,
    monthsBack: number
): { month: string; revenue: number; calls: number }[] {
    const out: { month: string; revenue: number; calls: number }[] = [];
    const y = anchor.getFullYear();
    const m = anchor.getMonth();
    for (let i = monthsBack - 1; i >= 0; i--) {
        const d = new Date(y, m - i, 1);
        const label = PROFILE_MONTH_LABELS[d.getMonth()];
        const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        let revenue = 0;
        for (const req of requests) {
            if (!requestInProperty(req, propertyId)) continue;
            if (!requestAttributedToUser(req, user)) continue;
            const pd = getPrimaryOperationalDate(req);
            if (!pd.startsWith(ym)) continue;
            revenue += computeProfileRequestPreTax(req);
        }
        const calls = countCallsInMonth(userLeads, ym);
        out.push({ month: label, revenue, calls });
    }
    return out;
}

export function sumRevenueInYmdRange(requests: any[], propertyId: string | undefined, user: any, start: string, end: string): number {
    let sum = 0;
    for (const req of requests) {
        if (!requestInProperty(req, propertyId)) continue;
        if (!requestAttributedToUser(req, user)) continue;
        const pd = getPrimaryOperationalDate(req);
        if (!pd || pd < start || pd > end) continue;
        sum += computeProfileRequestPreTax(req);
    }
    return sum;
}

export function countRequestsInYmdRange(requests: any[], propertyId: string | undefined, user: any, start: string, end: string): number {
    let n = 0;
    for (const req of requests) {
        if (!requestInProperty(req, propertyId)) continue;
        if (!requestAttributedToUser(req, user)) continue;
        const pd = getPrimaryOperationalDate(req);
        if (!pd || pd < start || pd > end) continue;
        n += 1;
    }
    return n;
}

export function countOpenPipeline(requests: any[], propertyId: string | undefined, user: any): number {
    let n = 0;
    for (const req of requests) {
        if (!requestInProperty(req, propertyId)) continue;
        if (!requestAttributedToUser(req, user)) continue;
        if (OPEN_PIPELINE.has(normStatus(req?.status))) n += 1;
    }
    return n;
}

/** Open-pipeline requests whose primary operational date falls in [start, end] (YYYY-MM-DD). */
export function countOpenPipelineInYmdRange(
    requests: any[],
    propertyId: string | undefined,
    user: any,
    start: string,
    end: string
): number {
    let n = 0;
    for (const req of requests) {
        if (!requestInProperty(req, propertyId)) continue;
        if (!requestAttributedToUser(req, user)) continue;
        if (!OPEN_PIPELINE.has(normStatus(req?.status))) continue;
        const pd = getPrimaryOperationalDate(req);
        if (!pd || pd < start || pd > end) continue;
        n += 1;
    }
    return n;
}

export function ymdBoundsForCalendarMonth(year: number, monthIndex0: number): { start: string; end: string } {
    const start = `${year}-${String(monthIndex0 + 1).padStart(2, '0')}-01`;
    const last = new Date(year, monthIndex0 + 1, 0);
    const end = `${year}-${String(monthIndex0 + 1).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`;
    return { start, end };
}

export function ymdBoundsForCalendarYear(year: number): { start: string; end: string } {
    return { start: `${year}-01-01`, end: `${year}-12-31` };
}

export type ProfileActivityRow = { id: string; title: string; desc: string; date: string; atMs: number; kind: string };

export function buildProfileActivityLog(
    requests: any[],
    accounts: any[],
    tasks: any[],
    user: any,
    propertyId: string | undefined,
    maxAgeMs: number
): ProfileActivityRow[] {
    const now = Date.now();
    const minAt = now - maxAgeMs;
    const rows: ProfileActivityRow[] = [];

    for (const req of requests) {
        if (!requestInProperty(req, propertyId)) continue;
        const logs = Array.isArray(req?.logs) ? req.logs : [];
        for (const log of logs) {
            if (!logUserMatchesLog(log.user, user)) continue;
            const at = Date.parse(log.date || '') || 0;
            if (at < minAt) continue;
            rows.push({
                id: `req-${req.id}-${at}-${log.action}`,
                title: String(log.action || 'Request activity'),
                desc: `${req.requestName || req.confirmationNo || req.id}${log.details ? ` — ${String(log.details).slice(0, 120)}` : ''}`,
                date: String(log.date || '').replace('T', ' ').slice(0, 16),
                atMs: at,
                kind: 'request',
            });
        }
    }

    for (const acc of accounts) {
        const acts = Array.isArray(acc?.activities) ? acc.activities : [];
        for (const act of acts) {
            if (!logUserMatchesLog(act.user, user)) continue;
            const at = Date.parse(act.at || '') || 0;
            if (at < minAt) continue;
            rows.push({
                id: `acc-${acc.id}-${at}-${act.title}`,
                title: String(act.title || 'Account activity'),
                desc: `${acc.name || acc.id}${act.body ? ` — ${String(act.body).slice(0, 120)}` : ''}`,
                date: String(act.at || '').replace('T', ' ').slice(0, 16),
                atMs: at,
                kind: 'account',
            });
        }
    }

    for (const task of tasks || []) {
        if (!taskAssignedToUser(task, user)) continue;
        const at = Date.parse(`${task.date || ''}T12:00:00`) || 0;
        if (at < minAt) continue;
        rows.push({
            id: `task-${task.id}-${at}`,
            title: task.completed ? 'Task completed' : 'Task',
            desc: String(task.task || task.title || ''),
            date: String(task.date || '').replace('T', ' ').slice(0, 16),
            atMs: at,
            kind: 'task',
        });
    }

    rows.sort((a, b) => b.atMs - a.atMs);
    return rows;
}

/** Inclusive month range; labels like "Jan 2025". */
export function monthRangeRevenueSeries(
    requests: any[],
    propertyId: string | undefined,
    user: any,
    fromMonthLabel: string,
    fromYear: string,
    toMonthLabel: string,
    toYear: string
): { month: string; revenue: number }[] {
    const mi = (s: string) => PROFILE_MONTH_LABELS.indexOf(s as (typeof PROFILE_MONTH_LABELS)[number]);
    let y0 = parseInt(fromYear, 10);
    let m0 = mi(fromMonthLabel);
    let y1 = parseInt(toYear, 10);
    let m1 = mi(toMonthLabel);
    if (!Number.isFinite(y0)) y0 = new Date().getFullYear();
    if (!Number.isFinite(y1)) y1 = y0;
    if (m0 < 0) m0 = 0;
    if (m1 < 0) m1 = 11;
    const out: { month: string; revenue: number }[] = [];
    let cy = y0;
    let cm = m0;
    let guard = 0;
    while (guard++ < 120) {
        const ym = `${cy}-${String(cm + 1).padStart(2, '0')}`;
        const label = `${PROFILE_MONTH_LABELS[cm]} ${cy}`;
        let rev = 0;
        for (const req of requests) {
            if (!requestInProperty(req, propertyId)) continue;
            if (!requestAttributedToUser(req, user)) continue;
            const pd = getPrimaryOperationalDate(req);
            if (pd.startsWith(ym)) rev += computeProfileRequestPreTax(req);
        }
        out.push({ month: label, revenue: rev });
        if (cy === y1 && cm === m1) break;
        cm += 1;
        if (cm > 11) {
            cm = 0;
            cy += 1;
        }
    }
    return out;
}
