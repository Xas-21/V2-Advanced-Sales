import React, { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import RequestsManager from './RequestsManager';
import { filterRequestsForAccount } from './accountProfileData';
import type { CurrencyCode } from './currency';

export type AccountLinkedRequestsModalProps = {
    open: boolean;
    onClose: () => void;
    theme: any;
    accountId: string;
    accountName: string;
    sharedRequests: any[];
    activeProperty?: any;
    accounts: any[];
    setAccounts: React.Dispatch<React.SetStateAction<any[]>>;
    onOpenRequest: (requestId: string) => void;
    onAfterRequestsMutate?: () => void;
    currentUser?: any;
    currency?: CurrencyCode;
    segmentOptions?: string[];
    accountTypeOptions?: string[];
    canDeleteRequest?: boolean;
    readOnlyOperational?: boolean;
    promotionOptions?: any[];
    canLinkRequestPromotions?: boolean;
};

export default function AccountLinkedRequestsModal({
    open,
    onClose,
    theme,
    accountId,
    accountName,
    sharedRequests,
    activeProperty,
    accounts,
    setAccounts,
    onOpenRequest,
    onAfterRequestsMutate,
    currentUser,
    currency = 'SAR',
    segmentOptions,
    accountTypeOptions,
    canDeleteRequest,
    readOnlyOperational,
    promotionOptions,
    canLinkRequestPromotions,
}: AccountLinkedRequestsModalProps) {
    const colors = theme.colors;
    const [searchParams, setSearchParams] = useState<Record<string, unknown>>({ subView: 'list' });

    const linkedCount = useMemo(
        () => filterRequestsForAccount(sharedRequests || [], accountId, accountName).length,
        [sharedRequests, accountId, accountName]
    );

    if (!open) return null;

    return (
        <div
            className="fixed inset-0 z-[220] flex flex-col p-3 md:p-4 overflow-hidden"
            style={{ backgroundColor: 'rgba(0,0,0,0.78)' }}
            onClick={onClose}
        >
            <div
                className="mx-auto w-full max-w-[min(96vw,1400px)] flex-1 min-h-0 max-h-full flex flex-col rounded-2xl border overflow-hidden"
                style={{ backgroundColor: colors.bg, borderColor: colors.border, maxHeight: '92vh' }}
                onClick={(e) => e.stopPropagation()}
            >
                <div
                    className="shrink-0 flex items-center justify-between gap-3 px-4 py-3 border-b"
                    style={{ borderColor: colors.border, backgroundColor: colors.card }}
                >
                    <div>
                        <h2 className="text-lg font-bold" style={{ color: colors.textMain }}>
                            Requests — {accountName}
                        </h2>
                        <p className="text-xs" style={{ color: colors.textMuted }}>
                            {linkedCount} linked request{linkedCount === 1 ? '' : 's'} (same list as Request Management)
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-2 rounded-lg border hover:bg-white/5"
                        style={{ borderColor: colors.border, color: colors.textMuted }}
                        aria-label="Close"
                    >
                        <X size={20} />
                    </button>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
                    <RequestsManager
                        key={`acct-req-${accountId}`}
                        theme={theme}
                        subView="list"
                        searchParams={searchParams}
                        setSearchParams={(p: any) => setSearchParams((prev) => ({ ...prev, ...p }))}
                        scopedAccountFilter={{ accountId, accountName }}
                        activeProperty={activeProperty}
                        accounts={accounts}
                        setAccounts={setAccounts}
                        onAfterRequestsMutate={onAfterRequestsMutate}
                        currentUser={currentUser}
                        currency={currency}
                        segmentOptions={segmentOptions}
                        accountTypeOptions={accountTypeOptions}
                        canDeleteRequest={canDeleteRequest}
                        readOnlyOperational={readOnlyOperational}
                        promotionOptions={promotionOptions}
                        canLinkRequestPromotions={canLinkRequestPromotions}
                        pendingOpenRequestId={null}
                        onHeadlessModifyDetails={(requestId) => {
                            onClose();
                            onOpenRequest(requestId);
                        }}
                    />
                </div>
            </div>
        </div>
    );
}
