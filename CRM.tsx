import React, { useState, useEffect, useMemo, useRef, useLayoutEffect } from 'react';
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
import { apiUrl } from './backendApi';
import ConfirmDialog from './ConfirmDialog';
import { resolveUserAttributionId, crmLeadAttributedToUser } from './userProfileMetrics';
import { applyAccountMergeInMemory } from './accountMergeUtils';
import { collectSalesCallFormViolations } from './formConfigurations';
import { repointContractRecordsForAccountMerge } from './contractsStore';
import { createPortal } from 'react-dom';

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
    externalView?: 'pipeline' | 'list';
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
    /** YYYY-MM: filter pipeline/list by `lastContact` / `date` in that month. */
    visibleMonth?: string;
    currency?: CurrencyCode;
    /** Property staff (id + display name) for “created by” pipeline/list filter. */
    crmFilterUsers?: { id: string; name: string }[];
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
    visibleMonth,
    currency = 'SAR',
    crmFilterUsers,
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
    const [currentView, setCurrentView] = useState<'pipeline' | 'list' | 'profile'>('pipeline');

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
        const ym = String(visibleMonth || '').trim();
        if (!ym || ym.length < 7) return crmLeads;
        const match = (l: any) => {
            const raw = String(l.lastContact || l.date || '').trim();
            return raw.length >= 7 && raw.slice(0, 7) === ym.slice(0, 7);
        };
        const out: Record<string, any[]> = { ...crmLeads };
        (Object.keys(out) as string[]).forEach((k) => {
            out[k] = (out[k] || []).filter(match);
        });
        return out;
    }, [crmLeads, visibleMonth]);

    const [createdByUserFilterId, setCreatedByUserFilterId] = useState('');

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
        const cfgViol = collectSalesCallFormViolations(activeProperty?.id, newCallData);
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

    const handleCrmMergeAccountIntoCurrent = (sourceAccountId: string) => {
        if (!selectedLead) return;
        const destId = String(selectedLead.accountId || selectedLead.id || '');
        const applied = applyAccountMergeInMemory({
            accounts,
            sharedRequests,
            crmLeads,
            destAccountId: destId,
            sourceAccountId,
        });
        if (!applied) return;
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
            {/* Header */}
            <div className="shrink-0 p-4 pt-3 pb-4 border-b" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                <div className="flex justify-between items-center mb-3">
                    <div>
                        <h1 className="text-xl font-bold" style={{ color: colors.textMain }}>Summary</h1>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        {(crmFilterUsers || []).length > 0 && (
                            <select
                                value={createdByUserFilterId}
                                onChange={(e) => setCreatedByUserFilterId(e.target.value)}
                                className="text-sm font-bold px-3 py-2 rounded-lg border outline-none min-w-[11rem] max-w-[16rem] truncate scale-90"
                                style={{
                                    backgroundColor: colors.bg,
                                    borderColor: colors.border,
                                    color: colors.textMain,
                                }}
                                aria-label="Filter sales calls by creator"
                                title="Show only sales calls created by this user"
                            >
                                <option value="">All users</option>
                                {(crmFilterUsers || []).map((u) => (
                                    <option key={u.id} value={u.id}>
                                        {u.name}
                                    </option>
                                ))}
                            </select>
                        )}
                        {!crmReadOnly && (
                            <button
                                onClick={() => setShowAddCallModal(true)}
                                className="px-4 py-2 rounded font-bold flex items-center gap-2 shadow-lg scale-90"
                                style={{ backgroundColor: colors.primary, color: '#000' }}
                            >
                                <Plus size={18} /> Add Sales Call
                            </button>
                        )}
                    </div>
                </div>

                {/* Stats Row */}
                <div className="grid grid-cols-4 gap-3 animate-in fade-in slide-in-from-bottom-2 duration-500">
                    <div className="p-3 rounded-xl border transition-all duration-300 hover:scale-[1.05] hover:shadow-lg" style={{ backgroundColor: colors.bg, borderColor: colors.border }}>
                        <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: colors.textMuted }}>Total Calls</p>
                        <p className="text-2xl font-bold" style={{ color: colors.textMain }}>{totalLeads}</p>
                    </div>
                    <div className="p-3 rounded-xl border transition-all duration-300 hover:scale-[1.05] hover:shadow-lg" style={{ backgroundColor: colors.bg, borderColor: colors.border }}>
                        <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: colors.textMuted }}>High Potential Client</p>
                        <p className="text-2xl font-bold font-mono" style={{ color: colors.primary }}>{highPotentialCount}</p>
                    </div>
                    <div className="p-3 rounded-xl border transition-all duration-300 hover:scale-[1.05] hover:shadow-lg" style={{ backgroundColor: colors.bg, borderColor: colors.border }}>
                        <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: colors.textMuted }}>Follow up Required</p>
                        <p className="text-2xl font-bold font-mono" style={{ color: colors.orange }}>{followUpRequiredCount}</p>
                    </div>
                    <div className="p-3 rounded-xl border transition-all duration-300 hover:scale-[1.05] hover:shadow-lg" style={{ backgroundColor: colors.bg, borderColor: colors.border }}>
                        <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: colors.textMuted }}>Conversion Rate</p>
                        <p className="text-2xl font-bold" style={{ color: colors.green }}>{(((crmLeadsForDisplay.won?.length || 0) / (totalLeads || 1)) * 100).toFixed(0)}%</p>
                    </div>
                </div>
            </div>

            {/* Pipeline or List Content */}
            <div className="flex-1 overflow-hidden flex flex-col p-4 pt-2">
                {currentView === 'list' ? (
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
