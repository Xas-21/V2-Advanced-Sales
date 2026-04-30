import React, { useState, useEffect, useMemo, useRef, useLayoutEffect, useCallback } from 'react';
import {
    Users, Phone, Mail, MapPin, Tag, TrendingUp, DollarSign,
    Calendar, MessageSquare, FileText, MoreVertical, MoreHorizontal, X, ArrowRight,
    CheckCircle2, Clock, XCircle, Star, Building, User, Plus,
    Edit, Trash2, Filter, Search, ChevronDown, ChevronLeft, ChevronRight, List, Kanban, Save,
    PhoneCall, Send, Eye, BarChart3, Award, Check, Copy, UserCircle
} from 'lucide-react';
import AddAccountModal from './AddAccountModal';
import CRMProfileView from './CRMProfileView';
import { leadToAccount, accountToLead, contactDisplayName, mergeAccountIntoCrmLead } from './accountLeadMapping';
import { probabilityForStage } from './crmStageUtils';
import { getTagColor, TAG_COLORS_EVENT } from './tagColorSettings';
import {
    canMutateOperational,
    canDeleteSalesCalls,
    canDeleteAccounts,
    canManageManualTimeline,
    isSystemAdmin,
    canMergeAccountsAndAssignOwner,
} from './userPermissions';
import { formatSarCompact } from './formatSar';
import { formatCurrencyAmount, resolveCurrencyCode, type CurrencyCode } from './currency';
import {
    flattenCrmLeads,
    filterRequestsForAccount,
    filterSalesCallsForAccount,
    filterOpenOpportunityLeads
} from './accountProfileData';
import { sumRequestProratedRevenueExTaxInRange } from './operationalSegmentRevenue';
import { apiUrl } from './backendApi';
import ConfirmDialog from './ConfirmDialog';
import { resolveUserAttributionId, crmLeadAttributedToUser } from './userProfileMetrics';
import { applyAccountMergeInMemory, persistAccountMergeToBackend } from './accountMergeUtils';
import { collectSalesCallFormViolations } from './formConfigurations';
import { repointContractRecordsForAccountMerge } from './contractsStore';
import { createPortal } from 'react-dom';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

/** Period filter for pipeline, list, and funnel dashboard (controlled from app header). */
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

function leadMatchesSalesPeriod(
    lead: any,
    period: CrmSalesPeriod,
    quarterBuckets: Record<string, number[]>
): boolean {
    const parseLeadYearMonth = (raw: any): { year: number; month: number } => {
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
            if (a > 12 && b >= 1 && b <= 12) month = b; // D/M/YYYY
            else if (b > 12 && a >= 1 && a <= 12) month = a; // M/D/YYYY
            else if (b >= 1 && b <= 12) month = b; // ambiguous => default to D/M/YYYY
            return { year, month };
        }
        const dt = new Date(s);
        if (!Number.isNaN(dt.getTime())) return { year: dt.getFullYear(), month: dt.getMonth() + 1 };
        return { year: 0, month: 0 };
    };
    const periodAnchor =
        lead?.enteredFunnelAt ||
        lead?.date ||
        lead?.createdAt ||
        lead?.lastContact;
    const { year: y, month: mo } = parseLeadYearMonth(periodAnchor);
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

/** KPI and kanban tag: only when follow-up is explicitly on and a date exists (matches product behavior; avoids orphan dates counting alone). */
function crmLeadHasScheduledFollowUp(lead: any): boolean {
    const date = String(lead?.followUpDate ?? '').trim();
    if (!date) return false;
    const r = lead?.followUpRequired;
    if (r === true || r === 1) return true;
    if (typeof r === 'string' && r.toLowerCase() === 'true') return true;
    return false;
}

interface CRMProps {
    theme: any;
    externalView?: 'pipeline' | 'list' | 'dashboard';
    initialAction?: 'add_call' | null;
    activeProperty?: any;
    accounts: any[];
    setAccounts: React.Dispatch<React.SetStateAction<any[]>>;
    crmLeads: Record<string, any[]>;
    setCrmLeads: React.Dispatch<React.SetStateAction<Record<string, any[]>>>;
    sharedRequests: any[];
    currentUser: any;
    pendingCrmAccountId?: string | null;
    onConsumedPendingCrmAccount?: () => void;
    pendingOpenLeadId?: string | null;
    onConsumedPendingOpenLead?: () => void;
    onNavigateToRequest?: (requestId: string) => void;
    onConsumedInitialAction?: () => void;
    accountTypeOptions?: string[];
    /** Month / year / quarter filter for pipeline, list, and dashboard (controlled from Sales Calls header). */
    crmSalesPeriod: CrmSalesPeriod;
    /** Filter by creator-user (controlled from Sales Calls header). */
    createdByUserFilterId: string;
    onCreatedByUserFilterIdChange?: (userId: string) => void;
    /** Increments → open Add Sales Call (header button). */
    openAddSalesCallNonce?: number;
    currency?: CurrencyCode;
    /** Property staff (id + display name) for “created by” pipeline/list filter. */
    crmFilterUsers?: { id: string; name: string }[];
    propertyFinancialKpis?: any[];
    setSharedRequests?: React.Dispatch<React.SetStateAction<any[]>>;
    assignableUsersForAccounts?: { id: string; name: string }[];
}

export default function CRM({
    theme,
    externalView,
    initialAction,
    activeProperty,
    accounts,
    setAccounts,
    crmLeads,
    setCrmLeads,
    sharedRequests,
    currentUser,
    pendingCrmAccountId,
    onConsumedPendingCrmAccount,
    pendingOpenLeadId,
    onConsumedPendingOpenLead,
    onNavigateToRequest,
    onConsumedInitialAction,
    accountTypeOptions,
    crmSalesPeriod,
    createdByUserFilterId,
    onCreatedByUserFilterIdChange,
    openAddSalesCallNonce = 0,
    currency = 'SAR',
    crmFilterUsers,
    propertyFinancialKpis = [],
    setSharedRequests,
    assignableUsersForAccounts = [],
}: CRMProps) {
    const colors = theme.colors;
    const selectedCurrency = resolveCurrencyCode(currency);
    const formatMoney = (amountSar: number, maxFractionDigits = 0) =>
        formatCurrencyAmount(amountSar, selectedCurrency, { maximumFractionDigits: maxFractionDigits });
    const crmReadOnly = !canMutateOperational(currentUser);
    const canDelSalesCalls = canDeleteSalesCalls(currentUser);
    const allowDeleteAccount = canDeleteAccounts(currentUser);
    const allowManualTimeline = canManageManualTimeline(currentUser);
    const allowTagAdmin = isSystemAdmin(currentUser);
    const allowAccountMergeAndOwner = canMergeAccountsAndAssignOwner(currentUser);
    const [currentView, setCurrentView] = useState<'pipeline' | 'list' | 'dashboard' | 'profile'>('pipeline');

    useEffect(() => {
        if (externalView) {
            setCurrentView(externalView);
        }
    }, [externalView]);

    const [selectedLead, setSelectedLead] = useState<any>(null);
    const [draggedLead, setDraggedLead] = useState<any>(null);
    // New Sales Call & Account States
    const [showAddCallModal, setShowAddCallModal] = useState(initialAction === 'add_call');
    const [showAddAccountModal, setShowAddAccountModal] = useState(false);
    const [accountSearch, setAccountSearch] = useState('');
    const [showAccountDropdown, setShowAccountDropdown] = useState(false);

    const initialActionRef = React.useRef<string | null | undefined>(undefined);
    useEffect(() => {
        if (crmReadOnly) return;
        if (initialAction === 'add_call' && initialActionRef.current !== 'add_call') {
            setShowAddCallModal(true);
            initialActionRef.current = 'add_call';
            onConsumedInitialAction?.();
        }
        if (!initialAction) initialActionRef.current = undefined;
    }, [initialAction, onConsumedInitialAction, crmReadOnly]);

    const [showEditAccountModal, setShowEditAccountModal] = useState(false);
    const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
    const [pendingDeleteAccountId, setPendingDeleteAccountId] = useState<string | null>(null);
    const [deleteImpactMessage, setDeleteImpactMessage] = useState('');
    const flatCrmLeads = useMemo(() => flattenCrmLeads(crmLeads), [crmLeads]);

    const accountsSameProperty = useMemo(() => {
        const pid = String(activeProperty?.id || '').trim();
        if (!pid) return accounts;
        return accounts.filter((a: any) => {
            const p = String(a?.propertyId || '').trim();
            return !p || p === 'P-GLOBAL' || p === pid;
        });
    }, [accounts, activeProperty?.id]);

    const crmLeadsForView = useMemo(() => {
        const out: Record<string, any[]> = { ...crmLeads };
        (Object.keys(out) as string[]).forEach((k) => {
            out[k] = (out[k] || []).filter((l: any) =>
                leadMatchesSalesPeriod(l, crmSalesPeriod, CRM_QUARTER_MONTH_BLOCKS)
            );
        });
        return out;
    }, [crmLeads, crmSalesPeriod]);

    const crmLeadsForDisplay = useMemo(() => {
        const fid = String(createdByUserFilterId || '').trim();
        if (!fid) return crmLeadsForView;
        const userRow = (crmFilterUsers || []).find((u) => String(u.id) === fid);
        if (!userRow) return crmLeadsForView;
        const filterUser = { id: userRow.id, name: userRow.name };
        const out: Record<string, any[]> = { ...crmLeadsForView };
        (Object.keys(out) as string[]).forEach((k) => {
            out[k] = (out[k] || []).filter((l: any) => crmLeadAttributedToUser(l, filterUser));
        });
        return out;
    }, [crmLeadsForView, createdByUserFilterId, crmFilterUsers]);

    const [tagColorTick, setTagColorTick] = useState(0);
    useEffect(() => {
        const h = () => setTagColorTick((t) => t + 1);
        window.addEventListener(TAG_COLORS_EVENT, h);
        return () => window.removeEventListener(TAG_COLORS_EVENT, h);
    }, []);

    const [newCallData, setNewCallData] = useState({
        accountId: '',
        accountName: '',
        /** Index into `account.contacts` for the person on this sales call */
        selectedContactIndex: 0,
        date: new Date().toISOString().split('T')[0],
        city: '',
        subject: '',
        expectedRevenue: '',
        description: '',
        status: 'new',
        nextStep: '',
        followUpRequired: false,
        followUpDate: ''
    });

    const [showAddContactPersonModal, setShowAddContactPersonModal] = useState(false);
    const [newContactPersonForm, setNewContactPersonForm] = useState({
        firstName: '',
        lastName: '',
        position: '',
        email: '',
        phone: '',
        city: '',
        country: '',
    });

    useEffect(() => {
        if (crmReadOnly) return;
        if (!pendingCrmAccountId || !accounts.length) return;
        const acc = accounts.find((a: any) => a.id === pendingCrmAccountId);
        if (!acc) return;
        const nextContacts = Array.isArray(acc.contacts) ? acc.contacts : [];
        setNewCallData((prev) => ({
            ...prev,
            accountId: acc.id,
            accountName: acc.name,
            selectedContactIndex: nextContacts.length ? 0 : -1,
        }));
        setAccountSearch(acc.name);
        setShowAddCallModal(true);
        onConsumedPendingCrmAccount?.();
    }, [pendingCrmAccountId, accounts, onConsumedPendingCrmAccount, crmReadOnly]);

    const stages = [
        { id: 'new', title: 'Upcoming Sales Calls', color: colors.blue },
        { id: 'waiting', title: 'Waiting list', color: '#94a3b8' },
        { id: 'qualified', title: 'QUALIFIED', color: colors.cyan },
        { id: 'proposal', title: 'PROPOSAL', color: colors.yellow },
        { id: 'negotiation', title: 'NEGOTIATION', color: colors.orange },
        { id: 'won', title: 'WON', color: colors.green },
        { id: 'notInterested', title: 'Not Interested', color: '#8b0000' }
    ];

    const stageTitle = (id: string) => stages.find((s) => s.id === id)?.title || id;
    const stageColor = (id: string) => stages.find((s) => s.id === id)?.color || colors.textMuted;
    const now = new Date();
    const dashboardStageOrder = useMemo(
        () => ['waiting', 'qualified', 'proposal', 'negotiation', 'won'],
        []
    );
    const dashboardStageLabel = (stageId: string, fallback: string) => {
        if (stageId === 'new') return 'Leads';
        return fallback;
    };
    const monthNamesShort = useMemo(
        () => ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
        []
    );
    const currentYear = now.getFullYear();
    const piePalette = [colors.primary, colors.cyan, colors.orange, colors.yellow, colors.green, colors.blue];

    const toYmd = (raw: any): string => {
        const s = String(raw || '').trim();
        if (!s) return '';
        return s.slice(0, 10);
    };
    const leadPeriodYmd = (lead: any): string =>
        toYmd(lead?.enteredFunnelAt || lead?.date || lead?.createdAt || lead?.lastContact);
    const parseYearMonth = (raw: any): { year: number; month: number } => {
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
            if (a > 12 && b >= 1 && b <= 12) month = b; // D/M/YYYY
            else if (b > 12 && a >= 1 && a <= 12) month = a; // M/D/YYYY
            else if (b >= 1 && b <= 12) month = b; // ambiguous => default to D/M/YYYY
            return { year, month };
        }
        const dt = new Date(s);
        if (!Number.isNaN(dt.getTime())) return { year: dt.getFullYear(), month: dt.getMonth() + 1 };
        return { year: 0, month: 0 };
    };
    const toMonthNum = (ymd: string) => {
        return parseYearMonth(ymd).month;
    };
    const toYearNum = (ymd: string) => {
        return parseYearMonth(ymd).year;
    };
    const monthNameToNumber = (raw: any): number => {
        const s = String(raw || '').trim().toLowerCase();
        if (!s) return 0;
        const names = [
            'january', 'february', 'march', 'april', 'may', 'june',
            'july', 'august', 'september', 'october', 'november', 'december'
        ];
        const idx = names.findIndex((n) => n === s || n.startsWith(s));
        if (idx >= 0) return idx + 1;
        const n = Number(s);
        return Number.isFinite(n) ? n : 0;
    };

    const crmLeadsForCreatorOnly = useMemo(() => {
        const fid = String(createdByUserFilterId || '').trim();
        if (!fid) return crmLeadsForView;
        const userRow = (crmFilterUsers || []).find((u) => String(u.id) === fid);
        if (!userRow) return crmLeadsForView;
        const filterUser = { id: userRow.id, name: userRow.name };
        const out: Record<string, any[]> = { ...crmLeadsForView };
        (Object.keys(out) as string[]).forEach((k) => {
            out[k] = (out[k] || []).filter((l: any) => crmLeadAttributedToUser(l, filterUser));
        });
        return out;
    }, [crmLeadsForView, createdByUserFilterId, crmFilterUsers]);

    const crmLeadsForCreatorAllTime = useMemo(() => {
        const fid = String(createdByUserFilterId || '').trim();
        if (!fid) return crmLeads;
        const userRow = (crmFilterUsers || []).find((u) => String(u.id) === fid);
        if (!userRow) return crmLeads;
        const filterUser = { id: userRow.id, name: userRow.name };
        const out: Record<string, any[]> = { ...crmLeads };
        (Object.keys(out) as string[]).forEach((k) => {
            out[k] = (out[k] || []).filter((l: any) => crmLeadAttributedToUser(l, filterUser));
        });
        return out;
    }, [crmLeads, createdByUserFilterId, crmFilterUsers]);

    const periodCreatorScopedLeads = useMemo(() => flattenCrmLeads(crmLeadsForCreatorOnly), [crmLeadsForCreatorOnly]);
    const allCreatorScopedLeads = useMemo(() => flattenCrmLeads(crmLeadsForCreatorAllTime), [crmLeadsForCreatorAllTime]);
    const funnelJourneyStageSet = useMemo(() => new Set(dashboardStageOrder), [dashboardStageOrder]);
    const funnelJourneyLeadsForDashboard = useMemo(
        () =>
            periodCreatorScopedLeads.filter((lead: any) => {
                const stageId = String(lead?.stage || '').trim();
                return funnelJourneyStageSet.has(stageId);
            }),
        [periodCreatorScopedLeads, funnelJourneyStageSet]
    );
    const funnelJourneyLeads = useMemo(
        () =>
            allCreatorScopedLeads.filter((lead: any) => {
                const stageId = String(lead?.stage || '').trim();
                return funnelJourneyStageSet.has(stageId);
            }),
        [allCreatorScopedLeads, funnelJourneyStageSet]
    );

    const dashboardFilteredLeads = useMemo(
        () => funnelJourneyLeadsForDashboard,
        [funnelJourneyLeadsForDashboard]
    );

    const dashboardRange = useMemo(() => {
        const y = crmSalesPeriod.year;
        if (crmSalesPeriod.mode === 'year') {
            return { start: `${y}-01-01`, end: `${y}-12-31` };
        }
        if (crmSalesPeriod.mode === 'quarter' && crmSalesPeriod.quarter) {
            const months = CRM_QUARTER_MONTH_BLOCKS[crmSalesPeriod.quarter];
            const startMonth = String(months[0]).padStart(2, '0');
            const endMonthNum = months[2];
            const endMonth = String(endMonthNum).padStart(2, '0');
            const endDay = new Date(y, endMonthNum, 0).getDate();
            return { start: `${y}-${startMonth}-01`, end: `${y}-${endMonth}-${String(endDay).padStart(2, '0')}` };
        }
        const m = String(crmSalesPeriod.month).padStart(2, '0');
        const endDay = new Date(y, crmSalesPeriod.month, 0).getDate();
        return { start: `${y}-${m}-01`, end: `${y}-${m}-${String(endDay).padStart(2, '0')}` };
    }, [crmSalesPeriod]);

    const requestOperationalDate = (req: any) =>
        toYmd(req?.checkIn || req?.arrivalDate || req?.eventStart || req?.requestDate || req?.createdAt || req?.updatedAt);

    const scopedRequestsAll = useMemo(
        () => (Array.isArray(sharedRequests) ? sharedRequests : []),
        [sharedRequests]
    );

    const linkedRequestsForLead = (lead: any) => {
        const aid = String(lead?.accountId || '').trim();
        const company = String(lead?.company || '').trim().toLowerCase();
        const leadDate = toYmd(lead?.lastContact || lead?.date);
        return scopedRequestsAll.filter((req: any) => {
            const opDate = requestOperationalDate(req);
            if (leadDate && opDate && opDate < leadDate) return false;
            const reqAid = String(req?.accountId || '').trim();
            const reqAcc = accounts.find((a: any) => String(a?.id || '') === reqAid);
            const reqName = String(reqAcc?.name || req?.account || req?.accountName || '').trim().toLowerCase();
            if (aid && reqAid) return aid === reqAid;
            if (!company) return false;
            return reqName === company;
        });
    };

    const dashboardStats = useMemo(() => {
        const byStage = new Map<string, any[]>();
        stages.forEach((s) => byStage.set(s.id, []));
        for (const lead of dashboardFilteredLeads) {
            const sid = String(lead?.stage || 'new');
            if (!byStage.has(sid)) byStage.set(sid, []);
            byStage.get(sid)!.push(lead);
        }
        const orderedStages = dashboardStageOrder
            .map((id) => stages.find((s) => s.id === id))
            .filter(Boolean) as typeof stages;
        const includedLeadsTotal = orderedStages.reduce((acc, s) => acc + (byStage.get(s.id) || []).length, 0);
        const stageRows = orderedStages.map((s) => {
            const leads = byStage.get(s.id) || [];
            let requestsCount = 0;
            let revenue = 0;
            leads.forEach((lead: any) => {
                const reqs = linkedRequestsForLead(lead);
                requestsCount += reqs.length;
                revenue += reqs.reduce((sum: number, req: any) => sum + sumRequestProratedRevenueExTaxInRange(req, '1900-01-01', '2100-12-31'), 0);
            });
            return {
                stageId: s.id,
                stageTitle: dashboardStageLabel(s.id, s.title),
                count: leads.length,
                pct: includedLeadsTotal ? (leads.length / includedLeadsTotal) * 100 : 0,
                requestsCount,
                revenue,
            };
        });
        const won = (byStage.get('won') || []).length;
        const journeyLeadsTotal =
            (byStage.get('waiting') || []).length +
            (byStage.get('qualified') || []).length +
            (byStage.get('proposal') || []).length +
            (byStage.get('negotiation') || []).length +
            (byStage.get('won') || []).length;
        // Funnel conversion: won leads over all leads currently in the funnel journey.
        const conversionRate = journeyLeadsTotal > 0 ? (won / journeyLeadsTotal) * 100 : 0;
        const totalRevenue = stageRows.reduce((s, r) => s + r.revenue, 0);
        const allRequestCount = stageRows.reduce((s, r) => s + r.requestsCount, 0);
        const preferredBusinessMap = new Map<string, number>();
        dashboardFilteredLeads.forEach((lead: any) => {
            linkedRequestsForLead(lead).forEach((req: any) => {
                const seg = String(req?.segment || 'Uncategorized').trim() || 'Uncategorized';
                preferredBusinessMap.set(seg, (preferredBusinessMap.get(seg) || 0) + 1);
            });
        });
        const preferredBusinessData = [...preferredBusinessMap.entries()]
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 6);
        return {
            stageRows,
            totalLeads: journeyLeadsTotal,
            totalClients: won,
            totalRevenue,
            avgRevenue: dashboardFilteredLeads.length ? totalRevenue / dashboardFilteredLeads.length : 0,
            conversionRate,
            totalRequests: allRequestCount,
            preferredBusinessData,
        };
    }, [dashboardFilteredLeads, dashboardRange, stages, accounts, dashboardStageOrder, scopedRequestsAll]);
    const funnelAccountTypeTotals = useMemo(() => {
        const typeCounts = new Map<string, number>();
        dashboardFilteredLeads.forEach((lead: any) => {
            const leadAccount = accounts.find((a: any) => String(a?.id || '') === String(lead?.accountId || ''));
            const fallbackTag = Array.isArray(lead?.tags) && lead.tags.length ? String(lead.tags[0] || '').trim() : '';
            const accountType =
                String(leadAccount?.type || lead?.accountType || fallbackTag || 'Unspecified').trim() || 'Unspecified';
            typeCounts.set(accountType, (typeCounts.get(accountType) || 0) + 1);
        });
        return [...typeCounts.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([name, value]) => `${name} (${value})`);
    }, [dashboardFilteredLeads, accounts]);

    const selectedPeriodMonths = useMemo(() => {
        if (crmSalesPeriod.mode === 'year') return Array.from({ length: 12 }, (_, i) => i + 1);
        if (crmSalesPeriod.mode === 'quarter' && crmSalesPeriod.quarter) return CRM_QUARTER_MONTH_BLOCKS[crmSalesPeriod.quarter];
        return [crmSalesPeriod.month];
    }, [crmSalesPeriod]);

    const ytdPeriodMonths = useMemo(() => {
        if (crmSalesPeriod.mode === 'month') {
            return Array.from({ length: crmSalesPeriod.month }, (_, i) => i + 1);
        }
        if (crmSalesPeriod.mode === 'quarter' && crmSalesPeriod.quarter) {
            const quarterMonths = CRM_QUARTER_MONTH_BLOCKS[crmSalesPeriod.quarter];
            const quarterEndMonth = quarterMonths[2] || 12;
            return Array.from({ length: quarterEndMonth }, (_, i) => i + 1);
        }
        return selectedPeriodMonths;
    }, [crmSalesPeriod.mode, crmSalesPeriod.month, crmSalesPeriod.quarter, selectedPeriodMonths]);
    const financialYearRow = useMemo(() => {
        const rows = (propertyFinancialKpis || []).filter((r: any) => Number(r?.year) === crmSalesPeriod.year);
        if (!rows.length) return null;
        const activePropertyId = String(activeProperty?.id || '').trim();
        if (!activePropertyId) return rows[0];
        const exactId = `${activePropertyId}_${crmSalesPeriod.year}`;
        return rows.find((r: any) => String(r?.id || '') === exactId) || rows[0];
    }, [propertyFinancialKpis, crmSalesPeriod.year, activeProperty?.id]);

    const monthlyTarget = useMemo(() => {
        const row = financialYearRow;
        if (!row) return 0;
        const months = Array.isArray(row?.months) ? row.months : [];
        const monthSet = new Set(selectedPeriodMonths);
        return months.reduce((sum: number, m: any) => {
            const mn = monthNameToNumber(m?.month);
            if (!monthSet.has(mn)) return sum;
            return sum + (Number(m?.salesCalls || 0) || 0);
        }, 0);
    }, [financialYearRow, selectedPeriodMonths]);

    const ytdTarget = useMemo(() => {
        const row = financialYearRow;
        if (!row) return 0;
        const months = Array.isArray(row?.months) ? row.months : [];
        const monthSet = new Set(ytdPeriodMonths);
        return months.reduce((sum: number, m: any) => {
            const mn = monthNameToNumber(m?.month);
            if (!monthSet.has(mn)) return sum;
            return sum + (Number(m?.salesCalls || 0) || 0);
        }, 0);
    }, [financialYearRow, ytdPeriodMonths]);

    const monthlyActual = useMemo(
        () =>
            funnelJourneyLeads.filter((lead: any) => {
                const d = leadPeriodYmd(lead);
                if (!d || toYearNum(d) !== crmSalesPeriod.year) return false;
                const mm = toMonthNum(d);
                return selectedPeriodMonths.includes(mm);
            }).length,
        [funnelJourneyLeads, crmSalesPeriod.year, selectedPeriodMonths]
    );
    const ytdActual = useMemo(
        () =>
            funnelJourneyLeads.filter((lead: any) => {
                const d = leadPeriodYmd(lead);
                if (!d || toYearNum(d) !== crmSalesPeriod.year) return false;
                return ytdPeriodMonths.includes(toMonthNum(d));
            }).length,
        [funnelJourneyLeads, crmSalesPeriod.year, ytdPeriodMonths]
    );
    const monthlyGoalPct = useMemo(() => {
        // Progress is always computed from totals for the selected period slice.
        if (monthlyTarget <= 0) return 0;
        return (monthlyActual / monthlyTarget) * 100;
    }, [monthlyActual, monthlyTarget]);
    const ytdGoalPct = useMemo(() => {
        // YTD progress is cumulative actual leads divided by cumulative target (never average of monthly percentages).
        if (ytdTarget <= 0) return 0;
        return (ytdActual / ytdTarget) * 100;
    }, [ytdActual, ytdTarget]);
    const [expandedDashboardAccounts, setExpandedDashboardAccounts] = useState<string[]>([]);
    const dashboardAccountRows = useMemo(() => {
        const stageRank = new Map<string, number>();
        dashboardStageOrder.forEach((id, idx) => stageRank.set(id, idx));
        const accountMap = new Map<string, any>();
        for (const lead of dashboardFilteredLeads) {
            const stageId = String(lead?.stage || '').trim();
            if (!stageRank.has(stageId)) continue;
            const accountId = String(lead?.accountId || '').trim();
            const accountName = String(lead?.company || '').trim() || 'Unknown account';
            const key = accountId || `name:${accountName.toLowerCase()}`;
            const requests = linkedRequestsForLead(lead);
            const reqMap = new Map<string, any>();
            requests.forEach((req: any) => {
                const reqKey = String(req?.id || `${req?.requestDate || ''}-${req?.accountId || ''}-${req?.requestName || ''}`);
                reqMap.set(reqKey, req);
            });
            const requestRows = [...reqMap.values()].map((req: any) => {
                const startDate = String(req?.checkIn || req?.arrivalDate || req?.eventStart || req?.requestDate || '').slice(0, 10);
                const endDate = String(req?.checkOut || req?.departureDate || req?.eventEnd || req?.requestDate || '').slice(0, 10);
                return {
                    id: String(req?.id || `${req?.requestName || 'request'}-${startDate}`),
                    requestName: String(req?.requestName || req?.eventName || req?.requestType || 'Request'),
                    startDate,
                    endDate,
                    requestSegment: String(req?.segment || '—'),
                    accountType: String(
                        accounts.find((a: any) => String(a?.id || '') === String(req?.accountId || ''))?.type ||
                        req?.accountType ||
                        '—'
                    ),
                    revenue: sumRequestProratedRevenueExTaxInRange(req, '1900-01-01', '2100-12-31'),
                };
            });
            const totalRevenue = requestRows.reduce((sum, r) => sum + (Number(r.revenue) || 0), 0);
            const candidate = {
                key,
                accountId,
                accountName,
                stageId,
                stageTitle: dashboardStageLabel(stageId, stageTitle(stageId)),
                stageColor: stageColor(stageId),
                requestCount: requestRows.length,
                totalRevenue,
                requests: requestRows,
                rank: stageRank.get(stageId) || 0,
            };
            const existing = accountMap.get(key);
            if (!existing || candidate.rank > existing.rank) {
                accountMap.set(key, candidate);
            } else if (existing) {
                const merged = new Map<string, any>();
                [...existing.requests, ...requestRows].forEach((r: any) => merged.set(String(r.id), r));
                existing.requests = [...merged.values()];
                existing.requestCount = existing.requests.length;
                existing.totalRevenue = existing.requests.reduce((sum: number, r: any) => sum + (Number(r.revenue) || 0), 0);
                accountMap.set(key, existing);
            }
        }
        return [...accountMap.values()].sort((a, b) => (b.totalRevenue - a.totalRevenue) || (b.requestCount - a.requestCount));
    }, [dashboardFilteredLeads, dashboardStageOrder, accounts, dashboardRange]);

    const downloadFile = (fileName: string, content: string, mimeType: string) => {
        const blob = new Blob([content], { type: mimeType });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
    };
    const dashboardSnapshotRef = useRef<HTMLDivElement>(null);
    const captureDashboardSnapshot = async (): Promise<string | null> => {
        const node = dashboardSnapshotRef.current;
        if (!node) return null;
        const canvas = await html2canvas(node, {
            scale: 2,
            backgroundColor: colors.bg,
            useCORS: true,
            logging: false,
            windowWidth: Math.max(document.documentElement.clientWidth, node.scrollWidth),
            windowHeight: Math.max(document.documentElement.clientHeight, node.scrollHeight),
        });
        return canvas.toDataURL('image/png');
    };

    const exportDashboardExcel = useCallback(async () => {
        const title = `Sales Funnel Dashboard (${crmSalesPeriod.mode === 'month' ? `${monthNamesShort[crmSalesPeriod.month - 1]} ${crmSalesPeriod.year}` : crmSalesPeriod.mode === 'quarter' && crmSalesPeriod.quarter ? `${crmSalesPeriod.quarter} ${crmSalesPeriod.year}` : crmSalesPeriod.year})`;
        const imageDataUrl = await captureDashboardSnapshot();
        if (!imageDataUrl) return;
        const imageBase64 = imageDataUrl.includes(',') ? imageDataUrl.split(',')[1] : imageDataUrl;
        const boundary = '----=_NextPart_CRM_SNAPSHOT';
        const imageContentLocation = 'file:///dashboard-snapshot.png';
        const sheetContentLocation = 'file:///sales-funnel-snapshot.htm';
        const html = `<!doctype html><html><head><meta charset="utf-8" /></head><body style="margin:0;padding:16px;font-family:Arial,sans-serif;"><h3 style="margin:0 0 12px 0;">${title}</h3><img src="${imageContentLocation}" style="width:100%;height:auto;border:1px solid #ddd;" /></body></html>`;
        const mhtml = [
            'MIME-Version: 1.0',
            `Content-Type: multipart/related; boundary="${boundary}"`,
            '',
            `--${boundary}`,
            `Content-Location: ${sheetContentLocation}`,
            'Content-Type: text/html; charset="utf-8"',
            'Content-Transfer-Encoding: 8bit',
            '',
            html,
            `--${boundary}`,
            `Content-Location: ${imageContentLocation}`,
            'Content-Type: image/png',
            'Content-Transfer-Encoding: base64',
            '',
            imageBase64,
            `--${boundary}--`,
            '',
        ].join('\r\n');
        downloadFile(
            `sales_funnel_snapshot_${crmSalesPeriod.year}_${String(crmSalesPeriod.month).padStart(2, '0')}.xls`,
            mhtml,
            'application/vnd.ms-excel'
        );
    }, [crmSalesPeriod, monthNamesShort, colors.bg]);

    const exportDashboardPdf = useCallback(async () => {
        const imageDataUrl = await captureDashboardSnapshot();
        if (!imageDataUrl) return;
        const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
        const pageW = pdf.internal.pageSize.getWidth();
        const pageH = pdf.internal.pageSize.getHeight();
        const img = new Image();
        img.src = imageDataUrl;
        await new Promise((resolve) => {
            img.onload = resolve;
            img.onerror = resolve;
        });
        const imgW = img.width || 1;
        const imgH = img.height || 1;
        const scale = Math.min(pageW / imgW, pageH / imgH);
        const drawW = imgW * scale;
        const drawH = imgH * scale;
        const x = (pageW - drawW) / 2;
        const y = (pageH - drawH) / 2;
        pdf.addImage(imageDataUrl, 'PNG', x, y, drawW, drawH);
        pdf.save(`sales_funnel_snapshot_${crmSalesPeriod.year}_${String(crmSalesPeriod.month).padStart(2, '0')}.pdf`);
    }, [crmSalesPeriod, colors.bg]);

    useEffect(() => {
        if (!openAddSalesCallNonce) return;
        if (crmReadOnly) return;
        setShowAddCallModal(true);
    }, [openAddSalesCallNonce, crmReadOnly]);
    const CircularIndicator = ({
        label,
        value,
        suffix = '%',
        tone = colors.primary,
    }: {
        label: string;
        value: number;
        suffix?: string;
        tone?: string;
    }) => {
        const safe = Number.isFinite(value) ? Math.max(0, value) : 0;
        const pct = Math.min(100, safe);
        return (
            <div className="p-3 rounded-xl border flex items-center gap-3" style={{ borderColor: colors.border, backgroundColor: colors.bg }}>
                <div
                    className="w-14 h-14 rounded-full grid place-items-center text-[11px] font-black"
                    style={{
                        color: colors.textMain,
                        background: `conic-gradient(${tone} ${pct * 3.6}deg, ${colors.card} 0deg)`,
                    }}
                >
                    <div className="w-10 h-10 rounded-full grid place-items-center text-[10px] font-black" style={{ backgroundColor: colors.bg }}>
                        {Math.round(safe)}{suffix}
                    </div>
                </div>
                <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-wide font-bold" style={{ color: colors.textMuted }}>{label}</p>
                </div>
            </div>
        );
    };

    const findLeadStageId = (leads: Record<string, any[]>, leadId: string): string | null => {
        for (const k of Object.keys(leads)) {
            if ((leads[k] || []).some((l: any) => l.id === leadId)) return k;
        }
        return null;
    };

    /** Auto-log CRM events onto the linked account timeline (account.activities). */
    const appendCrmActivityToAccount = (accountId: string | undefined, title: string, body: string) => {
        if (!accountId) return;
        const u = currentUser?.name || currentUser?.email || 'Staff';
        const act = {
            id: `crm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            at: new Date().toISOString(),
            title,
            body,
            user: u
        };
        setAccounts((prev: any[]) =>
            prev.map((a: any) =>
                a.id === accountId ? { ...a, activities: [...(a.activities || []), act] } : a
            )
        );
        setSelectedLead((prev: any) =>
            prev && prev.accountId === accountId ? { ...prev, activities: [...(prev.activities || []), act] } : prev
        );
    };

    const [listMenuLeadId, setListMenuLeadId] = useState<string | null>(null);
    const crmMenuAnchorRef = useRef<HTMLElement | null>(null);
    const [crmMenuDropPos, setCrmMenuDropPos] = useState<{ top: number; right: number } | null>(null);
    const crmMenuLead = useMemo(() => {
        if (!listMenuLeadId) return null;
        for (const k of Object.keys(crmLeadsForDisplay)) {
            const arr = (crmLeadsForDisplay as any)[k] || [];
            const hit = arr.find((l: any) => String(l.id) === String(listMenuLeadId));
            if (hit) return hit;
        }
        return null;
    }, [listMenuLeadId, crmLeadsForDisplay]);
    /** After a kanban drag starts, ignore the next click on that card (avoids opening profile when dropping). */
    const ignoreNextPipelineCardClickIdRef = useRef<string | null>(null);
    /** false = oldest → newest (default); true = newest → oldest */
    const [listSortNewestFirst, setListSortNewestFirst] = useState(false);
    const crmAccountComboRef = useRef<HTMLDivElement>(null);
    const pipelineBoardScrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!listMenuLeadId) return;
        const onDoc = (e: MouseEvent) => {
            if (!(e.target as HTMLElement).closest('[data-crm-list-menu]')) setListMenuLeadId(null);
        };
        document.addEventListener('mousedown', onDoc);
        return () => document.removeEventListener('mousedown', onDoc);
    }, [listMenuLeadId]);

    useLayoutEffect(() => {
        if (!listMenuLeadId) {
            setCrmMenuDropPos(null);
            return;
        }
        const el = crmMenuAnchorRef.current;
        if (!el) {
            setCrmMenuDropPos(null);
            return;
        }
        const sync = () => {
            const r = el.getBoundingClientRect();
            setCrmMenuDropPos({ top: r.bottom + 4, right: window.innerWidth - r.right });
        };
        sync();
        window.addEventListener('scroll', sync, true);
        window.addEventListener('resize', sync);
        return () => {
            window.removeEventListener('scroll', sync, true);
            window.removeEventListener('resize', sync);
        };
    }, [listMenuLeadId]);

    useEffect(() => {
        if (!showAddCallModal) return;
        const onDoc = (e: MouseEvent) => {
            const el = crmAccountComboRef.current;
            if (el && !el.contains(e.target as Node)) setShowAccountDropdown(false);
        };
        document.addEventListener('mousedown', onDoc);
        return () => document.removeEventListener('mousedown', onDoc);
    }, [showAddCallModal]);

    useEffect(() => {
        if (showAddCallModal) setShowAccountDropdown(false);
    }, [showAddCallModal]);

    const [showEditCallModal, setShowEditCallModal] = useState(false);
    const [editCallForm, setEditCallForm] = useState({
        leadId: '',
        accountId: '',
        accountName: '',
        date: '',
        city: '',
        subject: '',
        expectedRevenue: '',
        description: '',
        status: 'new',
        nextStep: '',
        followUpRequired: false,
        followUpDate: ''
    });
    const editSnapshotRef = React.useRef<any>(null);

    useEffect(() => {
        if (!showEditCallModal) return;
        const st = String(editCallForm.status);
        if (st !== 'notInterested' && st !== 'won') return;
        if (!editCallForm.followUpRequired && !String(editCallForm.followUpDate || '').trim()) return;
        setEditCallForm((prev) => ({ ...prev, followUpRequired: false, followUpDate: '' }));
    }, [editCallForm.status, showEditCallModal]);

    // Calculate stats (respect visible month + creator filter)
    const allLeads = Object.values(crmLeadsForDisplay).flat();
    const listSortedLeads = useMemo(() => {
        const leads = Object.values(crmLeadsForDisplay).flat();
        const leadSortYmd = (l: any) => String(l.lastContact || l.date || '').trim() || '';
        return [...leads].sort((a, b) => {
            const cmp = leadSortYmd(a).localeCompare(leadSortYmd(b));
            return listSortNewestFirst ? -cmp : cmp;
        });
    }, [crmLeadsForDisplay, listSortNewestFirst]);
    const totalLeads = allLeads.length;
    const pipelineValue = allLeads.reduce((sum: number, l: any) => sum + Number(l.value || 0), 0);
    const avgDealSize = totalLeads > 0 ? pipelineValue / totalLeads : 0;
    const wonThisMonth = crmLeadsForDisplay.won?.length || 0;
    const highPotentialCount =
        (crmLeadsForDisplay.proposal?.length || 0) + (crmLeadsForDisplay.negotiation?.length || 0);
    const followUpRequiredCount = allLeads.filter((lead: any) => crmLeadHasScheduledFollowUp(lead)).length;

    const openLeadProfile = (lead: any) => {
        setListMenuLeadId(null);
        const acc = accounts.find((a: any) => a.id === lead.accountId || a.name === lead.company);
        setSelectedLead(acc ? mergeAccountIntoCrmLead(acc, lead) : lead);
        setCurrentView('profile');
    };

    useEffect(() => {
        if (!pendingOpenLeadId) return;
        const lead = flatCrmLeads.find((l: any) => String(l.id) === String(pendingOpenLeadId));
        if (!lead) {
            onConsumedPendingOpenLead?.();
            return;
        }
        const acc = accounts.find((a: any) => a.id === lead.accountId || a.name === lead.company);
        setSelectedLead(acc ? mergeAccountIntoCrmLead(acc, lead) : lead);
        setCurrentView('profile');
        onConsumedPendingOpenLead?.();
    }, [pendingOpenLeadId, flatCrmLeads, accounts, onConsumedPendingOpenLead]);

    const appendProfileAudit = (action: string, details: string, accountId: string) => {
        const entry = {
            id: `audit-${Date.now()}`,
            at: new Date().toISOString(),
            userName: currentUser?.name || currentUser?.username || 'User',
            action,
            details
        };
        setAccounts((prev: any[]) =>
            prev.map((a: any) =>
                a.id === accountId ? { ...a, profileAuditLog: [...(a.profileAuditLog || []), entry] } : a
            )
        );
        setSelectedLead((prev: any) =>
            prev && (prev.accountId === accountId || prev.id === accountId)
                ? { ...prev, profileAuditLog: [...(prev.profileAuditLog || []), entry] }
                : prev
        );
    };

    const handleProfileLeadChange = (next: any) => {
        setSelectedLead(next);
        const aid = next.accountId;
        if (aid) {
            setAccounts((prev: any[]) =>
                prev.map((a: any) => (a.id === aid ? leadToAccount(next, a) : a))
            );
            if (Array.isArray(next.tags)) {
                setCrmLeads((prev) => {
                    const out = { ...prev } as Record<string, any[]>;
                    (Object.keys(out) as string[]).forEach((k) => {
                        out[k] = (out[k] || []).map((l: any) =>
                            l.accountId === aid ? { ...l, tags: next.tags } : l
                        );
                    });
                    return out;
                });
            }
        }
    };

    const handleSaveCall = () => {
        const cfgViol = collectSalesCallFormViolations(activeProperty?.id, newCallData, activeProperty);
        if (cfgViol.length) {
            window.alert(cfgViol.join('\n'));
            return;
        }

        const account = accounts.find((a: any) => a.id === newCallData.accountId)
            || accounts.find((a: any) => a.name === newCallData.accountName);
        if (!account) return;
        const contacts = Array.isArray(account.contacts) ? account.contacts : [];
        if (!contacts.length) {
            window.alert('Add at least one contact person for this account (use + next to Contact person) before saving.');
            return;
        }
        const idx = Math.min(
            Math.max(0, Math.floor(Number(newCallData.selectedContactIndex) || 0)),
            contacts.length - 1
        );
        const primaryContact = contacts[idx];
        if (!primaryContact || !String(contactDisplayName(primaryContact) || '').trim()) {
            window.alert('Choose a valid contact person for this sales call.');
            return;
        }

        const expected = parseFloat(String(newCallData.expectedRevenue || '').replace(/,/g, '')) || 0;
        const stageKey = newCallData.status as string;
        const tagList =
            Array.isArray(account.tags) && account.tags.length
                ? [...account.tags]
                : account.type
                  ? [account.type]
                  : ['Corporate'];

        const toNotInterestedNew = stageKey === 'notInterested';
        const toWonNew = stageKey === 'won';
        const newLead = {
            id: `L${Date.now()}`,
            propertyId: activeProperty?.id || undefined,
            ownerUserId: resolveUserAttributionId(currentUser) || undefined,
            createdByUserId: resolveUserAttributionId(currentUser) || undefined,
            accountId: account.id,
            company: newCallData.accountName,
            subject: newCallData.subject,
            contact: contactDisplayName(primaryContact),
            position: primaryContact.position,
            email: primaryContact.email,
            phone: primaryContact.phone,
            city: newCallData.city || account.city || primaryContact.city || '',
            country: account.country || primaryContact.country || '',
            value: expected,
            probability: probabilityForStage(stageKey),
            tags: tagList,
            enteredFunnelAt: newCallData.date,
            date: newCallData.date,
            lastContact: newCallData.date,
            accountManager: currentUser?.name || currentUser?.email || 'Staff',
            totalRequests: 0,
            totalSpend: 0,
            winRate: 0,
            description: newCallData.description,
            nextStep: newCallData.nextStep,
            followUpRequired: toNotInterestedNew || toWonNew ? false : !!newCallData.followUpRequired,
            followUpDate:
                toNotInterestedNew || toWonNew ? '' : newCallData.followUpRequired ? newCallData.followUpDate : ''
        };

        const targetStage = newCallData.status as keyof typeof crmLeads;
        setCrmLeads(prev => ({
            ...prev,
            [targetStage]: [newLead, ...prev[targetStage]]
        }));

        const stLabel = stageTitle(String(targetStage));
        appendCrmActivityToAccount(
            account.id,
            'Sales call created',
            `${currentUser?.name || currentUser?.username || 'User'} created a sales opportunity in ${stLabel}.\n` +
                `Subject: ${newCallData.subject}\n` +
                `Expected revenue: ${formatMoney(expected, 0)}\n` +
                `Probability: ${probabilityForStage(stageKey)}%`
        );

        setShowAddCallModal(false);
        setNewCallData({
            accountId: '',
            accountName: '',
            selectedContactIndex: 0,
            date: new Date().toISOString().split('T')[0],
            city: '',
            subject: '',
            expectedRevenue: '',
            description: '',
            status: 'new',
            nextStep: '',
            followUpRequired: false,
            followUpDate: '',
        });
    };

    const saveNewContactPersonToAccount = () => {
        if (!newContactPersonForm.firstName?.trim() || !newContactPersonForm.lastName?.trim()) return;
        const accountId = newCallData.accountId;
        if (!accountId) {
            window.alert('Select an account first.');
            return;
        }
        const fullName = `${newContactPersonForm.firstName.trim()} ${newContactPersonForm.lastName.trim()}`;
        const contactRow = {
            firstName: newContactPersonForm.firstName.trim(),
            lastName: newContactPersonForm.lastName.trim(),
            name: fullName,
            position: String(newContactPersonForm.position || '').trim(),
            email: String(newContactPersonForm.email || '').trim(),
            phone: String(newContactPersonForm.phone || '').trim(),
            city: String(newContactPersonForm.city || '').trim(),
            country: String(newContactPersonForm.country || '').trim(),
        };
        let appendedIndex = 0;
        setAccounts((prev: any[]) =>
            prev.map((a: any) => {
                if (a.id !== accountId) return a;
                const existing = Array.isArray(a.contacts) ? [...a.contacts] : [];
                appendedIndex = existing.length;
                return { ...a, contacts: [...existing, contactRow] };
            })
        );
        appendCrmActivityToAccount(
            accountId,
            'Contact added',
            `${currentUser?.name || currentUser?.username || 'User'} added contact ${fullName} from the Sales Calls form.`
        );
        setNewCallData((prev) => ({ ...prev, selectedContactIndex: appendedIndex }));
        setNewContactPersonForm({
            firstName: '',
            lastName: '',
            position: '',
            email: '',
            phone: '',
            city: '',
            country: '',
        });
        setShowAddContactPersonModal(false);
    };

    const handleSaveAccount = (newAccountData: any) => {
        if (!newAccountData?.name) return;
        const u = currentUser?.name || currentUser?.username || currentUser?.email || 'User';
        const act = {
            id: `acct-${Date.now()}`,
            at: new Date().toISOString(),
            title: 'Account created',
            body: 'Account created from CRM.',
            user: u,
        };
        const newAccount = {
            id: `A${Date.now()}`,
            ...newAccountData,
            propertyId: newAccountData.propertyId || activeProperty?.id || 'P-GLOBAL',
            createdByUserId: resolveUserAttributionId(currentUser) || undefined,
            accountOwnerName: u,
            activities: [...(newAccountData.activities || []), act],
        };
        setAccounts((prev: any[]) => [newAccount, ...prev]);
        setShowAddAccountModal(false);
        if (showAddCallModal) {
            const nc = Array.isArray(newAccount.contacts) ? newAccount.contacts : [];
            setNewCallData((prev) => ({
                ...prev,
                accountId: newAccount.id,
                accountName: newAccount.name,
                selectedContactIndex: nc.length ? 0 : -1,
            }));
            setAccountSearch(newAccount.name);
        }
    };

    const openEditSalesCallModal = (lead: any) => {
        const sid = findLeadStageId(crmLeads, lead.id);
        if (!sid) return;
        editSnapshotRef.current = { lead: { ...lead }, stageId: sid };
        setEditCallForm({
            leadId: lead.id,
            accountId: lead.accountId,
            accountName: lead.company,
            date: lead.lastContact || new Date().toISOString().split('T')[0],
            city: lead.city || '',
            subject: lead.subject || '',
            expectedRevenue: String(lead.value ?? ''),
            description: lead.description || '',
            status: sid,
            nextStep: lead.nextStep || '',
            followUpRequired: !!(lead.followUpRequired || lead.followUpDate),
            followUpDate: lead.followUpDate || ''
        });
        setShowEditCallModal(true);
        setListMenuLeadId(null);
    };

    const saveEditedSalesCall = () => {
        const snap = editSnapshotRef.current;
        if (!snap || !editCallForm.leadId) return;
        if (!editCallForm.subject?.trim()) return;
        const oldLead = snap.lead;
        const oldStage = snap.stageId;
        const newStage = editCallForm.status as keyof typeof crmLeads;
        const newValue = parseFloat(String(editCallForm.expectedRevenue || '').replace(/,/g, '')) || 0;
        const newProb = probabilityForStage(String(newStage));
        const toNotInterested = String(newStage) === 'notInterested';
        const toWon = String(newStage) === 'won';
        const updated = {
            ...oldLead,
            propertyId: activeProperty?.id || oldLead.propertyId,
            company: editCallForm.accountName,
            subject: editCallForm.subject,
            description: editCallForm.description,
            nextStep: editCallForm.nextStep,
            lastContact: editCallForm.date,
            city: editCallForm.city,
            value: newValue,
            probability: newProb,
            followUpRequired: toNotInterested || toWon ? false : !!editCallForm.followUpRequired,
            followUpDate: toNotInterested || toWon ? '' : editCallForm.followUpRequired ? editCallForm.followUpDate : ''
        };

        setCrmLeads((prev) => {
            const out = { ...prev } as Record<string, any[]>;
            (Object.keys(out) as string[]).forEach((k) => {
                out[k] = (out[k] || []).filter((l: any) => l.id !== editCallForm.leadId);
            });
            out[newStage] = [updated, ...(out[newStage] || [])];
            return out;
        });

        const changes: string[] = [];
        if (oldStage !== String(newStage)) {
            changes.push(`Stage: ${stageTitle(oldStage)} → ${stageTitle(String(newStage))}`);
        }
        if (Number(oldLead.value || 0) !== newValue) {
            changes.push(
                `Expected revenue: ${formatMoney(Number(oldLead.value || 0), 0)} → ${formatMoney(newValue, 0)}`
            );
        }
        if ((oldLead.subject || '') !== (editCallForm.subject || '')) changes.push('Subject updated');
        if ((oldLead.description || '') !== (editCallForm.description || '')) changes.push('Description updated');
        if ((oldLead.nextStep || '') !== (editCallForm.nextStep || '')) changes.push('Next step updated');
        if ((oldLead.lastContact || '') !== (editCallForm.date || '')) changes.push('Last contact date updated');
        if (Number(oldLead.probability ?? 0) !== newProb) {
            changes.push(`Probability: ${oldLead.probability ?? 0}% → ${newProb}%`);
        }

        appendCrmActivityToAccount(
            editCallForm.accountId,
            'Sales call updated',
            `${currentUser?.name || currentUser?.username || 'User'} updated this opportunity.\n${changes.join('\n') || 'Details refreshed.'}`
        );
        setShowEditCallModal(false);
        editSnapshotRef.current = null;
    };

    const deleteSalesCallByLead = (lead: any) => {
        const sid = findLeadStageId(crmLeads, lead.id);
        if (!sid) return;
        if (!window.confirm('Delete this sales call? This cannot be undone.')) return;
        setCrmLeads((prev) => ({
            ...prev,
            [sid]: (prev[sid] || []).filter((l: any) => l.id !== lead.id)
        }));
        appendCrmActivityToAccount(
            lead.accountId,
            'Sales call deleted',
            `${currentUser?.name || currentUser?.username || 'User'} removed the sales opportunity for ${lead.company} (subject: ${lead.subject || '—'}).`
        );
        setListMenuLeadId(null);
    };

    const duplicateSalesCallByLead = (lead: any) => {
        const sid = findLeadStageId(crmLeads, lead.id);
        if (!sid) return;
        const dup = { ...lead, id: `L${Date.now()}`, propertyId: activeProperty?.id || lead.propertyId };
        setCrmLeads((prev) => ({
            ...prev,
            [sid]: [dup, ...(prev[sid] || [])]
        }));
        appendCrmActivityToAccount(
            lead.accountId,
            'Sales call duplicated',
            `${currentUser?.name || currentUser?.username || 'User'} duplicated the opportunity for ${lead.company} (copy of "${lead.subject || 'call'}").`
        );
        setListMenuLeadId(null);
    };

    const openAccountDeleteConfirm = async (accountId: string) => {
        try {
            const impactRes = await fetch(apiUrl(`/api/accounts/${encodeURIComponent(String(accountId))}/delete-impact`));
            const impact = impactRes.ok
                ? await impactRes.json()
                : { requests: [], requestsCount: 0, salesCallsCount: 0 };
            const requestLines = Array.isArray(impact.requests)
                ? impact.requests
                      .slice(0, 10)
                      .map((r: any) => `- ${r.id || 'N/A'} | ${r.requestName || 'Unnamed request'}`)
                      .join('\n')
                : '';
            const more =
                Array.isArray(impact.requests) && impact.requests.length > 10
                    ? `\n...and ${impact.requests.length - 10} more request(s).`
                    : '';
            const msg =
                `Deleting this account will also delete linked data:\n` +
                `Requests: ${impact.requestsCount || 0}\n` +
                `Sales calls: ${impact.salesCallsCount || 0}\n\n` +
                `${requestLines}${more}\n\n` +
                `Do you wish to continue?`;
            setPendingDeleteAccountId(String(accountId));
            setDeleteImpactMessage(msg);
            setConfirmDeleteOpen(true);
        } catch {
            alert('Failed to prepare delete impact.');
        }
    };

    const confirmDeleteAccount = async () => {
        if (!pendingDeleteAccountId) return;
        try {
            const res = await fetch(apiUrl(`/api/accounts/${encodeURIComponent(String(pendingDeleteAccountId))}`), {
                method: 'DELETE',
            });
            if (!res.ok) {
                alert('Failed to delete account.');
                return;
            }
            setAccounts((prev: any[]) => prev.filter((a: any) => a.id !== pendingDeleteAccountId));
            setCrmLeads((prev) => {
                const out = { ...prev } as Record<string, any[]>;
                (Object.keys(out) as string[]).forEach((k) => {
                    out[k] = (out[k] || []).filter((l: any) => l.accountId !== pendingDeleteAccountId);
                });
                return out;
            });
            setCurrentView(externalView || 'pipeline');
        } catch {
            alert('Failed to delete account.');
        } finally {
            setConfirmDeleteOpen(false);
            setPendingDeleteAccountId(null);
            setDeleteImpactMessage('');
        }
    };

    const handleCrmMergeAccountIntoCurrent = async (sourceAccountId: string) => {
        if (!selectedLead) return;
        const destId = String(selectedLead.accountId || selectedLead.id || '');
        const sourceRow = accounts.find((a: any) => String(a.id) === String(sourceAccountId));
        const sourceName = String(sourceRow?.name || '').trim();
        const applied = applyAccountMergeInMemory({
            accounts,
            sharedRequests,
            crmLeads,
            destAccountId: destId,
            sourceAccountId,
        });
        if (!applied) return;
        const propertyId = String(activeProperty?.id || applied.mergedAccount?.propertyId || '').trim();
        if (!propertyId) {
            window.alert('Missing property context; cannot save merge to the server.');
            return;
        }
        try {
            await persistAccountMergeToBackend({
                mergedAccount: applied.mergedAccount,
                sourceAccountId: String(sourceAccountId),
                sourceAccountName: sourceName,
                nextRequests: applied.nextRequests,
                previousRequests: sharedRequests,
                nextCrmLeads: applied.nextCrmLeads,
                propertyId,
            });
        } catch (e: any) {
            window.alert(
                e?.message ||
                    'Could not save the merge to the server. Nothing was changed; please try again or contact support.'
            );
            return;
        }
        setAccounts(applied.nextAccounts);
        setSharedRequests?.(applied.nextRequests);
        setCrmLeads(applied.nextCrmLeads);
        repointContractRecordsForAccountMerge(
            String(sourceAccountId),
            destId,
            String(applied.mergedAccount.name || '')
        );
        const nextLead =
            selectedLead && String(selectedLead.id || '').startsWith('L')
                ? mergeAccountIntoCrmLead(applied.mergedAccount, selectedLead)
                : accountToLead(applied.mergedAccount);
        setSelectedLead(nextLead);
        appendProfileAudit(
            'Accounts merged',
            `Merged duplicate account "${String(
                accounts.find((a: any) => String(a.id) === String(sourceAccountId))?.name || sourceAccountId
            )}" into this profile.`,
            destId
        );
    };

    const handleCrmAssignAccountOwner = (userId: string, ownerDisplayName: string) => {
        if (!selectedLead) return;
        const destId = String(selectedLead.accountId || selectedLead.id || '');
        if (!destId) return;
        const leadRef = selectedLead;
        setAccounts((prev: any[]) => {
            const next = prev.map((a: any) =>
                String(a.id) === destId
                    ? { ...a, createdByUserId: userId, accountOwnerName: ownerDisplayName }
                    : a
            );
            const row = next.find((a: any) => String(a.id) === destId);
            if (row) {
                setSelectedLead(
                    String(leadRef.id || '').startsWith('L')
                        ? mergeAccountIntoCrmLead(row, leadRef)
                        : accountToLead(row)
                );
            }
            return next;
        });
    };

    if (currentView === 'profile' && selectedLead) {
        const aid = selectedLead.accountId || selectedLead.id;
        const aname = selectedLead.company;
        const linkedReq = filterRequestsForAccount(sharedRequests, aid, aname);
        const salesForAcc = filterSalesCallsForAccount(flatCrmLeads, aid, aname);
        const oppLeads = filterOpenOpportunityLeads(flatCrmLeads, aid, aname);
        const editingRow = accounts.find((a: any) => a.id === aid);
        return (
            <>
                <CRMProfileView
                    lead={selectedLead}
                    theme={theme}
                    onClose={() => setCurrentView(externalView || 'pipeline')}
                    onLeadChange={handleProfileLeadChange}
                    linkedRequests={linkedReq}
                    salesCalls={salesForAcc}
                    opportunityLeads={oppLeads}
                    currentUser={currentUser}
                    onOpenRequest={onNavigateToRequest}
                    onAddOpportunity={
                        crmReadOnly
                            ? undefined
                            : () => {
                                  setCurrentView(externalView || 'pipeline');
                                  const acc = accounts.find((a: any) => a.id === aid);
                                  if (acc) {
                                      setNewCallData((prev) => ({
                                          ...prev,
                                          accountId: acc.id,
                                          accountName: acc.name
                                      }));
                                      setAccountSearch(acc.name);
                                  }
                                  setShowAddCallModal(true);
                              }
                    }
                    onEditAccount={crmReadOnly ? undefined : () => setShowEditAccountModal(true)}
                    readOnly={crmReadOnly}
                    canDeleteAccount={allowDeleteAccount}
                    canManageManualTimeline={allowManualTimeline}
                    canManageAccountTags={allowTagAdmin}
                    appendAuditLog={(action, details) => appendProfileAudit(action, details, aid)}
                    onDeleteAccount={
                        allowDeleteAccount
                            ? () => openAccountDeleteConfirm(String(aid))
                            : undefined
                    }
                    canMergeAccountsAndAssignOwner={allowAccountMergeAndOwner}
                    accountOwnerUserOptions={assignableUsersForAccounts}
                    allAccountsForMergeSearch={accountsSameProperty}
                    onMergeAccountIntoCurrent={
                        allowAccountMergeAndOwner && setSharedRequests
                            ? handleCrmMergeAccountIntoCurrent
                            : undefined
                    }
                    onAssignAccountOwner={allowAccountMergeAndOwner ? handleCrmAssignAccountOwner : undefined}
                />
                <AddAccountModal
                    isOpen={showEditAccountModal}
                    onClose={() => setShowEditAccountModal(false)}
                    editingAccount={editingRow}
                    theme={theme}
                    accountTypeOptions={accountTypeOptions}
                    configurationProperty={activeProperty || undefined}
                    configurationPropertyId={activeProperty?.id ? String(activeProperty.id) : undefined}
                    onSave={(data: any) => {
                        if (!data?.id) return;
                        const merged = { ...(accounts.find((a: any) => a.id === data.id) || {}), ...data };
                        setAccounts((prev: any[]) => prev.map((a: any) => (a.id === data.id ? merged : a)));
                        setSelectedLead((prev: any) =>
                            prev && String(prev.id || '').startsWith('L')
                                ? mergeAccountIntoCrmLead(merged, prev)
                                : accountToLead(merged)
                        );
                        appendProfileAudit('Account updated', 'Account details saved from edit modal', data.id);
                        setShowEditAccountModal(false);
                    }}
                />
                <ConfirmDialog
                    isOpen={confirmDeleteOpen}
                    title="Confirm Account Deletion"
                    message={deleteImpactMessage}
                    confirmLabel="Delete Account"
                    danger
                    onConfirm={confirmDeleteAccount}
                    onCancel={() => {
                        setConfirmDeleteOpen(false);
                        setPendingDeleteAccountId(null);
                        setDeleteImpactMessage('');
                    }}
                />
            </>
        );
    }

    // Main Pipeline View
    return (
        <>
        <div className="h-full flex flex-col overflow-hidden" style={{ backgroundColor: colors.bg }}>
            {currentView !== 'dashboard' && (
                <div className="shrink-0 px-4 py-3 border-b" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 animate-in fade-in slide-in-from-bottom-2 duration-500">
                        <div className="p-3 rounded-xl border transition-all duration-300 hover:scale-[1.02] hover:shadow-lg" style={{ backgroundColor: colors.bg, borderColor: colors.border }}>
                            <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: colors.textMuted }}>Total Calls</p>
                            <p className="text-2xl font-bold" style={{ color: colors.textMain }}>{totalLeads}</p>
                        </div>
                        <div className="p-3 rounded-xl border transition-all duration-300 hover:scale-[1.02] hover:shadow-lg" style={{ backgroundColor: colors.bg, borderColor: colors.border }}>
                            <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: colors.textMuted }}>High Potential Client</p>
                            <p className="text-2xl font-bold font-mono" style={{ color: colors.primary }}>{highPotentialCount}</p>
                        </div>
                        <div className="p-3 rounded-xl border transition-all duration-300 hover:scale-[1.02] hover:shadow-lg" style={{ backgroundColor: colors.bg, borderColor: colors.border }}>
                            <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: colors.textMuted }}>Follow up Required</p>
                            <p className="text-2xl font-bold font-mono" style={{ color: colors.orange }}>{followUpRequiredCount}</p>
                        </div>
                        <div className="p-3 rounded-xl border transition-all duration-300 hover:scale-[1.02] hover:shadow-lg" style={{ backgroundColor: colors.bg, borderColor: colors.border }}>
                            <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: colors.textMuted }}>Conversion Rate</p>
                            <p className="text-2xl font-bold" style={{ color: colors.green }}>{(((crmLeadsForDisplay.won?.length || 0) / (totalLeads || 1)) * 100).toFixed(0)}%</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Pipeline or List Content */}
            <div ref={currentView === 'dashboard' ? dashboardSnapshotRef : undefined} className="flex-1 overflow-hidden flex flex-col p-4 pt-2">
                {currentView === 'dashboard' ? (
                    <div className="flex-1 min-h-0 grid grid-cols-1 gap-4 overflow-y-auto">
                        <div className="rounded-xl border p-4" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                            <h3 className="text-sm font-bold uppercase tracking-wide mb-3 text-center" style={{ color: colors.textMain }}>Sales Funnel - Conversion Rate Tracking</h3>
                            <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-stretch">
                                <div className="xl:col-span-2 space-y-2">
                                    <div className="p-3 rounded-xl border" style={{ borderColor: colors.border, backgroundColor: colors.bg }}>
                                        <p className="text-[10px] uppercase tracking-wide font-bold" style={{ color: colors.textMuted }}>Total Leads</p>
                                        <p className="text-xl font-black" style={{ color: colors.textMain }}>{dashboardStats.totalLeads}</p>
                                    </div>
                                    <div className="p-3 rounded-xl border" style={{ borderColor: colors.border, backgroundColor: colors.bg }}>
                                        <p className="text-[10px] uppercase tracking-wide font-bold" style={{ color: colors.textMuted }}>Revenues</p>
                                        <p className="text-xl font-black" style={{ color: colors.primary }}>{formatMoney(dashboardStats.totalRevenue)}</p>
                                    </div>
                                    <div className="p-3 rounded-xl border" style={{ borderColor: colors.border, backgroundColor: colors.bg }}>
                                        <p className="text-[10px] uppercase tracking-wide font-bold" style={{ color: colors.textMuted }}>Avg Revenue</p>
                                        <p className="text-xl font-black" style={{ color: colors.textMain }}>{formatMoney(dashboardStats.avgRevenue)}</p>
                                    </div>
                                    <div className="p-3 rounded-xl border" style={{ borderColor: colors.border, backgroundColor: colors.bg }}>
                                        <p className="text-[10px] uppercase tracking-wide font-bold" style={{ color: colors.textMuted }}>Requests</p>
                                        <p className="text-xl font-black" style={{ color: colors.textMain }}>{dashboardStats.totalRequests}</p>
                                    </div>
                                </div>
                                <div className="xl:col-span-8 rounded-xl border p-3 overflow-x-auto" style={{ borderColor: colors.border, backgroundColor: colors.bg }}>
                                    <div className="min-w-[760px] flex items-center h-[230px]">
                                        {dashboardStats.stageRows.map((row, idx) => {
                                            const total = dashboardStats.stageRows.length || 1;
                                            const startH = 190 - idx * (110 / total);
                                            const endH = idx === total - 1 ? startH : 190 - (idx + 1) * (110 / total);
                                            return (
                                                <div
                                                    key={row.stageId}
                                                    className="relative flex-1 flex items-center justify-center text-center font-bold text-white"
                                                    style={{
                                                        height: `${Math.max(56, startH)}px`,
                                                        backgroundColor: stageColor(row.stageId),
                                                        clipPath: idx === total - 1
                                                            ? 'polygon(0 0, 82% 0, 100% 50%, 82% 100%, 0 100%)'
                                                            : 'polygon(0 0, 88% 0, 100% 50%, 88% 100%, 0 100%, 10% 50%)',
                                                        marginLeft: idx === 0 ? 0 : '-18px',
                                                        marginTop: `${(190 - startH) / 2}px`,
                                                        marginBottom: `${(190 - startH) / 2}px`,
                                                    }}
                                                >
                                                    <div className="text-[11px] leading-tight px-2">
                                                        <div>{row.pct.toFixed(0)}%</div>
                                                        <div>{row.stageTitle.replace('Upcoming Sales Calls', 'Inquiries')}</div>
                                                        <div>{row.count}</div>
                                                    </div>
                                                    {idx === total - 1 && (
                                                        <div className="absolute -right-6 w-12 h-12 rounded-full grid place-items-center text-[11px] font-black" style={{ backgroundColor: stageColor(row.stageId) }}>
                                                            {row.count}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                    <div className="mt-2 border-t pt-2" style={{ borderColor: colors.border }}>
                                        <div className="text-[10px] uppercase tracking-wide font-bold mb-1" style={{ color: colors.textMuted }}>
                                            Account Types In Funnel
                                        </div>
                                        {funnelAccountTypeTotals.length > 0 ? (
                                            <div className="flex flex-wrap items-center gap-1.5">
                                                {funnelAccountTypeTotals.map((badge) => (
                                                    <span
                                                        key={`funnel-total-${badge}`}
                                                        className="px-2 py-0.5 rounded-full text-[10px] font-semibold border"
                                                        style={{ borderColor: colors.border, color: colors.textMain, backgroundColor: colors.card }}
                                                    >
                                                        {badge}
                                                    </span>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="text-[10px]" style={{ color: colors.textMuted }}>
                                                No account types in this funnel period.
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div className="xl:col-span-2 space-y-2">
                                    <CircularIndicator label="Conversion Rate" value={dashboardStats.conversionRate} tone={colors.green} />
                                    <CircularIndicator label="Monthly Goal" value={monthlyGoalPct} tone={colors.cyan} />
                                    <CircularIndicator label="YTD Goal" value={ytdGoalPct} tone={colors.primary} />
                                    <div className="p-3 rounded-xl border" style={{ borderColor: colors.border, backgroundColor: colors.bg }}>
                                        <p className="text-[10px] uppercase tracking-wide font-bold" style={{ color: colors.textMuted }}>Customers</p>
                                        <p className="text-xl font-black" style={{ color: colors.textMain }}>{dashboardStats.totalClients}</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                            {[
                                { id: 'proposal', label: 'Proposal' },
                                { id: 'negotiation', label: 'Negotiation' },
                                { id: 'won', label: 'Won' },
                            ].map((stageCfg) => {
                                const stageRows = dashboardAccountRows.filter((r: any) => r.stageId === stageCfg.id);
                                const stageTone = stageColor(stageCfg.id);
                                return (
                                    <div key={stageCfg.id} className="rounded-xl border overflow-hidden" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                                        <div
                                            className="px-4 py-3 border-b text-xs font-bold uppercase tracking-wide text-center"
                                            style={{ borderColor: colors.border, color: '#fff', backgroundColor: stageTone }}
                                        >
                                            {stageCfg.label}
                                        </div>
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-left border-collapse">
                                                <thead className="text-[10px] uppercase tracking-wider font-semibold" style={{ backgroundColor: colors.bg, color: colors.textMuted }}>
                                                    <tr>
                                                        <th className="px-4 py-3">Account</th>
                                                        <th className="px-4 py-3">Requests</th>
                                                        <th className="px-4 py-3">Revenue</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="text-xs">
                                                    {stageRows.map((row: any) => {
                                                        const expanded = expandedDashboardAccounts.includes(row.key);
                                                        return (
                                                            <React.Fragment key={`${stageCfg.id}-${row.key}`}>
                                                                <tr className="border-t" style={{ borderColor: colors.border }}>
                                                                    <td className="px-4 py-3 font-bold">
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => {
                                                                                setExpandedDashboardAccounts((prev) =>
                                                                                    prev.includes(row.key) ? prev.filter((k) => k !== row.key) : [...prev, row.key]
                                                                                );
                                                                            }}
                                                                            className="text-left hover:underline"
                                                                            style={{ color: colors.textMain }}
                                                                        >
                                                                            {row.accountName}
                                                                        </button>
                                                                    </td>
                                                                    <td className="px-4 py-3" style={{ color: colors.textMain }}>{row.requestCount}</td>
                                                                    <td className="px-4 py-3 font-mono" style={{ color: colors.primary }}>{formatMoney(row.totalRevenue)}</td>
                                                                </tr>
                                                                {expanded && (
                                                                    <tr className="border-t" style={{ borderColor: colors.border }}>
                                                                        <td colSpan={3} className="px-4 py-3" style={{ backgroundColor: colors.bg }}>
                                                                            <table className="w-full text-left border-collapse">
                                                                                <thead className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: colors.textMuted }}>
                                                                                    <tr>
                                                                                        <th className="py-2 pr-3">Request</th>
                                                                                        <th className="py-2 pr-3">Start Date</th>
                                                                                        <th className="py-2 pr-3">End Date</th>
                                                                                        <th className="py-2 pr-3">Request Segment</th>
                                                                                        <th className="py-2 pr-3">Account Type</th>
                                                                                        <th className="py-2 pr-3">Total Revenue</th>
                                                                                    </tr>
                                                                                </thead>
                                                                                <tbody>
                                                                                    {row.requests.map((req: any) => (
                                                                                        <tr key={req.id} className="border-t" style={{ borderColor: colors.border }}>
                                                                                            <td className="py-2 pr-3" style={{ color: colors.textMain }}>{req.requestName}</td>
                                                                                            <td className="py-2 pr-3" style={{ color: colors.textMuted }}>{req.startDate || '—'}</td>
                                                                                            <td className="py-2 pr-3" style={{ color: colors.textMuted }}>{req.endDate || '—'}</td>
                                                                                            <td className="py-2 pr-3" style={{ color: colors.textMain }}>{req.requestSegment || '—'}</td>
                                                                                            <td className="py-2 pr-3" style={{ color: colors.textMain }}>{req.accountType || '—'}</td>
                                                                                            <td className="py-2 pr-3 font-mono" style={{ color: colors.primary }}>{formatMoney(req.revenue)}</td>
                                                                                        </tr>
                                                                                    ))}
                                                                                </tbody>
                                                                            </table>
                                                                        </td>
                                                                    </tr>
                                                                )}
                                                            </React.Fragment>
                                                        );
                                                    })}
                                                    {stageRows.length === 0 && (
                                                        <tr className="border-t" style={{ borderColor: colors.border }}>
                                                            <td colSpan={3} className="px-4 py-6 text-center text-xs" style={{ color: colors.textMuted }}>
                                                                No accounts in {stageCfg.label} for this period.
                                                            </td>
                                                        </tr>
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        <div className="flex justify-end gap-2 pt-1">
                            <button
                                type="button"
                                className="px-3 py-2 rounded border text-[10px] font-bold uppercase tracking-wide"
                                style={{ borderColor: colors.border, color: colors.textMain }}
                                onClick={exportDashboardExcel}
                            >
                                Export Excel
                            </button>
                            <button
                                type="button"
                                className="px-3 py-2 rounded border text-[10px] font-bold uppercase tracking-wide"
                                style={{ borderColor: colors.border, color: colors.textMain }}
                                onClick={exportDashboardPdf}
                            >
                                Export PDF
                            </button>
                        </div>
                    </div>
                ) : currentView === 'list' ? (
                    <div className="flex-1 rounded-xl border overflow-hidden flex flex-col" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                        <div className="shrink-0 flex flex-wrap items-center justify-end gap-2 px-4 py-2 border-b" style={{ borderColor: colors.border, backgroundColor: colors.bg }}>
                            <button
                                type="button"
                                onClick={() => setListSortNewestFirst((v) => !v)}
                                className="text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-lg border transition-colors"
                                style={{
                                    borderColor: colors.border,
                                    color: colors.textMain,
                                    backgroundColor: listSortNewestFirst ? colors.primary + '28' : 'transparent',
                                }}
                            >
                                {listSortNewestFirst ? 'Oldest → Newest' : 'Newest → Oldest'}
                            </button>
                        </div>
                        <div className="overflow-y-auto h-full scrollbar-thin flex-1 min-h-0">
                            <table className="w-full text-left border-collapse">
                                <thead className="sticky top-0 z-10 text-[10px] uppercase tracking-wider font-semibold" style={{ backgroundColor: colors.bg, color: colors.textMuted, borderBottom: `1px solid ${colors.border}` }}>
                                    <tr>
                                        <th className="px-6 py-4">Company / Client</th>
                                        <th className="px-6 py-4">Contact Person</th>
                                        <th className="px-6 py-4">Current Stage</th>
                                        <th className="px-6 py-4">Valuation</th>
                                        <th className="px-6 py-4">Prob.</th>
                                        <th className="px-6 py-4">Date</th>
                                        <th className="px-6 py-4 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="text-xs">
                                    {listSortedLeads.map((lead: any) => {
                                        const stage = stages.find(s => crmLeads[s.id as keyof typeof crmLeads].some((l: any) => l.id === lead.id));
                                        return (
                                            <tr key={lead.id}
                                                onClick={() => openLeadProfile(lead)}
                                                className="transition-all hover:bg-white/5 cursor-pointer border-b last:border-0"
                                                style={{ borderColor: colors.border }}
                                            >
                                                <td className="px-6 py-4 font-bold" style={{ color: colors.textMain }}>{lead.company}</td>
                                                <td className="px-6 py-4" style={{ color: colors.textMuted }}>
                                                    <div>{lead.contact}</div>
                                                    <div className="text-[10px] opacity-70">{lead.position}</div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className="px-2 py-1 rounded text-[10px] font-bold uppercase"
                                                        style={{ backgroundColor: `${stage?.color}20`, color: stage?.color }}>
                                                        {stage?.title}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 font-mono font-bold" style={{ color: colors.primary }}>{formatSarCompact(lead.value)}</td>
                                                <td className="px-6 py-4" style={{ color: colors.textMuted }}>{lead.probability}%</td>
                                                <td className="px-6 py-4" style={{ color: colors.textMuted }}>{lead.lastContact}</td>
                                                <td className="px-6 py-4 text-right relative" onClick={(e) => e.stopPropagation()}>
                                                    <div className="inline-block text-left" data-crm-list-menu>
                                                        <button
                                                            type="button"
                                                            className="p-1.5 hover:bg-white/10 rounded transition-colors"
                                                            style={{ color: colors.textMuted }}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                crmMenuAnchorRef.current = e.currentTarget as HTMLElement;
                                                                setListMenuLeadId((id) => (id === lead.id ? null : lead.id));
                                                            }}
                                                            aria-expanded={listMenuLeadId === lead.id}
                                                            aria-label="Sales call actions"
                                                        >
                                                            <MoreVertical size={16} />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                ) : (
                    <div className="flex-1 flex flex-col min-h-0 gap-1.5">
                        <div className="shrink-0 flex items-center justify-end gap-1 px-0.5">
                            <button
                                type="button"
                                aria-label="Scroll pipeline left"
                                className="p-1.5 rounded-lg border transition-colors hover:bg-white/10 disabled:opacity-30"
                                style={{ borderColor: colors.border, color: colors.textMain }}
                                onClick={() => {
                                    const el = pipelineBoardScrollRef.current;
                                    if (!el) return;
                                    el.scrollBy({ left: -Math.max(280, Math.floor(el.clientWidth * 0.55)), behavior: 'smooth' });
                                }}
                            >
                                <ChevronLeft size={18} />
                            </button>
                            <button
                                type="button"
                                aria-label="Scroll pipeline right"
                                className="p-1.5 rounded-lg border transition-colors hover:bg-white/10 disabled:opacity-30"
                                style={{ borderColor: colors.border, color: colors.textMain }}
                                onClick={() => {
                                    const el = pipelineBoardScrollRef.current;
                                    if (!el) return;
                                    el.scrollBy({ left: Math.max(280, Math.floor(el.clientWidth * 0.55)), behavior: 'smooth' });
                                }}
                            >
                                <ChevronRight size={18} />
                            </button>
                        </div>
                        <div ref={pipelineBoardScrollRef} className="flex-1 min-h-0 overflow-x-auto flex gap-4 pb-1 scrollbar-thin">
                        {stages.map((stage) => (
                            <div key={stage.id} className="w-80 shrink-0 flex flex-col rounded-xl border overflow-hidden"
                                style={{ backgroundColor: colors.card, borderColor: colors.border }}
                                onDragOver={(e) => e.preventDefault()}
                                onDrop={(e) => {
                                    e.preventDefault();
                                    if (crmReadOnly) return;
                                    if (draggedLead && draggedLead.stage !== stage.id) {
                                        const oldStage = draggedLead.stage;
                                        const prob = probabilityForStage(String(stage.id));
                                        const clearFollowUpOnStage =
                                            String(stage.id) === 'notInterested' || String(stage.id) === 'won';
                                        const moved = {
                                            ...draggedLead,
                                            probability: prob,
                                            propertyId: activeProperty?.id || draggedLead.propertyId,
                                            ...(clearFollowUpOnStage
                                                ? { followUpRequired: false, followUpDate: '' }
                                                : {}),
                                        };
                                        setCrmLeads({
                                            ...crmLeads,
                                            [oldStage]: crmLeads[oldStage as keyof typeof crmLeads].filter((l: any) => l.id !== draggedLead.id),
                                            [stage.id]: [...crmLeads[stage.id as keyof typeof crmLeads], moved]
                                        });
                                        appendCrmActivityToAccount(
                                            moved.accountId,
                                            'Pipeline stage changed',
                                            `${currentUser?.name || currentUser?.username || 'User'} moved this opportunity from ${stageTitle(String(oldStage))} to ${stageTitle(String(stage.id))}.\n` +
                                                `Probability updated to ${prob}%.\nCompany: ${moved.company || '—'}`
                                        );
                                        setDraggedLead(null);
                                    }
                                }}
                            >
                                <div className="p-3 border-b-4 flex justify-between items-center"
                                    style={{ borderColor: colors.border, borderBottomColor: stage.color, backgroundColor: colors.bg }}>
                                    <span className="font-bold uppercase text-xs tracking-wider" style={{ color: colors.textMain }}>{stage.title}</span>
                                    <span className="text-xs px-2 py-0.5 rounded font-bold" style={{ backgroundColor: `${stage.color}20`, color: stage.color }}>
                                        {crmLeadsForDisplay[stage.id as keyof typeof crmLeadsForDisplay]?.length || 0}
                                    </span>
                                </div>
                                <div className="flex-1 overflow-y-auto p-3 space-y-3">
                                    {crmLeadsForDisplay[stage.id as keyof typeof crmLeadsForDisplay]?.map((lead: any) => (
                                        <div key={lead.id}
                                            draggable={!crmReadOnly}
                                            onDragStart={() => {
                                                if (crmReadOnly) return;
                                                ignoreNextPipelineCardClickIdRef.current = String(lead.id);
                                                setDraggedLead({ ...lead, stage: stage.id });
                                            }}
                                            onDragEnd={() => {
                                                setDraggedLead(null);
                                                const id = String(lead.id);
                                                window.setTimeout(() => {
                                                    if (ignoreNextPipelineCardClickIdRef.current === id) {
                                                        ignoreNextPipelineCardClickIdRef.current = null;
                                                    }
                                                }, 280);
                                            }}
                                            onClick={() => {
                                                if (ignoreNextPipelineCardClickIdRef.current === String(lead.id)) {
                                                    ignoreNextPipelineCardClickIdRef.current = null;
                                                    return;
                                                }
                                                openLeadProfile(lead);
                                            }}
                                            className="p-4 rounded-lg border hover:shadow-xl hover:scale-[1.02] hover:-translate-y-1 transition-all cursor-pointer group animate-in fade-in slide-in-from-bottom-2 duration-300 relative"
                                            style={{ backgroundColor: colors.bg, borderColor: colors.border }}>

                                            <div className="flex justify-between items-start gap-2 mb-2">
                                                <div className="min-w-0 flex-1">
                                                    <h4 className="font-bold text-sm mb-1" style={{ color: colors.textMain }}>{lead.company}</h4>
                                                    <p className="text-xs" style={{ color: colors.textMuted }}>{lead.contact} • {lead.position}</p>
                                                </div>
                                                <div className="shrink-0 relative" data-crm-list-menu onClick={(e) => e.stopPropagation()}>
                                                    <button
                                                        type="button"
                                                        className="p-1.5 rounded-md border opacity-70 hover:opacity-100 hover:bg-white/10 transition-all"
                                                        style={{ color: colors.textMuted, borderColor: colors.border }}
                                                        title="Actions"
                                                        aria-expanded={listMenuLeadId === lead.id}
                                                        aria-label="Sales call actions"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            crmMenuAnchorRef.current = e.currentTarget as HTMLElement;
                                                            setListMenuLeadId((id) => (id === lead.id ? null : lead.id));
                                                        }}
                                                    >
                                                        <MoreHorizontal size={16} />
                                                    </button>
                                                </div>
                                            </div>

                                            <div className="flex flex-wrap gap-1 mb-3" key={tagColorTick}>
                                                {(lead.tags || []).map((tag: string, tidx: number) => {
                                                    const tc = getTagColor(tag, colors.primary);
                                                    return (
                                                        <span key={`${tag}-${tidx}`} className="px-2 py-0.5 rounded text-[10px] font-medium"
                                                            style={{ backgroundColor: `${tc}28`, color: tc }}>
                                                            {tag}
                                                        </span>
                                                    );
                                                })}
                                            </div>

                                            {crmLeadHasScheduledFollowUp(lead) ? (
                                                <div className="flex justify-end mb-2">
                                                    <span
                                                        className="px-2 py-0.5 rounded text-[10px] font-bold"
                                                        style={{ backgroundColor: `${colors.orange}28`, color: colors.orange }}
                                                    >
                                                        Follow up · {String(lead.followUpDate).trim()}
                                                    </span>
                                                </div>
                                            ) : null}

                                            <div className="flex justify-between items-center text-xs mb-2">
                                                <span style={{ color: colors.textMuted }}>{lead.probability}% probability</span>
                                                <span className="font-bold font-mono" style={{ color: colors.primary }}>{formatSarCompact(lead.value)}</span>
                                            </div>

                                            <div className="pt-2 border-t text-xs flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5" style={{ borderColor: colors.border, color: colors.textMuted }}>
                                                <span>
                                                    Date: {String(lead.lastContact || lead.date || '').trim() || '—'}
                                                </span>
                                                <span className="truncate text-right max-w-[55%]" style={{ color: colors.textMain }}>
                                                    {String(lead.accountManager || lead.ownerUserId || '').trim() || '—'}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                        </div>
                    </div>
                )}
            </div>
            {/* Add Sales Call Modal */}
            {showAddCallModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
                    <div className="w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 border"
                        style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                        <div className="p-4 border-b flex justify-between items-center" style={{ borderColor: colors.border }}>
                            <h2 className="text-lg font-bold" style={{ color: colors.textMain }}>Add Sales Call</h2>
                            <button
                                onClick={() => {
                                    setShowAddContactPersonModal(false);
                                    setShowAddCallModal(false);
                                }}
                                className="p-2 hover:bg-white/5 rounded-full"
                                style={{ color: colors.textMuted }}
                            >
                                <X size={20} />
                            </button>
                        </div>
                        <div className="p-6 space-y-4 max-h-[80vh] overflow-y-auto custom-scrollbar text-left">
                            {/* Account Name Search */}
                            <div className="relative">
                                <label className="text-[10px] uppercase font-bold tracking-wider mb-1.5 block" style={{ color: colors.textMuted }}>Account Name</label>
                                <div className="flex gap-2">
                                    <div className="relative flex-1" ref={crmAccountComboRef}>
                                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: colors.textMuted }} />
                                        <input
                                            type="text"
                                            placeholder="Search account..."
                                            value={accountSearch}
                                            onChange={(e) => {
                                                setAccountSearch(e.target.value);
                                                setShowAccountDropdown(true);
                                            }}
                                            onFocus={() => setShowAccountDropdown(true)}
                                            className="w-full pl-9 pr-4 py-2 rounded-lg border text-sm outline-none focus:ring-2"
                                            style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain, '--tw-ring-color': colors.primary + '30' } as any}
                                        />
                                        {showAccountDropdown && (
                                            <div className="absolute top-full left-0 right-0 mt-1 rounded-lg border shadow-xl z-10 max-h-48 overflow-y-auto" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                                                {accounts.filter(a => a.name.toLowerCase().includes(accountSearch.toLowerCase())).map(a => (
                                                    <button
                                                        key={a.id}
                                                        onClick={() => {
                                                            const ac = Array.isArray(a.contacts) ? a.contacts : [];
                                                            setNewCallData({
                                                                ...newCallData,
                                                                accountId: a.id,
                                                                accountName: a.name,
                                                                selectedContactIndex: ac.length ? 0 : -1,
                                                            });
                                                            setAccountSearch(a.name);
                                                            setShowAccountDropdown(false);
                                                        }}
                                                        className="w-full text-left px-4 py-2 text-sm hover:bg-white/5 border-b last:border-0"
                                                        style={{ color: colors.textMain, borderColor: colors.border }}
                                                    >
                                                        {a.name}
                                                    </button>
                                                ))}
                                                {accounts.filter(a => a.name.toLowerCase().includes(accountSearch.toLowerCase())).length === 0 && (
                                                    <div className="px-4 py-3 text-xs italic" style={{ color: colors.textMuted }}>No accounts found</div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                    <button
                                        onClick={() => setShowAddAccountModal(true)}
                                        className="p-2 rounded-lg transition-transform hover:scale-110 active:scale-90 shadow-md"
                                        style={{ backgroundColor: colors.primary, color: '#000' }}
                                        title="Create New Account"
                                    >
                                        <Plus size={20} />
                                    </button>
                                </div>
                            </div>

                            {newCallData.accountId ? (
                                <div>
                                    <label className="text-[10px] uppercase font-bold tracking-wider mb-1.5 block" style={{ color: colors.textMuted }}>Contact person</label>
                                    <div className="flex gap-2">
                                        <select
                                            value={
                                                (() => {
                                                    const acc = accounts.find((x: any) => x.id === newCallData.accountId);
                                                    const n = Array.isArray(acc?.contacts) ? acc.contacts.length : 0;
                                                    if (!n) return '';
                                                    const v = Math.min(
                                                        Math.max(0, Math.floor(Number(newCallData.selectedContactIndex) || 0)),
                                                        n - 1
                                                    );
                                                    return String(v);
                                                })()
                                            }
                                            onChange={(e) =>
                                                setNewCallData({
                                                    ...newCallData,
                                                    selectedContactIndex: parseInt(e.target.value, 10) || 0,
                                                })
                                            }
                                            disabled={
                                                !accounts.find((x: any) => x.id === newCallData.accountId)?.contacts?.length
                                            }
                                            className="flex-1 px-3 py-2 rounded-lg border text-sm outline-none"
                                            style={{
                                                backgroundColor: colors.bg,
                                                borderColor: colors.border,
                                                color: colors.textMain,
                                                opacity: accounts.find((x: any) => x.id === newCallData.accountId)?.contacts?.length
                                                    ? 1
                                                    : 0.6,
                                            }}
                                        >
                                            {(() => {
                                                const acc = accounts.find((x: any) => x.id === newCallData.accountId);
                                                const list = Array.isArray(acc?.contacts) ? acc.contacts : [];
                                                if (!list.length) {
                                                    return <option value="">No contacts yet — use + to add</option>;
                                                }
                                                return list.map((c: any, i: number) => (
                                                    <option key={i} value={i}>
                                                        {contactDisplayName(c) || '—'}
                                                        {c?.position ? ` · ${c.position}` : ''}
                                                    </option>
                                                ));
                                            })()}
                                        </select>
                                        <button
                                            type="button"
                                            onClick={() => setShowAddContactPersonModal(true)}
                                            className="shrink-0 p-2 rounded-lg transition-transform hover:scale-110 active:scale-90 shadow-md"
                                            style={{ backgroundColor: colors.primary, color: '#000' }}
                                            title="Add contact person to this account"
                                        >
                                            <Plus size={20} />
                                        </button>
                                    </div>
                                </div>
                            ) : null}

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[10px] uppercase font-bold tracking-wider mb-1.5 block" style={{ color: colors.textMuted }}>Call Date</label>
                                    <input type="date" value={newCallData.date} onChange={e => setNewCallData({ ...newCallData, date: e.target.value })} className="w-full px-3 py-2 rounded-lg border text-sm" style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }} />
                                </div>
                                <div>
                                    <label className="text-[10px] uppercase font-bold tracking-wider mb-1.5 block" style={{ color: colors.textMuted }}>City</label>
                                    <input type="text" placeholder="e.g. Riyadh" value={newCallData.city} onChange={e => setNewCallData({ ...newCallData, city: e.target.value })} className="w-full px-3 py-2 rounded-lg border text-sm" style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }} />
                                </div>
                            </div>

                            <div>
                                <label className="text-[10px] uppercase font-bold tracking-wider mb-1.5 block" style={{ color: colors.textMuted }}>Meeting Subject</label>
                                <select value={newCallData.subject} onChange={e => setNewCallData({ ...newCallData, subject: e.target.value })} className="w-full px-3 py-2 rounded-lg border text-sm" style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }}>
                                    <option value="">Select Subject...</option>
                                    <option>Initial Meeting</option>
                                    <option>Proposal Discussion</option>
                                    <option>Contract Negotiation</option>
                                    <option>Site Visit</option>
                                    <option>Follow-up Call</option>
                                    <option>General Inquiry</option>
                                </select>
                            </div>

                            <div>
                                <label className="text-[10px] uppercase font-bold tracking-wider mb-1.5 block" style={{ color: colors.textMuted }}>{`Expected revenue (${selectedCurrency})`}</label>
                                <input
                                    type="number"
                                    min={0}
                                    step={1000}
                                    placeholder="e.g. 150000"
                                    value={newCallData.expectedRevenue}
                                    onChange={(e) => setNewCallData({ ...newCallData, expectedRevenue: e.target.value })}
                                    className="w-full px-3 py-2 rounded-lg border text-sm"
                                    style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }}
                                />
                            </div>

                            <div>
                                <label className="text-[10px] uppercase font-bold tracking-wider mb-1.5 block" style={{ color: colors.textMuted }}>Description</label>
                                <textarea rows={2} value={newCallData.description} onChange={e => setNewCallData({ ...newCallData, description: e.target.value })} className="w-full px-3 py-2 rounded-lg border text-sm" style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }} placeholder="Summary of the call..." />
                            </div>

                            <div>
                                <label className="text-[10px] uppercase font-bold tracking-wider mb-1.5 block" style={{ color: colors.textMuted }}>Initial pipeline stage</label>
                                <select value={newCallData.status} onChange={e => setNewCallData({ ...newCallData, status: e.target.value })} className="w-full px-3 py-2 rounded-lg border text-sm" style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }}>
                                    {stages.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
                                </select>
                                <p className="text-[10px] mt-1" style={{ color: colors.textMuted }}>
                                    Card probability will start at {probabilityForStage(newCallData.status)}% for this stage (updates when you move the card).
                                </p>
                            </div>

                            <div>
                                <label className="text-[10px] uppercase font-bold tracking-wider mb-1.5 block" style={{ color: colors.textMuted }}>Next Step Description</label>
                                <textarea rows={2} value={newCallData.nextStep} onChange={e => setNewCallData({ ...newCallData, nextStep: e.target.value })} className="w-full px-3 py-2 rounded-lg border text-sm" style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }} placeholder="What needs to happen next?" />
                            </div>

                            <div className="flex items-center gap-6 p-3 rounded-xl border bg-white/5" style={{ borderColor: colors.border }}>
                                <div className="flex items-center gap-2 cursor-pointer select-none" onClick={() => setNewCallData({ ...newCallData, followUpRequired: !newCallData.followUpRequired })}>
                                    <div className={`w-5 h-5 rounded border-2 transition-all flex items-center justify-center ${newCallData.followUpRequired ? 'bg-primary' : ''}`} style={{ borderColor: newCallData.followUpRequired ? colors.primary : colors.border, backgroundColor: newCallData.followUpRequired ? colors.primary : 'transparent' }}>
                                        {newCallData.followUpRequired && <Check size={14} color="#000" strokeWidth={4} />}
                                    </div>
                                    <span className="text-xs font-bold" style={{ color: colors.textMain }}>Follow up Required</span>
                                </div>
                                {newCallData.followUpRequired && (
                                    <div className="flex-1 animate-in slide-in-from-left-2 duration-200">
                                        <input type="date" value={newCallData.followUpDate} onChange={e => setNewCallData({ ...newCallData, followUpDate: e.target.value })} className="w-full px-3 py-1.5 rounded-lg border text-sm" style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }} />
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="p-4 border-t flex gap-3" style={{ borderColor: colors.border }}>
                            <button
                                onClick={() => {
                                    setShowAddContactPersonModal(false);
                                    setShowAddCallModal(false);
                                }}
                                className="flex-1 py-2.5 rounded-xl border font-bold text-sm hover:bg-white/5 transition-colors"
                                style={{ borderColor: colors.border, color: colors.textMuted }}
                            >
                                Cancel
                            </button>
                            <button onClick={handleSaveCall} className="flex-1 py-2.5 rounded-xl font-bold text-sm hover:brightness-110 active:scale-95 transition-all" style={{ backgroundColor: colors.primary, color: '#000' }}>Save Sales Call</button>
                        </div>
                    </div>
                </div>
            )}

            {showAddContactPersonModal && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
                    <div
                        className="w-full max-w-md p-6 rounded-2xl shadow-2xl animate-in zoom-in-95 duration-200 border"
                        style={{ backgroundColor: colors.card, borderColor: colors.primary + '40' }}
                    >
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-lg font-bold" style={{ color: colors.textMain }}>Add Contact Person</h3>
                            <button
                                type="button"
                                onClick={() => setShowAddContactPersonModal(false)}
                                className="hover:opacity-80 transition-opacity"
                                style={{ color: colors.textMuted }}
                            >
                                <X size={20} />
                            </button>
                        </div>
                        <div className="space-y-4 text-left">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs font-bold uppercase tracking-wider mb-2 block" style={{ color: colors.textMuted }}>First Name</label>
                                    <input
                                        type="text"
                                        value={newContactPersonForm.firstName}
                                        onChange={(e) => setNewContactPersonForm({ ...newContactPersonForm, firstName: e.target.value })}
                                        className="w-full p-3 rounded-lg border bg-black/20 outline-none focus:border-primary transition-colors text-sm"
                                        style={{ borderColor: colors.border, color: colors.textMain }}
                                        placeholder="First Name"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-bold uppercase tracking-wider mb-2 block" style={{ color: colors.textMuted }}>Last Name</label>
                                    <input
                                        type="text"
                                        value={newContactPersonForm.lastName}
                                        onChange={(e) => setNewContactPersonForm({ ...newContactPersonForm, lastName: e.target.value })}
                                        className="w-full p-3 rounded-lg border bg-black/20 outline-none focus:border-primary transition-colors text-sm"
                                        style={{ borderColor: colors.border, color: colors.textMain }}
                                        placeholder="Last Name"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="text-xs font-bold uppercase tracking-wider mb-2 block" style={{ color: colors.textMuted }}>Position</label>
                                <input
                                    type="text"
                                    value={newContactPersonForm.position}
                                    onChange={(e) => setNewContactPersonForm({ ...newContactPersonForm, position: e.target.value })}
                                    className="w-full p-3 rounded-lg border bg-black/20 outline-none focus:border-primary transition-colors text-sm"
                                    style={{ borderColor: colors.border, color: colors.textMain }}
                                    placeholder="Job Title"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-bold uppercase tracking-wider mb-2 block" style={{ color: colors.textMuted }}>Email</label>
                                <input
                                    type="email"
                                    value={newContactPersonForm.email}
                                    onChange={(e) => setNewContactPersonForm({ ...newContactPersonForm, email: e.target.value })}
                                    className="w-full p-3 rounded-lg border bg-black/20 outline-none focus:border-primary transition-colors text-sm"
                                    style={{ borderColor: colors.border, color: colors.textMain }}
                                    placeholder="email@example.com"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-bold uppercase tracking-wider mb-2 block" style={{ color: colors.textMuted }}>Phone</label>
                                <input
                                    type="text"
                                    value={newContactPersonForm.phone}
                                    onChange={(e) => setNewContactPersonForm({ ...newContactPersonForm, phone: e.target.value })}
                                    className="w-full p-3 rounded-lg border bg-black/20 outline-none focus:border-primary transition-colors text-sm"
                                    style={{ borderColor: colors.border, color: colors.textMain }}
                                    placeholder="+966 ..."
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs font-bold uppercase tracking-wider mb-2 block" style={{ color: colors.textMuted }}>City</label>
                                    <input
                                        type="text"
                                        value={newContactPersonForm.city}
                                        onChange={(e) => setNewContactPersonForm({ ...newContactPersonForm, city: e.target.value })}
                                        className="w-full p-3 rounded-lg border bg-black/20 outline-none focus:border-primary transition-colors text-sm"
                                        style={{ borderColor: colors.border, color: colors.textMain }}
                                        placeholder="City"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-bold uppercase tracking-wider mb-2 block" style={{ color: colors.textMuted }}>Country</label>
                                    <input
                                        type="text"
                                        value={newContactPersonForm.country}
                                        onChange={(e) => setNewContactPersonForm({ ...newContactPersonForm, country: e.target.value })}
                                        className="w-full p-3 rounded-lg border bg-black/20 outline-none focus:border-primary transition-colors text-sm"
                                        style={{ borderColor: colors.border, color: colors.textMain }}
                                        placeholder="Country"
                                    />
                                </div>
                            </div>
                            <div className="pt-4 flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => setShowAddContactPersonModal(false)}
                                    className="flex-1 py-3 rounded-lg font-bold text-sm border transition-colors"
                                    style={{ borderColor: colors.border, color: colors.textMuted }}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={saveNewContactPersonToAccount}
                                    className="flex-1 py-3 rounded-lg font-bold text-black hover:opacity-90 transition-opacity"
                                    style={{ backgroundColor: colors.primary }}
                                >
                                    Save Contact
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {showEditCallModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
                    <div className="w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 border"
                        style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                        <div className="p-4 border-b flex justify-between items-center" style={{ borderColor: colors.border }}>
                            <h2 className="text-lg font-bold" style={{ color: colors.textMain }}>Edit sales call</h2>
                            <button
                                type="button"
                                onClick={() => {
                                    setShowEditCallModal(false);
                                    editSnapshotRef.current = null;
                                }}
                                className="p-2 hover:bg-white/5 rounded-full"
                                style={{ color: colors.textMuted }}
                            >
                                <X size={20} />
                            </button>
                        </div>
                        <div className="p-6 space-y-4 max-h-[80vh] overflow-y-auto custom-scrollbar text-left">
                            <div>
                                <label className="text-[10px] uppercase font-bold tracking-wider mb-1.5 block" style={{ color: colors.textMuted }}>Account</label>
                                <input
                                    type="text"
                                    readOnly
                                    value={editCallForm.accountName}
                                    className="w-full px-3 py-2 rounded-lg border text-sm opacity-80 cursor-not-allowed"
                                    style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[10px] uppercase font-bold tracking-wider mb-1.5 block" style={{ color: colors.textMuted }}>Last contact</label>
                                    <input
                                        type="date"
                                        value={editCallForm.date}
                                        onChange={(e) => setEditCallForm({ ...editCallForm, date: e.target.value })}
                                        className="w-full px-3 py-2 rounded-lg border text-sm"
                                        style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }}
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] uppercase font-bold tracking-wider mb-1.5 block" style={{ color: colors.textMuted }}>City</label>
                                    <input
                                        type="text"
                                        value={editCallForm.city}
                                        onChange={(e) => setEditCallForm({ ...editCallForm, city: e.target.value })}
                                        className="w-full px-3 py-2 rounded-lg border text-sm"
                                        style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }}
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="text-[10px] uppercase font-bold tracking-wider mb-1.5 block" style={{ color: colors.textMuted }}>Subject / title</label>
                                <input
                                    type="text"
                                    value={editCallForm.subject}
                                    onChange={(e) => setEditCallForm({ ...editCallForm, subject: e.target.value })}
                                    className="w-full px-3 py-2 rounded-lg border text-sm"
                                    style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }}
                                    placeholder="Meeting subject"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] uppercase font-bold tracking-wider mb-1.5 block" style={{ color: colors.textMuted }}>{`Expected revenue (${selectedCurrency})`}</label>
                                <input
                                    type="number"
                                    min={0}
                                    step={1000}
                                    value={editCallForm.expectedRevenue}
                                    onChange={(e) => setEditCallForm({ ...editCallForm, expectedRevenue: e.target.value })}
                                    className="w-full px-3 py-2 rounded-lg border text-sm"
                                    style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }}
                                />
                            </div>
                            <div>
                                <label className="text-[10px] uppercase font-bold tracking-wider mb-1.5 block" style={{ color: colors.textMuted }}>Pipeline stage</label>
                                <select
                                    value={editCallForm.status}
                                    onChange={(e) => setEditCallForm({ ...editCallForm, status: e.target.value })}
                                    className="w-full px-3 py-2 rounded-lg border text-sm"
                                    style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }}
                                >
                                    {stages.map((s) => (
                                        <option key={s.id} value={s.id}>{s.title}</option>
                                    ))}
                                </select>
                                <p className="text-[10px] mt-1" style={{ color: colors.textMuted }}>
                                    Saving will set probability to {probabilityForStage(editCallForm.status)}% for this stage.
                                </p>
                            </div>
                            <div>
                                <label className="text-[10px] uppercase font-bold tracking-wider mb-1.5 block" style={{ color: colors.textMuted }}>Description</label>
                                <textarea
                                    rows={2}
                                    value={editCallForm.description}
                                    onChange={(e) => setEditCallForm({ ...editCallForm, description: e.target.value })}
                                    className="w-full px-3 py-2 rounded-lg border text-sm"
                                    style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }}
                                />
                            </div>
                            <div>
                                <label className="text-[10px] uppercase font-bold tracking-wider mb-1.5 block" style={{ color: colors.textMuted }}>Next step</label>
                                <textarea
                                    rows={2}
                                    value={editCallForm.nextStep}
                                    onChange={(e) => setEditCallForm({ ...editCallForm, nextStep: e.target.value })}
                                    className="w-full px-3 py-2 rounded-lg border text-sm"
                                    style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }}
                                />
                            </div>
                            <div className="flex items-center gap-6 p-3 rounded-xl border bg-white/5" style={{ borderColor: colors.border }}>
                                <div
                                    className="flex items-center gap-2 cursor-pointer select-none"
                                    onClick={() => setEditCallForm({ ...editCallForm, followUpRequired: !editCallForm.followUpRequired })}
                                >
                                    <div
                                        className="w-5 h-5 rounded border-2 transition-all flex items-center justify-center"
                                        style={{
                                            borderColor: editCallForm.followUpRequired ? colors.primary : colors.border,
                                            backgroundColor: editCallForm.followUpRequired ? colors.primary : 'transparent'
                                        }}
                                    >
                                        {editCallForm.followUpRequired && <Check size={14} color="#000" strokeWidth={4} />}
                                    </div>
                                    <span className="text-xs font-bold" style={{ color: colors.textMain }}>Follow up required</span>
                                </div>
                                {editCallForm.followUpRequired && (
                                    <div className="flex-1">
                                        <input
                                            type="date"
                                            value={editCallForm.followUpDate}
                                            onChange={(e) => setEditCallForm({ ...editCallForm, followUpDate: e.target.value })}
                                            className="w-full px-3 py-1.5 rounded-lg border text-sm"
                                            style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }}
                                        />
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="p-4 border-t flex gap-3" style={{ borderColor: colors.border }}>
                            <button
                                type="button"
                                onClick={() => {
                                    setShowEditCallModal(false);
                                    editSnapshotRef.current = null;
                                }}
                                className="flex-1 py-2.5 rounded-xl border font-bold text-sm hover:bg-white/5 transition-colors"
                                style={{ borderColor: colors.border, color: colors.textMuted }}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={saveEditedSalesCall}
                                className="flex-1 py-2.5 rounded-xl font-bold text-sm hover:brightness-110 active:scale-95 transition-all"
                                style={{ backgroundColor: colors.primary, color: '#000' }}
                            >
                                Save changes
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <AddAccountModal
                isOpen={showAddAccountModal}
                onClose={() => setShowAddAccountModal(false)}
                onSave={handleSaveAccount}
                theme={theme}
                accountTypeOptions={accountTypeOptions}
                duplicateCheckAccounts={accountsSameProperty}
                duplicateCheckPropertyId={activeProperty?.id ? String(activeProperty.id) : undefined}
                configurationProperty={activeProperty || undefined}
                configurationPropertyId={activeProperty?.id ? String(activeProperty.id) : undefined}
            />
        </div>
        {listMenuLeadId && crmMenuLead && crmMenuDropPos
            ? createPortal(
                  <div
                      data-crm-list-menu
                      className="min-w-[220px] rounded-xl border shadow-xl py-1"
                      style={{
                          position: 'fixed',
                          top: crmMenuDropPos.top,
                          right: crmMenuDropPos.right,
                          zIndex: 100000,
                          backgroundColor: colors.card,
                          borderColor: colors.border,
                      }}
                  >
                      {!crmReadOnly && (
                          <button
                              type="button"
                              className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-xs font-medium hover:bg-white/5"
                              style={{ color: colors.textMain }}
                              onClick={() => openEditSalesCallModal(crmMenuLead)}
                          >
                              <Edit size={14} /> Edit sales call
                          </button>
                      )}
                      {!crmReadOnly && (
                          <button
                              type="button"
                              className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-xs font-medium hover:bg-white/5"
                              style={{ color: colors.textMain }}
                              onClick={() => duplicateSalesCallByLead(crmMenuLead)}
                          >
                              <Copy size={14} /> Duplicate sales call
                          </button>
                      )}
                      <button
                          type="button"
                          className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-xs font-medium hover:bg-white/5"
                          style={{ color: colors.textMain }}
                          onClick={() => {
                              setListMenuLeadId(null);
                              openLeadProfile(crmMenuLead);
                          }}
                      >
                          <UserCircle size={14} /> Open account profile
                      </button>
                      {canDelSalesCalls && (
                          <>
                              <div className="my-1 h-px" style={{ backgroundColor: colors.border }} />
                              <button
                                  type="button"
                                  className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-xs font-medium text-red-500 hover:bg-red-500/10"
                                  onClick={() => deleteSalesCallByLead(crmMenuLead)}
                              >
                                  <Trash2 size={14} /> Delete sales call
                              </button>
                          </>
                      )}
                  </div>,
                  document.body
              )
            : null}
        </>
    );
}
