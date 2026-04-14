import React, { useState, useMemo, useEffect } from 'react';
import { Search, Plus, Building2 } from 'lucide-react';
import CRMProfileView from './CRMProfileView';
import AddAccountModal from './AddAccountModal';
import { accountToLead, leadToAccount, contactDisplayName } from './accountLeadMapping';
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
    filterOpenOpportunityLeads
} from './accountProfileData';
import {
    isAccountsPageReadOnly,
    canDeleteAccounts,
    canDeleteContracts,
    canManageManualTimeline,
    isSystemAdmin,
} from './userPermissions';
import type { CurrencyCode } from './currency';
import { apiUrl } from './backendApi';
import ConfirmDialog from './ConfirmDialog';
import { resolveUserAttributionId } from './userProfileMetrics';

const COLUMN_STORAGE_KEY = 'visatour_accounts_column_order_v1';
const DEFAULT_COLUMN_ORDER = ['name', 'segment', 'city', 'contact', 'phone', 'email'];

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
}: AccountsPageProps) {
    const colors = theme.colors;
    const profileReadOnly = isAccountsPageReadOnly(currentUser);
    const allowDeleteAccount = canDeleteAccounts(currentUser);
    const allowDeleteContracts = canDeleteContracts(currentUser);
    const allowManualTimeline = canManageManualTimeline(currentUser);
    const allowTagAdmin = isSystemAdmin(currentUser);
    const [search, setSearch] = useState('');
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
        email: 'Email'
    };

    const filtered = useMemo(() => {
        const t = search.trim().toLowerCase();
        if (!t) return accounts;
        return accounts.filter((a: any) => {
            const c0 = (a.contacts && a.contacts[0]) || {};
            const hay = [a.name, a.type, a.city, contactDisplayName(c0), c0.firstName, c0.lastName, c0.phone, c0.email]
                .map((x) => String(x || '').toLowerCase())
                .join(' ');
            return hay.includes(t);
        });
    }, [accounts, search]);

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
            <div className="shrink-0 p-6 border-b flex flex-wrap items-center justify-between gap-4" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                <div>
                    <h1 className="text-2xl font-bold" style={{ color: colors.textMain }}>Accounts</h1>
                    <p className="text-sm" style={{ color: colors.textMuted }}>{accounts.length} accounts</p>
                </div>
                <div className="flex items-center gap-3 flex-1 justify-end min-w-[200px]">
                    <div className="relative flex-1 max-w-md">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 opacity-40" style={{ color: colors.textMuted }} />
                        <input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search accounts..."
                            className="w-full pl-10 pr-4 py-2 rounded-xl border text-sm outline-none"
                            style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }}
                        />
                    </div>
                    {!profileReadOnly && (
                        <button
                            type="button"
                            onClick={() => setShowAddModal(true)}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm whitespace-nowrap"
                            style={{ backgroundColor: colors.primary, color: '#000' }}
                        >
                            <Plus size={18} /> New account
                        </button>
                    )}
                </div>
            </div>

            <div className="flex-1 overflow-auto p-6 min-h-0">
                {!filtered.length ? (
                    <div className="flex flex-col items-center justify-center py-20 text-center" style={{ color: colors.textMuted }}>
                        <Building2 size={48} className="opacity-20 mb-4" />
                        <p className="font-bold">No accounts yet</p>
                        <p className="text-sm mt-1">Create an account or adjust your search.</p>
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
                            {filtered.map((a: any) => (
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
            />
        </div>
    );
}
