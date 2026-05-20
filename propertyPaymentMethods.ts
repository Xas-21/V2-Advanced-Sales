/** Per-property payment method labels for request deposits.
 *  Canonical source: property record (`paymentMethods` string array). */

import { apiUrl } from './backendApi';

export const DEFAULT_PAYMENT_METHODS = [
    'Cash',
    'Bank Transfer',
    'Credit Card',
    'Cheque',
    'Point of Sale',
];

export const PAYMENT_METHODS_CHANGED_EVENT = 'visatour-payment-methods-changed';

const LS_PREFIX = 'visatour_property_payment_methods_v1::';

function storageKey(propertyId: string) {
    return `${LS_PREFIX}${String(propertyId || '').trim()}`;
}

function postPropertyPatch(payload: Record<string, unknown>) {
    fetch(apiUrl('/api/properties'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    }).catch(() => {});
}

function dispatchChanged(propertyId: string, paymentMethods: string[]) {
    try {
        window.dispatchEvent(
            new CustomEvent(PAYMENT_METHODS_CHANGED_EVENT, {
                detail: { propertyId, paymentMethods },
            })
        );
    } catch {
        /* ignore */
    }
}

export function normalizePaymentMethods(input: unknown): string[] {
    if (!Array.isArray(input)) return [];
    return [
        ...new Set(
            input
                .map((x) => (typeof x === 'string' ? x.trim() : String(x ?? '').trim()))
                .filter(Boolean)
        ),
    ];
}

export function resolvePaymentMethodsForProperty(
    propertyId: string,
    property?: { paymentMethods?: unknown } | null
): string[] {
    if (!propertyId) return [...DEFAULT_PAYMENT_METHODS];
    if (property && Array.isArray((property as any).paymentMethods)) {
        const n = normalizePaymentMethods((property as any).paymentMethods);
        if (n.length) return n;
    }
    try {
        const raw = localStorage.getItem(storageKey(propertyId));
        if (raw) {
            const n = normalizePaymentMethods(JSON.parse(raw));
            if (n.length) return n;
        }
    } catch {
        /* ignore */
    }
    return [...DEFAULT_PAYMENT_METHODS];
}

export function defaultPaymentMethodForProperty(
    propertyId: string,
    property?: { paymentMethods?: unknown } | null
): string {
    return resolvePaymentMethodsForProperty(propertyId, property)[0] || DEFAULT_PAYMENT_METHODS[0];
}

/** Persist to API, localStorage, and broadcast for open request forms. */
export function savePaymentMethodsForProperty(propertyId: string, methods: unknown[]): void {
    const pid = String(propertyId || '').trim();
    if (!pid) return;
    let clean = normalizePaymentMethods(methods);
    if (!clean.length) clean = [...DEFAULT_PAYMENT_METHODS];
    try {
        localStorage.setItem(storageKey(pid), JSON.stringify(clean));
    } catch {
        /* ignore */
    }
    dispatchChanged(pid, clean);
    postPropertyPatch({ id: pid, paymentMethods: clean });
}
