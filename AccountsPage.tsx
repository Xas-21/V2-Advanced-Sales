import React, { useState, useMemo, useEffect } from 'react';
import { Search, Plus, Building2 } from 'lucide-react';
import CRMProfileView from './CRMProfileView';
import AddAccountModal from './AddAccountModal';
import { accountToLead, leadToAccount, contactDisplayName } from './accountLeadMapping';
import { resolveAccountTypesForProperty } from './propertyTaxonomy';
import {
    CONTRACTS_CHANGED_EVENT,
    attachSignedContractFile,
    deleteContractRecord,
    downloadContractArtifact,
    getContractRecords,
    triggerBlobDownload,
    updateContractRecordMeta,
    updateContractRecordStatus,
    type ContractRecord,
    type ContractStatus,
} from './contractsStore';
import {
    flattenCrmLeads,
    filterRequestsForAccount,
    filterSalesCallsForAccount,
    filterOpenOpportunityLeads,
} from './accountProfileData';
import { computeRequestRevenueBreakdownNoTax } from './operationalSegmentRevenue';
import { formatCompactCurrency } from './formatCompactCurrency';
import {
    isAccountsPageReadOnly,
    canDeleteAccounts,
    canDeleteContracts,
    canManageManualTimeline,
    isSystemAdmin,
    canMergeAccountsAndAssignOwner,
} from './userPermissions';
import type { CurrencyCode } from './currency';

export type AccountPerfDateRange = { from: string; to: string };
import { apiUrl } from './backendApi';
import ConfirmDialog from './ConfirmDialog';
import { resolveUserAttributionId } from './userProfileMetrics';
import { applyAccountMergeInMemory, persistAccountMergeToBackend } from './accountMergeUtils';
import { repointContractRecordsForAccountMerge } from './contractsStore';

const COLUMN_STORAGE_KEY = 'visatour_accounts_column_order_v2';
const DEFAULT_COLUMN_ORDER = ['name', 'segment', 'city', 'contact', 'phone', 'email', 'totalRev', 'totalReq'];

type AccountsListSort = 'name_az' | 'rev_high' | 'rev_low';

interface AccountsPageProps {
    theme: any;
    accounts: any[];
    setAccounts: React.Dispatch<React.SetStateAction<any[]>>;
    sharedRequests: any[];
    crmLeads: Record<string, any[]>;
    currentUser: any;
    onOpenRequest: (requestId: string) => void;
    onNavigateToCrmWithAccount: (accountId: string) => void;
    onNavigateToContractsWithAccount?: (accountId: string) => void;
    setCrmLeads: React.Dispatch<React.SetStateAction<Record<string, any[]>>>;
    accountTypeOptions?: string[];
    currency?: CurrencyCode;
    activeProperty?: any;
    /** Controlled from AS shell header when viewing an account profile. */
    shellAccountPerformanceRange: AccountPerfDateRange;
    onShellAccountPerformanceRangeChange: (r: AccountPerfDateRange) => void;
    onAccountProfileShellStateChange?: (state: { open: boolean; leadKey: string | null }) => void;
    setSharedRequests: React.Dispatch<React.SetStateAction<any[]>>;
    assignableUsersForAccounts?: { id: string; name: string }[];
}

export default function AccountsPage({
    theme,
    accounts,
    setAccounts,
    sharedRequests,
    crmLeads,
    currentUser,
    onOpenRequest,
    onNavigateToCrmWithAccount,
    onNavigateToContractsWithAccount,
    setCrmLeads,
    accountTypeOptions,
    currency = 'SAR',
    activeProperty,
    shellAccountPerformanceRange,
    onShellAccountPerformanceRangeChange,
    onAccountProfileShellStateChange,
    setSharedRequests,
    assignableUsersForAccounts = [],
}: AccountsPageProps) {
    const colors = theme.colors;
    const profileReadOnly = isAccountsPageReadOnly(currentUser);
    const allowDeleteAccount = canDeleteAccounts(currentUser);
    const allowDeleteContracts = canDeleteContracts(currentUser);
    const allowManualTimeline = canManageManualTimeline(currentUser);
    const allowTagAdmin = isSystemAdmin(currentUser);
    const allowAccountMergeAndOwner = canMergeAccountsAndAssignOwner(currentUser);
    const [search, setSearch] = useState('');
    const [listSort, setListSort] = useState<AccountsListSort>('name_az');
    const [cityFilter, setCityFilter] = useState('');
    const [segmentFilter, setSegmentFilter] = useState('');
    const [filterWithContract, setFilterWithContract] = useState(false);
    const [filterWithoutContract, setFilterWithoutContract] = useState(false);
    const [profileLead, setProfileLead] = useState<any | null>(null);
    const [showAddModal, setShowAddModal] = useState(false);
    const [showEditAccountModal, setShowEditAccountModal] = useState(false);
    const [editingAccountRow, setEditingAccountRow] = useState<any | null>(null);
    const flatCrmLeads = useMemo(() => flattenCrmLeads(crmLeads), [crmLeads]);
    const [columnOrder, setColumnOrder] = useState<string[]>(() => {
        try {
            const raw = localStorage.getItem(COLUMN_STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed) && parsed.length) return parsed;
            }
        } catch { /* ignore */ }
        return [...DEFAULT_COLUMN_ORDER];
    });
    const [draggedColumn, setDraggedColumn] = useState<string | null>(null);
    const [accountContracts, setAccountContracts] = useState<ContractRecord[]>([]);
    const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
    const [pendingDeleteAccountId, setPendingDeleteAccountId] = useState<string | null>(null);
    const [deleteImpactMessage, setDeleteImpactMessage] = useState('');

    useEffect(() => {
        try {
            localStorage.setItem(COLUMN_STORAGE_KEY, JSON.stringify(columnOrder));
        } catch { /* ignore */ }
    }, [columnOrder]);

    useEffect(() => {
        onAccountProfileShellStateChange?.({
            open: !!profileLead,
            leadKey: profileLead ? String(profileLead.accountId || profileLead.id || '') : null,
        });
    }, [profileLead, onAccountProfileShellStateChange]);

    useEffect(() => {
        const refresh = () => setAccountContracts(getContractRecords());
        refresh();
        window.addEventListener(CONTRACTS_CHANGED_EVENT, refresh);
        return () => window.removeEventListener(CONTRACTS_CHANGED_EVENT, refresh);
    }, []);

    const columnLabels: Record<string, string> = {
        name: 'Account Name',
        segment: 'Segment',
        city: 'City',
        contact: 'Contact Person',
        phone: 'Phone',
        email: 'Email',
        totalRev: 'Total Rev',
        totalReq: 'Total Req',
    };

    const requestStatsByAccountId = useMemo(() => {
        const m = new Map<string, { revSar: number; reqCount: number }>();
        for (const a of accounts) {
            const id = String(a?.id ?? '');
            if (!id) continue;
            const reqs = filterRequestsForAccount(sharedRequests, id, a?.name);
            let revSar = 0;
            for (const r of reqs) {
                revSar += computeRequestRevenueBreakdownNoTax(r).totalLineNoTax;
            }
            m.set(id, { revSar, reqCount: reqs.length });
        }
        return m;
    }, [accounts, sharedRequests]);

    const segmentFilterOptions = useMemo(() => {
        const fromProp =
            Array.isArray(accountTypeOptions) && accountTypeOptions.length
                ? accountTypeOptions
                : resolveAccountTypesForProperty(String(activeProperty?.id || ''), activeProperty);
        return [...new Set(fromProp.map((x) => String(x).trim()).filter(Boolean))].sort((a, b) =>
            a.localeCompare(b)
        );
    }, [accountTypeOptions, activeProperty]);

    const accountIdsWithContract = useMemo(() => {
        const set = new Set<string>();
        for (const c of accountContracts) {
            const aid = String(c.accountId || '').trim();
            if (aid) set.add(aid);
        }
        return set;
    }, [accountContracts]);

    const filtered = useMemo(() => {
        const t = search.trim().toLowerCase();
        const cityQ = cityFilter.trim().toLowerCase();
        const contractNarrow = filterWithContract !== filterWithoutContract;

        return accounts.filter((a: any) => {
            if (t) {
                const c0 = (a.contacts && a.contacts[0]) || {};
                const hay = [a.name, a.type, a.city, contactDisplayName(c0), c0.firstName, c0.lastName, c0.phone, c0.email]
                    .map((x) => String(x || '').toLowerCase())
                    .join(' ');
                if (!hay.includes(t)) return false;
            }
            if (cityQ) {
                if (!String(a.city || '').toLowerCase().includes(cityQ)) return false;
            }
            if (segmentFilter) {
                if (String(a.type || '').trim() !== segmentFilter) return false;
            }
            if (contractNarrow) {
                const has = accountIdsWithContract.has(String(a.id));
                if (filterWithContract && !filterWithoutContract) return has;
                if (filterWithoutContract && !filterWithContract) return !has;
            }
            return true;
        });
    }, [
        accounts,
        search,
        cityFilter,
        segmentFilter,
        filterWithContract,
        filterWithoutContract,
        accountIdsWithContract,
    ]);

    const accountsSameProperty = useMemo(() => {
        const pid = String(activeProperty?.id || '').trim();
        if (!pid) return accounts;
        return accounts.filter((a: any) => {
            const p = String(a?.propertyId || '').trim();
            return !p || p === 'P-GLOBAL' || p === pid;
        });
    }, [accounts, activeProperty?.id]);

    const sortedFiltered = useMemo(() => {
        const rows = [...filtered];
        const stat = (id: string) => requestStatsByAccountId.get(String(id)) || { revSar: 0, reqCount: 0 };
        if (listSort === 'name_az') {
            rows.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' }));
        } else if (listSort === 'rev_high') {
            rows.sort((a, b) => stat(b.id).revSar - stat(a.id).revSar || String(a.name || '').localeCompare(String(b.name || '')));
        } else if (listSort === 'rev_low') {
            rows.sort((a, b) => stat(a.id).revSar - stat(b.id).revSar || String(a.name || '').localeCompare(String(b.name || '')));
        }
        return rows;
    }, [filtered, listSort, requestStatsByAccountId]);

    const handleColumnDragStart = (column: string) => setDraggedColumn(column);
    const handleColumnDrop = (targetColumn: string) => {
        if (!draggedColumn || draggedColumn === targetColumn) return;
        const newOrder = [...columnOrder];
        const di = newOrder.indexOf(draggedColumn);
        const ti = newOrder.indexOf(targetColumn);
        newOrder.splice(di, 1);
        newOrder.splice(ti, 0, draggedColumn);
        setColumnOrder(newOrder);
        setDraggedColumn(null);
    };

    const handleSaveNew = (accountData: any) => {
        if (!accountData?.name) return;
        const u = currentUser?.name || currentUser?.username || currentUser?.email || 'User';
        const act = {
            id: `acct-${Date.now()}`,
            at: new Date().toISOString(),
            title: 'Account created',
            body: 'Account created from Accounts.',
            user: u,
        };
        setAccounts((prev: any[]) => [
            {
                id: `A${Date.now()}`,
                ...accountData,
                propertyId: accountData.propertyId || activeProperty?.id || 'P-GLOBAL',
                createdByUserId: resolveUserAttributionId(currentUser) || undefined,
                accountOwnerName: u,
                activities: [...(accountData.activities || []), act],
            },
            ...prev,
        ]);
        setShowAddModal(false);
    };

    const syncAccountFromLead = (lead: any) => {
        const aid = lead.accountId || lead.id;
        setAccounts((prev: any[]) =>
            prev.map((a: any) => (a.id === aid ? leadToAccount(lead, a) : a))
        );
        if (Array.isArray(lead.tags) && aid) {
            setCrmLeads((prev) => {
                const out = { ...prev } as Record<string, any[]>;
                (Object.keys(out) as string[]).forEach((k) => {
                    out[k] = (out[k] || []).map((l: any) =>
                        l.accountId === aid ? { ...l, tags: lead.tags } : l
                    );
                });
                return out;
            });
        }
    };

    const handleMergeAccountIntoCurrent = async (sourceAccountId: string) => {
        if (!profileLead) return;
        const destId = String(profileLead.accountId || profileLead.id || '');
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
        setSharedRequests(applied.nextRequests);
        setCrmLeads(applied.nextCrmLeads);
        repointContractRecordsForAccountMerge(
            String(sourceAccountId),
            destId,
            String(applied.mergedAccount.name || '')
        );
        setProfileLead(accountToLead(applied.mergedAccount));
        appendProfileAudit(
            'Accounts merged',
            `Merged duplicate account "${String(
                accounts.find((a: any) => String(a.id) === String(sourceAccountId))?.name || sourceAccountId
            )}" into this profile.`
        );
    };

    const handleAssignAccountOwner = (userId: string, ownerDisplayName: string) => {
        if (!profileLead) return;
        const destId = String(profileLead.accountId || profileLead.id || '');
        setAccounts((prev: any[]) => {
            const next = prev.map((a: any) =>
                String(a.id) === destId
                    ? { ...a, createdByUserId: userId, accountOwnerName: ownerDisplayName }
                    : a
            );
            const acc = next.find((a: any) => String(a.id) === destId);
            if (acc) setProfileLead(accountToLead(acc));
            return next;
        });
    };

    const appendProfileAudit = (action: string, details: string) => {
        if (!profileLead) return;
        const accountId = profileLead.accountId || profileLead.id;
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
        setProfileLead((prev: any) =>
            prev ? { ...prev, profileAuditLog: [...(prev.profileAuditLog || []), entry] } : prev
        );
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
            setProfileLead(null);
        } catch {
            alert('Failed to delete account.');
        } finally {
            setConfirmDeleteOpen(false);
            setPendingDeleteAccountId(null);
            setDeleteImpactMessage('');
        }
    };

    const cellFor = (col: string, a: any) => {
        const c0 = (a.contacts && a.contacts[0]) || {};
        switch (col) {
            case 'name':
                return <span className="font-bold text-sm" style={{ color: colors.textMain }}>{a.name}</span>;
            case 'segment':
                return <span className="text-sm" style={{ color: colors.textMain }}>{a.type || '-'}</span>;
            case 'city':
                return <span className="text-sm" style={{ color: colors.textMain }}>{a.city || '-'}</span>;
            case 'contact':
                return <span className="text-sm" style={{ color: colors.textMain }}>{contactDisplayName(c0) || '-'}</span>;
            case 'phone':
                return <span className="text-sm" style={{ color: colors.textMain }}>{c0.phone || '-'}</span>;
            case 'email':
                return <span className="text-sm break-all" style={{ color: colors.textMain }}>{c0.email || '-'}</span>;
            case 'totalRev': {
                const st = requestStatsByAccountId.get(String(a.id)) || { revSar: 0, reqCount: 0 };
                return (
                    <span className="text-sm font-mono tabular-nums" style={{ color: colors.textMain }}>
                        {formatCompactCurrency(st.revSar, currency)}
                    </span>
                );
            }
            case 'totalReq': {
                const st = requestStatsByAccountId.get(String(a.id)) || { revSar: 0, reqCount: 0 };
                return (
                    <span className="text-sm font-mono tabular-nums" style={{ color: colors.textMain }}>
                        {st.reqCount}
                    </span>
                );
            }
            default:
                return null;
        }
    };

    if (profileLead) {
        const aid = profileLead.accountId || profileLead.id;
        const aname = profileLead.company;
        const linkedReq = filterRequestsForAccount(sharedRequests, aid, aname);
        const salesForAcc = filterSalesCallsForAccount(flatCrmLeads, aid, aname);
        const oppLeads = filterOpenOpportunityLeads(flatCrmLeads, aid, aname);
        const contractsForAccount = accountContracts.filter((c) => String(c.accountId || '') === String(aid));
        return (
            <>
                <CRMProfileView
                    lead={profileLead}
                    theme={theme}
                    onClose={() => setProfileLead(null)}
                    onLeadChange={(next) => {
                        setProfileLead(next);
                        syncAccountFromLead(next);
                    }}
                    linkedRequests={linkedReq}
                    salesCalls={salesForAcc}
                    opportunityLeads={oppLeads}
                    currentUser={currentUser}
                    onOpenRequest={onOpenRequest}
                    onAddOpportunity={
                        profileReadOnly ? undefined : () => onNavigateToCrmWithAccount(String(aid))
                    }
                    onEditAccount={
                        profileReadOnly
                            ? undefined
                            : () => {
                                  const row = accounts.find((a: any) => a.id === aid) || null;
                                  setEditingAccountRow(row);
                                  setShowEditAccountModal(true);
                              }
                    }
                    readOnly={profileReadOnly}
                    canDeleteAccount={allowDeleteAccount}
                    canManageManualTimeline={allowManualTimeline}
                    canManageAccountTags={allowTagAdmin}
                    appendAuditLog={appendProfileAudit}
                    accountContracts={contractsForAccount}
                    onUpdateContractStatus={(contractId: string, status: ContractStatus) =>
                        updateContractRecordStatus(contractId, status)
                    }
                    onUpdateContractMeta={(contractId: string, patch: { startDate?: string; endDate?: string }) =>
                        updateContractRecordMeta(contractId, patch)
                    }
                    onUploadSignedContract={async (contractId: string, file: File) => {
                        await attachSignedContractFile(contractId, file);
                    }}
                    onDownloadContractFile={(contractId: string, kind: 'word' | 'pdf' | 'signed') => {
                        const c = accountContracts.find((x) => x.id === contractId);
                        if (!c) return;
                        const f = downloadContractArtifact(c, kind);
                        if (!f) return;
                        triggerBlobDownload(f.blob, f.fileName);
                    }}
                    onStartNewContractForAccount={() => onNavigateToContractsWithAccount?.(String(aid))}
                    canDeleteContractRecords={allowDeleteContracts}
                    onDeleteContractRecord={(contractId: string) => {
                        deleteContractRecord(contractId);
                    }}
                    currency={currency}
                    onDeleteAccount={
                        allowDeleteAccount
                            ? () => openAccountDeleteConfirm(String(aid))
                            : undefined
                    }
                    shellAccountPerformanceRange={shellAccountPerformanceRange}
                    onShellAccountPerformanceRangeChange={onShellAccountPerformanceRangeChange}
                    canMergeAccountsAndAssignOwner={allowAccountMergeAndOwner}
                    accountOwnerUserOptions={assignableUsersForAccounts}
                    allAccountsForMergeSearch={accountsSameProperty}
                    onMergeAccountIntoCurrent={
                        allowAccountMergeAndOwner ? handleMergeAccountIntoCurrent : undefined
                    }
                    onAssignAccountOwner={allowAccountMergeAndOwner ? handleAssignAccountOwner : undefined}
                />
                <AddAccountModal
                    isOpen={showEditAccountModal}
                    onClose={() => {
                        setShowEditAccountModal(false);
                        setEditingAccountRow(null);
                    }}
                    editingAccount={editingAccountRow}
                    theme={theme}
                    accountTypeOptions={accountTypeOptions}
                    configurationPropertyId={activeProperty?.id ? String(activeProperty.id) : undefined}
                    onSave={(data: any) => {
                        if (!data?.id) return;
                        const merged = { ...(accounts.find((a: any) => a.id === data.id) || {}), ...data };
                        setAccounts((prev: any[]) => prev.map((a: any) => (a.id === data.id ? merged : a)));
                        setProfileLead(accountToLead(merged));
                        appendProfileAudit('Account updated', 'Account details saved from edit modal');
                        setShowEditAccountModal(false);
                        setEditingAccountRow(null);
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

    return (
        <div className="h-full flex flex-col overflow-hidden" style={{ backgroundColor: colors.bg }}>
            <div className="shrink-0 pt-3 px-4 sm:px-6 pb-4 border-b" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,auto)_1fr_minmax(0,auto)] gap-x-4 gap-y-3 items-start">
                    <div className="shrink-0 pt-0.5">
                        <h1 className="text-2xl font-bold" style={{ color: colors.textMain }}>Accounts</h1>
                        <p className="text-sm" style={{ color: colors.textMuted }}>
                            {sortedFiltered.length === accounts.length
                                ? `${accounts.length} accounts`
                                : `${sortedFiltered.length} of ${accounts.length} accounts`}
                        </p>
                    </div>
                    <div className="flex flex-col items-center gap-2.5 w-full min-w-0 max-w-3xl justify-self-center lg:px-2">
                    <h2
                        className="w-full text-center text-sm font-bold uppercase tracking-widest"
                        style={{ color: colors.primary }}
                    >
                        Filter
                    </h2>
                    <div className="relative w-full max-w-md">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 opacity-40" style={{ color: colors.textMuted }} />
                        <input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search accounts..."
                            className="w-full pl-10 pr-4 py-2 rounded-xl border text-sm outline-none"
                            style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }}
                        />
                    </div>
                    <div className="flex flex-wrap items-end justify-center gap-4 w-full">
                        <div className="flex flex-col gap-1 w-full min-w-[8rem] max-w-[14rem]">
                            <label className="text-[10px] font-bold uppercase tracking-wider opacity-60 text-center" style={{ color: colors.textMuted }}>City</label>
                            <input
                                value={cityFilter}
                                onChange={(e) => setCityFilter(e.target.value)}
                                placeholder="Filter by city…"
                                className="w-full px-3 py-2 rounded-xl border text-sm outline-none"
                                style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }}
                            />
                        </div>
                        <div className="flex flex-col gap-1 w-full min-w-[8rem] max-w-[14rem]">
                            <label className="text-[10px] font-bold uppercase tracking-wider opacity-60 text-center" style={{ color: colors.textMuted }}>Segment</label>
                            <select
                                value={segmentFilter}
                                onChange={(e) => setSegmentFilter(e.target.value)}
                                className="w-full px-3 py-2 rounded-xl border text-sm outline-none"
                                style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }}
                            >
                                <option value="">All segments</option>
                                {segmentFilterOptions.map((s) => (
                                    <option key={s} value={s}>{s}</option>
                                ))}
                            </select>
                        </div>
                        <div className="flex flex-col gap-1 w-full min-w-[10rem] max-w-[16rem]">
                            <label className="text-[10px] font-bold uppercase tracking-wider opacity-60 text-center" style={{ color: colors.textMuted }}>Order</label>
                            <select
                                value={listSort}
                                onChange={(e) => setListSort(e.target.value as AccountsListSort)}
                                className="w-full px-3 py-2 rounded-xl border text-sm outline-none"
                                style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }}
                            >
                                <option value="name_az">A–Z (name)</option>
                                <option value="rev_high">Highest Rev</option>
                                <option value="rev_low">Lowest Rev</option>
                            </select>
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center justify-center gap-6">
                        <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: colors.textMain }}>
                            <input
                                type="checkbox"
                                checked={filterWithContract}
                                onChange={(e) => setFilterWithContract(e.target.checked)}
                                className="rounded border"
                                style={{ borderColor: colors.border }}
                            />
                            With contract
                        </label>
                        <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: colors.textMain }}>
                            <input
                                type="checkbox"
                                checked={filterWithoutContract}
                                onChange={(e) => setFilterWithoutContract(e.target.checked)}
                                className="rounded border"
                                style={{ borderColor: colors.border }}
                            />
                            Without contract
                        </label>
                    </div>
                    </div>
                    <div className="shrink-0 flex justify-start lg:justify-end pt-0.5 w-full lg:w-auto">
                    {!profileReadOnly && (
                        <button
                            type="button"
                            onClick={() => setShowAddModal(true)}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm whitespace-nowrap w-full sm:w-auto justify-center"
                            style={{ backgroundColor: colors.primary, color: '#000' }}
                        >
                            <Plus size={18} /> New account
                        </button>
                    )}
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-auto p-6 min-h-0">
                {!sortedFiltered.length ? (
                    <div className="flex flex-col items-center justify-center py-20 text-center" style={{ color: colors.textMuted }}>
                        <Building2 size={48} className="opacity-20 mb-4" />
                        <p className="font-bold">{accounts.length ? 'No matching accounts' : 'No accounts yet'}</p>
                        <p className="text-sm mt-1">Create an account or adjust your search and filters.</p>
                    </div>
                ) : (
                    <table className="w-full text-left border-separate border-spacing-y-3">
                        <thead>
                            <tr>
                                {columnOrder.map((column) => (
                                    <th
                                        key={column}
                                        draggable={!profileReadOnly}
                                        onDragStart={() => !profileReadOnly && handleColumnDragStart(column)}
                                        onDragOver={(e) => e.preventDefault()}
                                        onDrop={() => !profileReadOnly && handleColumnDrop(column)}
                                        className={`px-6 py-2 text-[11px] font-bold uppercase tracking-wider opacity-60 ${profileReadOnly ? '' : 'cursor-move'}`}
                                        style={{ color: colors.textMain }}
                                    >
                                        {columnLabels[column]}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {sortedFiltered.map((a: any) => (
                                <tr
                                    key={a.id}
                                    onClick={() => setProfileLead(accountToLead(a))}
                                    className="cursor-pointer group transition-all duration-300 hover:translate-y-[-2px]"
                                >
                                    {columnOrder.map((column, colIdx) => {
                                        const isFirst = colIdx === 0;
                                        const isLast = colIdx === columnOrder.length - 1;
                                        return (
                                            <td
                                                key={column}
                                                className={`py-4 px-6 border-y ${isFirst ? 'border-l rounded-l-2xl' : ''} ${isLast ? 'border-r rounded-r-2xl' : ''}`}
                                                style={{
                                                    backgroundColor: colors.card,
                                                    borderColor: colors.border,
                                                    boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
                                                    borderLeft: isFirst ? `4px solid ${colors.primary}` : `1px solid ${colors.border}`
                                                }}
                                            >
                                                {cellFor(column, a)}
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            <AddAccountModal
                isOpen={showAddModal}
                onClose={() => setShowAddModal(false)}
                onSave={handleSaveNew}
                theme={theme}
                accountTypeOptions={accountTypeOptions}
                duplicateCheckAccounts={accountsSameProperty}
                duplicateCheckPropertyId={activeProperty?.id ? String(activeProperty.id) : undefined}
                configurationPropertyId={activeProperty?.id ? String(activeProperty.id) : undefined}
            />
        </div>
    );
}
